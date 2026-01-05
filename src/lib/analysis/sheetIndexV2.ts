// ============================================================
// STUDIOCHECK SHEET INDEX v3.0
// Trustworthy extraction: NULL is better than wrong
// Text-first with controlled vision fallbacks
// ============================================================

import { supabase } from '@/integrations/supabase/client';
import type { SheetIndexRow, SheetKind, ExtractionSource } from './types';
import {
  type PxBBox,
  type LabelHit,
  type LabelCluster,
  type AnchoredRegion,
  type ExtractionNotesV3,
  type ExtractionResultV3,
  type ExtractionMeta,
  type TextItemWithPos,
  type CropStrategy,
  detectLabelHits,
  buildClusters,
  selectBestCluster,
  expandClusterBBox,
  extractSheetNumberAnchored,
  extractSheetTitleAnchored,
  validateSheetNumber,
  validateSheetTitle,
  calculateConfidenceV3,
  SHEET_NUMBER_PATTERNS,
} from './sheetIndex';

// ============================================================
// PDF.js types and lazy loading
// ============================================================
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent(): Promise<{ items: TextItem[] }>;
  getViewport(params: { scale: number; rotation?: number }): { width: number; height: number; rotation: number };
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: any }): { promise: Promise<void> };
  rotate: number;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PDFjsLib {
  getDocument(params: { data: ArrayBuffer }): { promise: Promise<PDFDocumentProxy> };
}

let pdfjsLib: PDFjsLib | null = null;

async function getPdfJs(): Promise<PDFjsLib> {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  pdfjsLib = pdfjs as unknown as PDFjsLib;
  return pdfjsLib;
}

// ============================================================
// DISCIPLINE + SHEET KIND INFERENCE
// ============================================================
const DISCIPLINE_MAP: Record<string, string> = {
  'A': 'Architectural', 'S': 'Structural', 'M': 'Mechanical',
  'P': 'Plumbing', 'E': 'Electrical', 'F': 'Fire Protection',
  'FP': 'Fire Protection', 'FA': 'Fire Alarm', 'FS': 'Fire Suppression',
  'C': 'Civil', 'L': 'Landscape', 'LP': 'Landscape',
  'I': 'Interior', 'ID': 'Interior Design', 'G': 'General',
  'T': 'Telecommunications', 'D': 'Demolition', 'EL': 'Electrical',
};

function inferDiscipline(sheetNumber: string | null, sheetTitle: string | null): string | null {
  if (sheetNumber) {
    const prefix2 = sheetNumber.substring(0, 2).toUpperCase();
    if (DISCIPLINE_MAP[prefix2]) return DISCIPLINE_MAP[prefix2];
    const prefix1 = sheetNumber.charAt(0).toUpperCase();
    if (DISCIPLINE_MAP[prefix1]) return DISCIPLINE_MAP[prefix1];
  }
  if (sheetTitle) {
    const upperTitle = sheetTitle.toUpperCase();
    const keywords: Record<string, string> = {
      'MECHANICAL': 'Mechanical', 'HVAC': 'Mechanical', 'ELECTRICAL': 'Electrical',
      'PLUMBING': 'Plumbing', 'STRUCTURAL': 'Structural', 'FIRE': 'Fire Protection',
      'CIVIL': 'Civil', 'SITE': 'Civil', 'LANDSCAPE': 'Landscape',
    };
    for (const [kw, disc] of Object.entries(keywords)) {
      if (upperTitle.includes(kw)) return disc;
    }
  }
  return null;
}

function getDisciplinePrefix(sheetNumber: string | null): string {
  if (!sheetNumber) return 'UNKNOWN';
  const prefix2 = sheetNumber.substring(0, 2).toUpperCase();
  if (DISCIPLINE_MAP[prefix2]) return prefix2;
  const prefix1 = sheetNumber.charAt(0).toUpperCase();
  if (DISCIPLINE_MAP[prefix1]) return prefix1;
  return 'UNKNOWN';
}

function inferSheetKind(sheetTitle: string | null): SheetKind {
  if (!sheetTitle) return 'unknown';
  const upper = sheetTitle.toUpperCase();
  if (upper.includes('SCHEDULE')) return 'schedule';
  if (upper.includes('RCP') || upper.includes('REFLECTED CEILING')) return 'rcp';
  if (upper.includes('DETAIL')) return 'detail';
  if (upper.includes('LEGEND') || upper.includes('ABBREVIATION')) return 'legend';
  if (upper.includes('PLAN') || upper.includes('FLOOR') || upper.includes('ROOF') || upper.includes('SITE')) return 'plan';
  return 'general';
}

// ============================================================
// CANVAS UTILITIES
// ============================================================
function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1];
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to convert canvas to blob')), 'image/png');
  });
}

function clampPxBBox(b: PxBBox, renderW: number, renderH: number): PxBBox {
  const x = Math.max(0, Math.min(renderW - 1, b.x));
  const y = Math.max(0, Math.min(renderH - 1, b.y));
  const w = Math.max(1, Math.min(renderW - x, b.w));
  const h = Math.max(1, Math.min(renderH - y, b.h));
  return { x, y, w, h };
}

function cropByPxBBox(canvas: HTMLCanvasElement, bbox: PxBBox): HTMLCanvasElement {
  const b = clampPxBBox(bbox, canvas.width, canvas.height);
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = b.w;
  cropCanvas.height = b.h;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get crop canvas context');
  ctx.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  return cropCanvas;
}

// ============================================================
// REQ-0: UPRIGHT RENDERING (rotation normalization)
// ============================================================
async function renderSheetUpright(
  page: PDFPageProxy,
  targetWidthPx: number = 2000
): Promise<{
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  renderScale: number;
  rotationApplied: number;
}> {
  // Always render at 0° rotation (upright)
  const pageRotation = page.rotate || 0;
  const normalizedRotation = (360 - pageRotation) % 360;
  
  const viewport1 = page.getViewport({ scale: 1.0, rotation: normalizedRotation });
  const renderScale = targetWidthPx / viewport1.width;
  const viewport = page.getViewport({ scale: renderScale, rotation: normalizedRotation });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  await page.render({ canvasContext: ctx, viewport }).promise;

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    viewportWidth: viewport1.width,
    viewportHeight: viewport1.height,
    renderScale,
    rotationApplied: normalizedRotation,
  };
}

// ============================================================
// VISION EXTRACTION (edge function)
// ============================================================
async function extractWithVision(
  imageBase64: string,
  meta: ExtractionMeta
): Promise<{ sheet_number: string | null; sheet_title: string | null }> {
  try {
    const response = await supabase.functions.invoke('extract-titleblock', {
      body: { image: imageBase64, meta },
    });
    if (response.error) {
      console.error('Vision extraction error:', response.error);
      return { sheet_number: null, sheet_title: null };
    }
    return {
      sheet_number: response.data?.sheet_number || null,
      sheet_title: response.data?.sheet_title || null,
    };
  } catch (error) {
    console.error('Vision extraction failed:', error);
    return { sheet_number: null, sheet_title: null };
  }
}

// ============================================================
// CROP PIPELINE (REQ-3: proportional expansion)
// ============================================================
async function uploadCropAttempt(params: {
  projectId: string;
  jobId: string;
  sourceIndex: number;
  attempt: number;
  cropCanvas: HTMLCanvasElement;
}): Promise<string | null> {
  try {
    const blob = await canvasToBlob(params.cropCanvas);
    const path = `projects/${params.projectId}/jobs/${params.jobId}/sheets/${params.sourceIndex}/crop_attempt_${params.attempt}.png`;
    const { error } = await supabase.storage.from('project-files').upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
    });
    return error ? null : path;
  } catch {
    return null;
  }
}

function buildCropAttempts(params: {
  cluster: LabelCluster | null;
  renderW: number;
  renderH: number;
}): Array<{ strategy: CropStrategy; bbox: PxBBox; label: string }> {
  const { cluster, renderW, renderH } = params;
  const attempts: Array<{ strategy: CropStrategy; bbox: PxBBox; label: string }> = [];

  // Attempt #1: Cluster-based crop (if available)
  if (cluster) {
    const expanded = expandClusterBBox(cluster, renderW, renderH);
    attempts.push({ strategy: 'vector_label', bbox: expanded, label: 'cluster_expanded' });
  } else {
    // Fallback bottom-right 50%
    attempts.push({
      strategy: 'fallback_br',
      bbox: { x: Math.floor(renderW * 0.5), y: Math.floor(renderH * 0.5), w: Math.floor(renderW * 0.5), h: Math.floor(renderH * 0.5) },
      label: 'fallback_br_50',
    });
  }

  // Attempt #2: bottom-right 60%
  attempts.push({
    strategy: 'fallback_br',
    bbox: { x: Math.floor(renderW * 0.4), y: Math.floor(renderH * 0.4), w: Math.floor(renderW * 0.6), h: Math.floor(renderH * 0.6) },
    label: 'fallback_br_60',
  });

  // Attempt #3: bottom strip
  attempts.push({
    strategy: 'fallback_bottom_strip',
    bbox: { x: 0, y: Math.floor(renderH * 0.65), w: renderW, h: Math.floor(renderH * 0.35) },
    label: 'fallback_bottom_strip_35',
  });

  return attempts;
}

// ============================================================
// MAIN EXTRACTION PIPELINE (REQ-7: deterministic fallback chain)
// ============================================================
async function extractSheetV3(params: {
  page: PDFPageProxy;
  sourceIndex: number;
  projectId: string;
  jobId: string;
  visionBudget: { remaining: number };
}): Promise<{
  result: ExtractionResultV3;
  canvas: HTMLCanvasElement;
  crop_asset_path: string | null;
  crop_valid: boolean;
  crop_reason: string;
  crop_strategy: CropStrategy;
  attempt_count: number;
  sheet_render_asset_path: string | null;
  title_block_asset_path: string | null;
}> {
  const startTime = Date.now();
  const fallback_path: string[] = [];
  const notes: ExtractionNotesV3 = { fallback_path };

  // REQ-0: Render upright
  const render = await renderSheetUpright(params.page);
  const { canvas, width: renderW, height: renderH, viewportWidth, viewportHeight, renderScale, rotationApplied } = render;

  if (rotationApplied !== 0) {
    notes.rotation_degrees = rotationApplied;
  }

  // Get text items
  const textContent = await params.page.getTextContent();
  const textItems: TextItemWithPos[] = (textContent.items as TextItem[])
    .map(it => ({
      text: (it.str || '').trim(),
      x: it.transform[4],
      y: it.transform[5],
      width: it.width,
      height: it.height,
    }))
    .filter(it => it.text.length > 0);

  // REQ-1: Detect strong labels
  fallback_path.push('step1_detect_labels');
  const labelHits = detectLabelHits({
    textItems,
    viewportW: viewportWidth,
    viewportH: viewportHeight,
    renderScale,
  });
  notes.label_hits = labelHits;

  // REQ-2: Build clusters
  fallback_path.push('step2_build_clusters');
  const clusters = buildClusters(labelHits);
  const selectedCluster = selectBestCluster(clusters);
  
  notes.clusters = clusters.map((c, i) => ({
    bbox: c.bbox,
    score: c.score,
    members: c.members.map(m => m.text),
    why_selected: c === selectedCluster ? c.why_selected : undefined,
  }));
  if (selectedCluster) {
    notes.selected_cluster_index = clusters.indexOf(selectedCluster);
  }

  // Build crop attempts
  const cropAttempts = buildCropAttempts({ cluster: selectedCluster, renderW, renderH });
  const attempt_paths: string[] = [];

  let sheet_number: string | null = null;
  let sheet_title: string | null = null;
  let extraction_source: ExtractionSource = 'unknown';
  let anchored_extraction = false;
  let has_both_labels_in_cluster = selectedCluster?.has_number_label && selectedCluster?.has_title_label || false;
  let truncation_suspected = false;
  let crop_valid = false;
  let crop_reason = '';
  let crop_strategy: CropStrategy = 'unknown';
  let attempt_count = 0;
  let chosenCropCanvas: HTMLCanvasElement | null = null;

  // Step 3: Try vector anchored extraction first (if we have labels)
  if (labelHits.length > 0) {
    fallback_path.push('step3_vector_anchored');

    const numberLabels = labelHits.filter(h => h.label_type === 'number');
    const titleLabels = labelHits.filter(h => h.label_type === 'title' || h.label_type === 'moderate');

    // Extract sheet number
    if (numberLabels.length > 0) {
      const numberResult = extractSheetNumberAnchored({
        numberLabels,
        textItems,
        viewportW: viewportWidth,
        viewportH: viewportHeight,
        renderScale,
      });
      if (numberResult.value) {
        sheet_number = numberResult.value;
        anchored_extraction = true;
      }
      notes.anchored_regions = [...(notes.anchored_regions || []), ...numberResult.regions];
    }

    // Extract sheet title
    if (titleLabels.length > 0) {
      const titleResult = extractSheetTitleAnchored({
        titleLabels,
        textItems,
        viewportW: viewportWidth,
        viewportH: viewportHeight,
        renderScale,
      });
      if (titleResult.value) {
        sheet_title = titleResult.value;
        anchored_extraction = true;
        truncation_suspected = titleResult.truncation_suspected;
      }
      notes.anchored_regions = [...(notes.anchored_regions || []), ...titleResult.regions];
    }

    if (sheet_number || sheet_title) {
      extraction_source = 'vector_text';
      crop_valid = true;
      crop_reason = 'vector_anchored_success';
      crop_strategy = 'vector_label';
    }
  }

  // Step 4: If no labels, try vector heuristic (scan all text for patterns)
  if (!sheet_number && labelHits.length === 0 && textItems.length > 0) {
    fallback_path.push('step4_vector_heuristic');

    // Scan for sheet number pattern in bottom-right quadrant
    for (const item of textItems) {
      const validation = validateSheetNumber(item.text);
      if (validation.valid && validation.value) {
        sheet_number = validation.value;
        extraction_source = 'vector_text';
        break;
      }
    }

    // Scan for title-like text
    if (!sheet_title) {
      for (const item of textItems) {
        const validation = validateSheetTitle(item.text);
        if (validation.valid && validation.value && validation.score > 5) {
          sheet_title = validation.value;
          truncation_suspected = validation.truncation_suspected || false;
          break;
        }
      }
    }

    if (sheet_number || sheet_title) {
      crop_valid = true;
      crop_reason = 'vector_heuristic_success';
      crop_strategy = 'vector_label';
    }
  }

  // Step 5: Vision fallback on crop (if still missing data and budget allows)
  const needsVision = !sheet_number || !sheet_title;
  
  if (needsVision && params.visionBudget.remaining > 0) {
    fallback_path.push('step5_vision_crop');

    // Try crop attempts
    for (let i = 0; i < cropAttempts.length && (!sheet_number || !sheet_title); i++) {
      const attempt = cropAttempts[i];
      attempt_count = i + 1;

      const cropCanvas = cropByPxBBox(canvas, attempt.bbox);
      const uploadedPath = await uploadCropAttempt({
        projectId: params.projectId,
        jobId: params.jobId,
        sourceIndex: params.sourceIndex,
        attempt: attempt_count,
        cropCanvas,
      });
      if (uploadedPath) attempt_paths.push(uploadedPath);

      // Check if crop contains SHEET token or valid pattern (validation)
      let cropHasValidContent = false;
      for (const item of textItems) {
        // Convert to render coords and check if in crop
        const pxX = item.x * renderScale;
        const pxY = (viewportHeight - item.y) * renderScale;
        if (pxX >= attempt.bbox.x && pxX <= attempt.bbox.x + attempt.bbox.w &&
            pxY >= attempt.bbox.y && pxY <= attempt.bbox.y + attempt.bbox.h) {
          if (/\bSHEET\s*(NO|NUMBER|TITLE|#)\b/i.test(item.text)) {
            cropHasValidContent = true;
            break;
          }
          for (const { pattern } of SHEET_NUMBER_PATTERNS) {
            if (pattern.test(item.text)) {
              cropHasValidContent = true;
              break;
            }
          }
          if (cropHasValidContent) break;
        }
      }

      // If text layer empty or no valid content in text layer, try vision
      const textInCrop = textItems.filter(item => {
        const pxX = item.x * renderScale;
        const pxY = (viewportHeight - item.y) * renderScale;
        return pxX >= attempt.bbox.x && pxX <= attempt.bbox.x + attempt.bbox.w &&
               pxY >= attempt.bbox.y && pxY <= attempt.bbox.y + attempt.bbox.h;
      });

      if (textInCrop.length === 0 || !cropHasValidContent) {
        // Use vision
        params.visionBudget.remaining--;
        notes.vision_calls = (notes.vision_calls || 0) + 1;

        const visionResult = await extractWithVision(canvasToBase64(cropCanvas), {
          jobId: params.jobId,
          projectId: params.projectId,
          sourceIndex: params.sourceIndex,
          expectedDiscipline: getDisciplinePrefix(sheet_number),
          phase: 'vision_crop',
          renderW,
          renderH,
          cropStrategy: attempt.strategy,
          attempt: attempt_count,
        });

        if (visionResult.sheet_number && !sheet_number) {
          const validation = validateSheetNumber(visionResult.sheet_number);
          if (validation.valid) {
            sheet_number = validation.value;
            extraction_source = 'vision_titleblock';
            crop_valid = true;
            crop_strategy = attempt.strategy;
            crop_reason = `vision_crop_attempt_${attempt_count}`;
            chosenCropCanvas = cropCanvas;
          }
        }
        if (visionResult.sheet_title && !sheet_title) {
          const validation = validateSheetTitle(visionResult.sheet_title);
          if (validation.valid) {
            sheet_title = validation.value;
            truncation_suspected = validation.truncation_suspected || false;
            if (extraction_source === 'unknown') extraction_source = 'vision_titleblock';
            crop_valid = true;
            crop_strategy = attempt.strategy;
            crop_reason = `vision_crop_attempt_${attempt_count}`;
            chosenCropCanvas = cropCanvas;
          }
        }

        if (sheet_number && sheet_title) break;
      } else if (cropHasValidContent && !chosenCropCanvas) {
        chosenCropCanvas = cropCanvas;
        crop_valid = true;
        crop_strategy = attempt.strategy;
        crop_reason = `valid_text_in_crop_attempt_${attempt_count}`;
      }
    }
  }

  // Step 6: Vision on full sheet (downscaled) if still missing and budget allows
  if ((!sheet_number || !sheet_title) && params.visionBudget.remaining > 0) {
    fallback_path.push('step6_vision_full');
    params.visionBudget.remaining--;
    notes.vision_calls = (notes.vision_calls || 0) + 1;

    // Downscale to 1000px width
    const downscaleCanvas = document.createElement('canvas');
    const downscaleRatio = 1000 / renderW;
    downscaleCanvas.width = 1000;
    downscaleCanvas.height = Math.round(renderH * downscaleRatio);
    const downCtx = downscaleCanvas.getContext('2d');
    if (downCtx) {
      downCtx.drawImage(canvas, 0, 0, downscaleCanvas.width, downscaleCanvas.height);

      const visionResult = await extractWithVision(canvasToBase64(downscaleCanvas), {
        jobId: params.jobId,
        projectId: params.projectId,
        sourceIndex: params.sourceIndex,
        expectedDiscipline: getDisciplinePrefix(sheet_number),
        phase: 'vision_full',
        renderW,
        renderH,
        cropStrategy: 'unknown',
        attempt: 0,
      });

      if (visionResult.sheet_number && !sheet_number) {
        const validation = validateSheetNumber(visionResult.sheet_number);
        if (validation.valid) {
          sheet_number = validation.value;
          if (extraction_source === 'unknown') extraction_source = 'vision_titleblock';
        }
      }
      if (visionResult.sheet_title && !sheet_title) {
        const validation = validateSheetTitle(visionResult.sheet_title);
        if (validation.valid) {
          sheet_title = validation.value;
          truncation_suspected = validation.truncation_suspected || false;
          if (extraction_source === 'unknown') extraction_source = 'vision_titleblock';
        }
      }
      notes.vision_reason = 'full_sheet_fallback';
    }
  }

  // Mark crop as failed if we exhausted attempts without valid content
  if (!crop_valid && attempt_count > 0) {
    crop_reason = `all_${attempt_count}_attempts_failed`;
    crop_strategy = 'fail_crop';
    extraction_source = 'fail_crop';
  }

  // Store attempt paths
  notes.crop_attempt_paths = attempt_paths;
  notes.truncation_suspected = truncation_suspected;

  // Calculate confidence
  const titleValidation = sheet_title ? validateSheetTitle(sheet_title) : null;
  const confidenceResult = calculateConfidenceV3({
    extraction_source,
    sheet_number,
    sheet_title,
    has_both_labels_in_cluster,
    title_passes_clean_checks: titleValidation?.valid || false,
    truncation_suspected,
    anchored_extraction,
  });

  notes.flag_for_review = confidenceResult.flag_for_review;
  notes.manual_flag = confidenceResult.manual_flag;
  notes.timing_ms = Date.now() - startTime;

  // Upload assets
  let sheet_render_asset_path: string | null = null;
  let title_block_asset_path: string | null = null;
  let crop_asset_path: string | null = attempt_paths[0] || null;

  try {
    const renderBlob = await canvasToBlob(canvas);
    const renderPath = `projects/${params.projectId}/jobs/${params.jobId}/sheets/${params.sourceIndex}/render.png`;
    const { error } = await supabase.storage.from('project-files').upload(renderPath, renderBlob, {
      contentType: 'image/png',
      upsert: true,
    });
    if (!error) sheet_render_asset_path = renderPath;
  } catch { /* ignore */ }

  if (chosenCropCanvas) {
    try {
      const cropBlob = await canvasToBlob(chosenCropCanvas);
      const cropPath = `projects/${params.projectId}/jobs/${params.jobId}/sheets/${params.sourceIndex}/titleblock.png`;
      const { error } = await supabase.storage.from('project-files').upload(cropPath, cropBlob, {
        contentType: 'image/png',
        upsert: true,
      });
      if (!error) {
        title_block_asset_path = cropPath;
        if (!crop_asset_path) crop_asset_path = cropPath;
      }
    } catch { /* ignore */ }
  }

  return {
    result: {
      sheet_number,
      sheet_title,
      discipline: inferDiscipline(sheet_number, sheet_title),
      sheet_kind: inferSheetKind(sheet_title),
      confidence: confidenceResult.confidence,
      extraction_source,
      extraction_notes: notes,
    },
    canvas,
    crop_asset_path,
    crop_valid,
    crop_reason,
    crop_strategy,
    attempt_count,
    sheet_render_asset_path,
    title_block_asset_path,
  };
}

// ============================================================
// MAIN: RUN SHEET INDEX V3 AND PERSIST
// ============================================================
export async function runSheetIndexV2AndPersist(params: {
  projectId: string;
  jobId: string;
  filePath: string;
  useVisionFallback?: boolean;
}): Promise<SheetIndexRow[]> {
  const { projectId, jobId, filePath, useVisionFallback = true } = params;

  console.log('[SheetIndex v3.0] Starting extraction:', { projectId, jobId });

  // Download PDF
  const { data: blob, error: downloadError } = await supabase.storage
    .from('project-files')
    .download(filePath);

  if (downloadError || !blob) {
    console.error('Failed to download PDF for indexing:', downloadError);
    return [];
  }

  const arrayBuffer = await blob.arrayBuffer();
  const pdfjs = await getPdfJs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  // REQ-10: Vision call budget (hard cap 7 per document)
  const visionBudget = { remaining: useVisionFallback ? 7 : 0 };

  const results: SheetIndexRow[] = [];

  console.log(`[SheetIndex v3.0] Processing ${pdf.numPages} sheets...`);

  for (let i = 1; i <= pdf.numPages; i++) {
    const sourceIndex = i - 1;

    try {
      const page = await pdf.getPage(i);

      const extraction = await extractSheetV3({
        page,
        sourceIndex,
        projectId,
        jobId,
        visionBudget,
      });

      results.push({
        source_index: sourceIndex,
        sheet_number: extraction.result.sheet_number,
        sheet_title: extraction.result.sheet_title,
        discipline: extraction.result.discipline,
        sheet_kind: extraction.result.sheet_kind,
        confidence: extraction.result.confidence,
        extraction_source: extraction.result.extraction_source,
        extraction_notes: extraction.result.extraction_notes,
        sheet_render_asset_path: extraction.sheet_render_asset_path,
        title_block_asset_path: extraction.title_block_asset_path,
        crop_asset_path: extraction.crop_asset_path,
        crop_valid: extraction.crop_valid,
        crop_reason: extraction.crop_reason,
        crop_strategy: extraction.crop_strategy,
        attempt_count: extraction.attempt_count,
      });

      // If vision budget exhausted, mark remaining sheets
      if (visionBudget.remaining <= 0 && i < pdf.numPages) {
        console.warn(`[SheetIndex v3.0] Vision budget exhausted at sheet ${i}`);
      }
    } catch (error) {
      console.warn(`[SheetIndex v3.0] Failed to process sheet ${sourceIndex}:`, error);
      results.push({
        source_index: sourceIndex,
        sheet_number: null,
        sheet_title: null,
        discipline: null,
        sheet_kind: 'unknown',
        confidence: 0,
        extraction_source: 'fail_crop',
        extraction_notes: { error: String(error), fallback_path: ['error'] },
        sheet_render_asset_path: null,
        title_block_asset_path: null,
        crop_asset_path: null,
        crop_valid: false,
        crop_reason: 'processing_error',
        crop_strategy: 'unknown',
        attempt_count: 0,
      });
    }
  }

  // Persist to database
  await persistSheetIndex(projectId, jobId, results);

  console.log(`[SheetIndex v3.0] Completed: ${results.length} sheets processed`);

  return results;
}

// ============================================================
// PERSISTENCE
// ============================================================
async function persistSheetIndex(
  projectId: string,
  jobId: string,
  results: SheetIndexRow[]
): Promise<void> {
  const BATCH_SIZE = 50;

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE).map(row => ({
      project_id: projectId,
      job_id: jobId,
      source_index: row.source_index,
      sheet_number: row.sheet_number,
      sheet_title: row.sheet_title,
      discipline: row.discipline,
      sheet_kind: row.sheet_kind,
      confidence: row.confidence,
      extraction_source: row.extraction_source,
      extraction_notes: row.extraction_notes || {},
      sheet_render_asset_path: row.sheet_render_asset_path,
      title_block_asset_path: row.title_block_asset_path,
      crop_asset_path: row.crop_asset_path,
      crop_valid: row.crop_valid ?? false,
      crop_reason: row.crop_reason || '',
      crop_strategy: row.crop_strategy || 'unknown',
      attempt_count: row.attempt_count ?? 0,
    }));

    const { error } = await supabase
      .from('analysis_sheet_index_v2' as any)
      .upsert(batch, { onConflict: 'job_id,source_index' });

    if (error) {
      console.error('Failed to persist sheet index batch:', error);
      throw new Error('Failed to save sheet index');
    }
  }
}

// ============================================================
// FETCH SHEET INDEX
// ============================================================
export async function fetchSheetIndex(jobId: string): Promise<SheetIndexRow[]> {
  const { data, error } = await supabase
    .from('analysis_sheet_index_v2' as any)
    .select('*')
    .eq('job_id', jobId)
    .order('source_index', { ascending: true });

  if (error || !data) return [];

  return (data as any[]).map(row => ({
    source_index: row.source_index,
    sheet_number: row.sheet_number,
    sheet_title: row.sheet_title,
    discipline: row.discipline,
    sheet_kind: row.sheet_kind as SheetKind,
    confidence: row.confidence,
    extraction_source: (row.extraction_source || 'unknown') as ExtractionSource,
    extraction_notes: row.extraction_notes || {},
    sheet_render_asset_path: row.sheet_render_asset_path,
    title_block_asset_path: row.title_block_asset_path,
    crop_asset_path: row.crop_asset_path,
    crop_valid: row.crop_valid ?? false,
    crop_reason: row.crop_reason || '',
    crop_strategy: row.crop_strategy || 'unknown',
    attempt_count: row.attempt_count ?? 0,
  }));
}
