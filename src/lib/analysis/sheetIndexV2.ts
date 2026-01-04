// ============================================================
// STUDIOCHECK SHEET INDEX v2.3
// Template Calibration + Field-Anchored Extraction
// ============================================================

import { supabase } from '@/integrations/supabase/client';
import type { SheetIndexRow, SheetKind, ExtractionSource, NormalizedBBox, TitleBlockTemplate } from './types';

// PDF.js types
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent(): Promise<{ items: TextItem[] }>;
  getViewport(params: { scale: number }): { width: number; height: number; rotation: number };
  render(params: { canvasContext: CanvasRenderingContext2D; viewport: any }): { promise: Promise<void> };
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

// Lazy load PDF.js
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
// SHEET NUMBER PATTERNS (AEC standard formats)
// ============================================================
const SHEET_NUMBER_PATTERNS = [
  /\b([A-Z]{1,3})[-.]?(\d{2,4}(?:\.\d{1,2})?)\b/i,
  /\b([A-Z]{1,2})(\d)[-.](\d{2,3})\b/i,
  /\b(FP|FA|FS|ID|LP|EL)[-.]?(\d{2,4})\b/i,
];

// ============================================================
// BOILERPLATE PHRASES TO REJECT AS TITLES (v2.3 expanded)
// ============================================================
const BOILERPLATE_PHRASES = [
  // Jurisdiction/permit stamps
  'use only below this line',
  'not for construction',
  'for permit',
  'owner review',
  'preliminary',
  'for approval',
  'for review',
  'seattle dci',
  'building department',
  'planning department',
  // General notes
  'dimensions must be checked',
  'verified on site',
  'verify on site',
  'shop drawings',
  'before commencing',
  'contractor shall',
  'refer to specification',
  'all dimensions are in',
  'do not scale',
  'for construction',
  // Metadata
  'copyright',
  'proprietary',
  'confidential',
  'revision',
  'date issued',
  'drawn by',
  'checked by',
  'approved by',
  'project number',
  'job number',
];

// ============================================================
// TITLE QUALITY KEYWORDS (AEC titles)
// ============================================================
const AEC_TITLE_KEYWORDS = [
  'PLAN', 'FLOOR', 'ROOF', 'RCP', 'REFLECTED', 'CEILING',
  'SCHEDULE', 'DETAIL', 'SECTION', 'ELEVATION', 'LEGEND',
  'MECHANICAL', 'ELECTRICAL', 'PLUMBING', 'STRUCTURAL',
  'LEVEL', 'SITE', 'BASEMENT', 'GROUND', 'TYPICAL',
  'ENLARGED', 'PARTIAL', 'KEY', 'NOTES', 'GENERAL',
  'PARTITION', 'ASSEMBLY', 'WALL', 'DOOR', 'WINDOW',
  'COVER', 'INDEX', 'SHEET LIST', 'ABBREVIATION', 'SYMBOL',
];

// ============================================================
// DISCIPLINE + SHEET KIND INFERENCE
// ============================================================
const DISCIPLINE_MAP: Record<string, string> = {
  'A': 'Architectural',
  'S': 'Structural', 
  'M': 'Mechanical',
  'P': 'Plumbing',
  'E': 'Electrical',
  'F': 'Fire Protection',
  'FP': 'Fire Protection',
  'FA': 'Fire Alarm',
  'FS': 'Fire Suppression',
  'C': 'Civil',
  'L': 'Landscape',
  'LP': 'Landscape',
  'I': 'Interior',
  'ID': 'Interior Design',
  'G': 'General',
  'T': 'Telecommunications',
  'D': 'Demolition',
  'EL': 'Electrical',
};

const DISCIPLINE_KEYWORDS: Record<string, string> = {
  'MECHANICAL': 'Mechanical',
  'HVAC': 'Mechanical',
  'ELECTRICAL': 'Electrical',
  'PLUMBING': 'Plumbing',
  'STRUCTURAL': 'Structural',
  'FIRE': 'Fire Protection',
  'SPRINKLER': 'Fire Protection',
  'CIVIL': 'Civil',
  'SITE': 'Civil',
  'LANDSCAPE': 'Landscape',
  'INTERIOR': 'Interior',
  'ARCHITECTURAL': 'Architectural',
  'ARCH': 'Architectural',
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
    for (const [keyword, discipline] of Object.entries(DISCIPLINE_KEYWORDS)) {
      if (upperTitle.includes(keyword)) return discipline;
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
  if (upper.includes('LEGEND') || upper.includes('ABBREVIATION') || upper.includes('SYMBOL')) return 'legend';
  if (upper.includes('SECTION')) return 'general';
  if (upper.includes('ELEVATION')) return 'general';
  if (upper.includes('PLAN') || upper.includes('FLOOR') || upper.includes('ROOF') || upper.includes('SITE')) return 'plan';
  if (upper.includes('COVER') || upper.includes('INDEX') || upper.includes('SHEET LIST')) return 'general';
  
  return 'general';
}

// ============================================================
// TITLE VALIDATION v2.3 (stricter)
// ============================================================
interface TitleValidation {
  isValid: boolean;
  reason?: string;
}

function validateTitle(title: string | null): TitleValidation {
  if (!title) return { isValid: false, reason: 'empty' };
  
  const trimmed = title.trim();
  if (trimmed.length < 6) return { isValid: false, reason: 'too_short' };
  if (trimmed.length > 80) return { isValid: false, reason: 'too_long' };
  
  // Check word count
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 12) return { isValid: false, reason: 'too_many_words' };
  
  // Check punctuation density
  const commas = (trimmed.match(/,/g) || []).length;
  const periods = (trimmed.match(/\./g) || []).length;
  if (commas > 2) return { isValid: false, reason: 'too_many_commas' };
  if (periods > 1) return { isValid: false, reason: 'too_many_periods' };
  
  // Check if mostly punctuation
  const alphaChars = trimmed.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length < 4) return { isValid: false, reason: 'mostly_punctuation' };
  
  // Check for boilerplate phrases (v2.3: expanded list)
  const lowerTitle = trimmed.toLowerCase();
  for (const phrase of BOILERPLATE_PHRASES) {
    if (lowerTitle.includes(phrase)) {
      return { isValid: false, reason: 'boilerplate_phrase' };
    }
  }
  
  return { isValid: true };
}

function scoreTitleCandidate(candidate: string): number {
  const validation = validateTitle(candidate);
  if (!validation.isValid) return -1;
  
  let score = 0;
  const upper = candidate.toUpperCase();
  
  // Prefer AEC keywords (strong signal)
  for (const keyword of AEC_TITLE_KEYWORDS) {
    if (upper.includes(keyword)) {
      score += 30;
      break;
    }
  }
  
  // Prefer mostly uppercase (title case)
  const upperRatio = (candidate.match(/[A-Z]/g) || []).length / candidate.length;
  if (upperRatio > 0.5) score += 20;
  
  // Prefer length between 8 and 45 characters
  if (candidate.length >= 8 && candidate.length <= 45) score += 15;
  
  // Small bonus for reasonable word count
  const words = candidate.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2 && words.length <= 6) score += 10;
  
  return score;
}

// ============================================================
// EXTRACTION RESULT INTERFACE
// ============================================================
interface ExtractionResult {
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  sheet_kind: SheetKind;
  confidence: number;
  extraction_source: ExtractionSource;
  extraction_notes: Record<string, unknown>;
  sheetNumberPosition?: { x: number; y: number };
}

// ============================================================
// PASS 1: HEURISTIC TEXT EXTRACTION v2.3
// ============================================================
function extractFromTextItems(
  textItems: TextItem[],
  viewportWidth: number,
  viewportHeight: number
): ExtractionResult {
  let sheet_number: string | null = null;
  let sheet_title: string | null = null;
  let heuristicConfidence = 0;
  let sheetNumberPosition: { x: number; y: number } | undefined;
  const extraction_notes: Record<string, unknown> = {};
  
  // Title block region: bottom-right 25% width x 25% height (PDF Y is inverted)
  const titleBlockMinX = viewportWidth * 0.75;
  const titleBlockMaxY = viewportHeight * 0.25;
  
  // Collect all items with positions
  const itemsWithPos = textItems.map(item => ({
    text: item.str.trim(),
    x: item.transform[4],
    y: item.transform[5],
    width: item.width,
    height: item.height,
  })).filter(item => item.text.length > 0);
  
  // Find sheet number - prefer bottom-right position
  const sheetNumberCandidates: { text: string; x: number; y: number; positionScore: number }[] = [];
  
  for (const item of itemsWithPos) {
    for (const pattern of SHEET_NUMBER_PATTERNS) {
      const match = item.text.match(pattern);
      if (match) {
        const positionScore = item.x + (viewportHeight - item.y);
        sheetNumberCandidates.push({
          text: match[0].toUpperCase().replace(/[-.]/g, ''),
          x: item.x,
          y: item.y,
          positionScore,
        });
      }
    }
  }
  
  // Pick the sheet number with highest position score (most bottom-right)
  if (sheetNumberCandidates.length > 0) {
    sheetNumberCandidates.sort((a, b) => b.positionScore - a.positionScore);
    const best = sheetNumberCandidates[0];
    sheet_number = best.text;
    sheetNumberPosition = { x: best.x, y: best.y };
    heuristicConfidence += 0.40;
    extraction_notes.sheet_number_candidates = sheetNumberCandidates.length;
  }
  
  // Collect title candidates - prioritize near sheet number position
  const titleCandidates: { text: string; score: number; inTitleBlock: boolean }[] = [];
  
  for (const item of itemsWithPos) {
    const inTitleBlock = item.x >= titleBlockMinX && item.y <= titleBlockMaxY;
    const text = item.text;
    
    // Skip if it's the sheet number
    if (sheet_number && text.toUpperCase().includes(sheet_number)) continue;
    
    const score = scoreTitleCandidate(text);
    if (score > 0) {
      // Extra bonus for being near sheet number position
      let positionBonus = 0;
      if (sheetNumberPosition) {
        const distX = Math.abs(item.x - sheetNumberPosition.x);
        const distY = Math.abs(item.y - sheetNumberPosition.y);
        if (distX < viewportWidth * 0.15 && distY < viewportHeight * 0.10) {
          positionBonus = 25;
        }
      }
      
      titleCandidates.push({
        text,
        score: (inTitleBlock ? score + 30 : score) + positionBonus,
        inTitleBlock,
      });
    }
  }
  
  // Sort by score and pick best valid title
  titleCandidates.sort((a, b) => b.score - a.score);
  
  for (const candidate of titleCandidates) {
    const validation = validateTitle(candidate.text);
    if (validation.isValid) {
      sheet_title = candidate.text;
      heuristicConfidence += 0.35;
      break;
    }
  }
  
  // Track if no valid title was found
  if (!sheet_title && titleCandidates.length > 0) {
    extraction_notes.title_rejected = true;
    extraction_notes.rejection_reason = validateTitle(titleCandidates[0]?.text || '').reason;
  }
  
  // Add confidence for text layer quality
  if (textItems.length >= 50) {
    heuristicConfidence += 0.10;
  }
  
  // Infer discipline and kind
  const discipline = inferDiscipline(sheet_number, sheet_title);
  const sheet_kind = inferSheetKind(sheet_title);
  
  return {
    sheet_number,
    sheet_title,
    discipline,
    sheet_kind,
    confidence: Math.min(heuristicConfidence, 0.90),
    extraction_source: 'vector_text',
    extraction_notes,
    sheetNumberPosition,
  };
}

// ============================================================
// CHECK IF VISION FALLBACK IS NEEDED
// ============================================================
function needsVisionFallback(result: ExtractionResult): { needed: boolean; reason?: string } {
  if (!result.sheet_number) {
    return { needed: true, reason: 'no_sheet_number' };
  }
  
  if (result.confidence < 0.80) {
    return { needed: true, reason: 'low_confidence' };
  }
  
  const titleValidation = validateTitle(result.sheet_title);
  if (!titleValidation.isValid) {
    return { needed: true, reason: titleValidation.reason || 'invalid_title' };
  }
  
  return { needed: false };
}

// ============================================================
// VISION EXTRACTION (via edge function)
// ============================================================
async function extractWithVision(
  titleBlockImageBase64: string
): Promise<{ sheet_number: string | null; sheet_title: string | null }> {
  try {
    const response = await supabase.functions.invoke('extract-titleblock', {
      body: { image: titleBlockImageBase64 },
    });
    
    if (response.error) {
      console.error('Vision extraction error:', response.error);
      return { sheet_number: null, sheet_title: null };
    }
    
    const data = response.data;
    return {
      sheet_number: data?.sheet_number || null,
      sheet_title: data?.sheet_title || null,
    };
  } catch (error) {
    console.error('Vision extraction failed:', error);
    return { sheet_number: null, sheet_title: null };
  }
}

// ============================================================
// TEMPLATE CALIBRATION (v2.3)
// ============================================================
interface TemplateCalibrationResult {
  bbox_sheet_title_value: NormalizedBBox | null;
  bbox_sheet_number_value: NormalizedBBox | null;
  confidence: number;
}

async function calibrateTemplateForDiscipline(
  calibrationSheets: Array<{
    sourceIndex: number;
    sheetNumber: string;
    renderBase64: string;
  }>,
  discipline: string
): Promise<TemplateCalibrationResult> {
  try {
    const response = await supabase.functions.invoke('detect-titleblock-template', {
      body: {
        images: calibrationSheets.map(s => s.renderBase64),
        discipline,
      },
    });
    
    if (response.error) {
      console.error('Template calibration error:', response.error);
      return { bbox_sheet_title_value: null, bbox_sheet_number_value: null, confidence: 0 };
    }
    
    const data = response.data;
    return {
      bbox_sheet_title_value: data?.bbox_sheet_title_value || null,
      bbox_sheet_number_value: data?.bbox_sheet_number_value || null,
      confidence: data?.confidence || 0,
    };
  } catch (error) {
    console.error('Template calibration failed:', error);
    return { bbox_sheet_title_value: null, bbox_sheet_number_value: null, confidence: 0 };
  }
}

async function loadOrCreateTemplate(
  projectId: string,
  jobId: string,
  discipline: string,
  calibrationSheets: Array<{
    sourceIndex: number;
    sheetNumber: string;
    renderBase64: string;
  }>
): Promise<TitleBlockTemplate | null> {
  // Check if template already exists
  const { data: existing, error: fetchError } = await supabase
    .from('analysis_titleblock_templates' as any)
    .select('*')
    .eq('job_id', jobId)
    .eq('discipline', discipline)
    .maybeSingle();
  
  if (!fetchError && existing && (existing as any).confidence >= 0.6) {
    console.log(`[SheetIndex v2.3] Using cached template for ${discipline}, confidence=${(existing as any).confidence}`);
    return {
      id: (existing as any).id,
      project_id: (existing as any).project_id,
      job_id: (existing as any).job_id,
      discipline: (existing as any).discipline,
      template: (existing as any).template || {},
      calibration_samples: (existing as any).calibration_samples || [],
      confidence: (existing as any).confidence,
      created_at: (existing as any).created_at,
    } as TitleBlockTemplate;
  }
  
  // Need to calibrate
  console.log(`[SheetIndex v2.3] Calibrating template for ${discipline} using ${calibrationSheets.length} samples`);
  
  const calibrationResult = await calibrateTemplateForDiscipline(calibrationSheets, discipline);
  
  if (calibrationResult.confidence < 0.5) {
    console.log(`[SheetIndex v2.3] Calibration failed for ${discipline}, confidence=${calibrationResult.confidence}`);
    return null;
  }
  
  // Save template
  const template: TitleBlockTemplate = {
    project_id: projectId,
    job_id: jobId,
    discipline,
    template: {
      bbox_sheet_title_value: calibrationResult.bbox_sheet_title_value,
      bbox_sheet_number_value: calibrationResult.bbox_sheet_number_value,
    },
    calibration_samples: calibrationSheets.map(s => ({
      source_index: s.sourceIndex,
      sheet_number: s.sheetNumber,
    })),
    confidence: calibrationResult.confidence,
  };
  
  const { error } = await supabase
    .from('analysis_titleblock_templates' as any)
    .upsert({
      project_id: projectId,
      job_id: jobId,
      discipline,
      template: template.template,
      calibration_samples: template.calibration_samples,
      confidence: template.confidence,
    }, {
      onConflict: 'job_id,discipline',
    });
  
  if (error) {
    console.error('Failed to save template:', error);
  }
  
  return template;
}

// ============================================================
// RENDER + CROP UTILITIES
// ============================================================
async function renderSheetToCanvas(
  page: PDFPageProxy,
  dpi: number = 150
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  return { canvas, width: viewport.width, height: viewport.height };
}

function cropWithBBox(
  canvas: HTMLCanvasElement,
  bbox: NormalizedBBox
): HTMLCanvasElement {
  const width = canvas.width;
  const height = canvas.height;
  
  const cropX = Math.floor(bbox.x * width);
  const cropY = Math.floor(bbox.y * height);
  const cropW = Math.floor(bbox.w * width);
  const cropH = Math.floor(bbox.h * height);
  
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get crop canvas context');
  
  ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  
  return cropCanvas;
}

function cropTitleBlockDynamic(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  sheetNumberPosition?: { x: number; y: number },
  viewportWidth?: number,
  viewportHeight?: number,
  renderScale?: number
): HTMLCanvasElement {
  // Default crop: bottom-right 22% width x 16% height
  let cropWidthRatio = 0.22;
  let cropHeightRatio = 0.16;
  
  // If we have sheet number position, create a dynamic crop around it
  if (sheetNumberPosition && viewportWidth && viewportHeight && renderScale) {
    cropWidthRatio = 0.24;
    cropHeightRatio = 0.18;
  }
  
  const cropWidth = Math.floor(width * cropWidthRatio);
  const cropHeight = Math.floor(height * cropHeightRatio);
  const cropX = width - cropWidth;
  const cropY = height - cropHeight;
  
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get crop canvas context');
  
  ctx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  
  return cropCanvas;
}

function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1];
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to convert canvas to blob'));
    }, 'image/png');
  });
}

// ============================================================
// CONFIDENCE CALCULATION v2.3
// ============================================================
function calculateFinalConfidence(
  result: ExtractionResult,
  visionUsed: boolean,
  visionSucceeded: boolean,
  templateUsed: boolean,
  templateSucceeded: boolean
): number {
  let confidence = 0;
  
  // Sheet number scoring
  if (result.sheet_number) {
    confidence += 0.45;
    for (const pattern of SHEET_NUMBER_PATTERNS) {
      if (pattern.test(result.sheet_number)) {
        confidence += 0.05;
        break;
      }
    }
  } else {
    // No sheet number = max 0.55
    return Math.min(result.confidence, 0.55);
  }
  
  // Title scoring
  const titleValidation = validateTitle(result.sheet_title);
  if (result.sheet_title && titleValidation.isValid) {
    confidence += 0.35;
    
    // Bonus for AEC keywords
    const upper = result.sheet_title.toUpperCase();
    if (AEC_TITLE_KEYWORDS.some(kw => upper.includes(kw))) {
      confidence += 0.10;
    }
  } else if (result.sheet_title) {
    // Invalid/boilerplate title = max 0.30
    return Math.min(0.30, confidence);
  } else {
    // No title = max 0.45
    return Math.min(0.45, confidence);
  }
  
  // Template extraction bonus
  if (templateUsed && templateSucceeded) {
    confidence = Math.min(confidence, 0.97);
  } else if (visionUsed) {
    if (visionSucceeded) {
      confidence = Math.min(confidence, 0.95);
    } else {
      confidence = Math.min(confidence, 0.40);
    }
  }
  
  return Math.min(confidence, 0.97);
}

// ============================================================
// BOILERPLATE DETECTION (across all sheets)
// ============================================================
function detectBoilerplateTitles(
  results: Array<{ sheet_title: string | null; sourceIndex: number }>
): Set<number> {
  const titleCounts = new Map<string, number[]>();
  
  for (const r of results) {
    if (r.sheet_title && r.sheet_title.length > 30) {
      const normalized = r.sheet_title.toLowerCase().trim();
      const indices = titleCounts.get(normalized) || [];
      indices.push(r.sourceIndex);
      titleCounts.set(normalized, indices);
    }
  }
  
  const boilerplateIndices = new Set<number>();
  for (const [_, indices] of titleCounts.entries()) {
    if (indices.length > 8) {
      indices.forEach(i => boilerplateIndices.add(i));
    }
  }
  
  return boilerplateIndices;
}

// ============================================================
// TEMPLATE-BASED EXTRACTION (v2.3)
// ============================================================
async function extractWithTemplate(
  canvas: HTMLCanvasElement,
  template: TitleBlockTemplate
): Promise<{ sheet_number: string | null; sheet_title: string | null; success: boolean }> {
  const crops: string[] = [];
  
  // Crop title value region if available
  if (template.template.bbox_sheet_title_value) {
    const titleCrop = cropWithBBox(canvas, template.template.bbox_sheet_title_value);
    crops.push(canvasToBase64(titleCrop));
  }
  
  // Crop sheet number region if available
  if (template.template.bbox_sheet_number_value) {
    const numberCrop = cropWithBBox(canvas, template.template.bbox_sheet_number_value);
    crops.push(canvasToBase64(numberCrop));
  }
  
  if (crops.length === 0) {
    return { sheet_number: null, sheet_title: null, success: false };
  }
  
  // Use vision on the specific crops
  // For now, combine crops and send to extract-titleblock
  try {
    // Send the title crop first (larger context)
    const response = await supabase.functions.invoke('extract-titleblock', {
      body: { image: crops[0] },
    });
    
    if (response.error) {
      return { sheet_number: null, sheet_title: null, success: false };
    }
    
    const data = response.data;
    const title = data?.sheet_title || null;
    let number = data?.sheet_number || null;
    
    // If we have a separate number crop and didn't get number, try that
    if (!number && crops.length > 1) {
      const numResponse = await supabase.functions.invoke('extract-titleblock', {
        body: { image: crops[1] },
      });
      if (!numResponse.error) {
        number = numResponse.data?.sheet_number || null;
      }
    }
    
    const titleValid = validateTitle(title);
    
    return {
      sheet_number: number,
      sheet_title: titleValid.isValid ? title : null,
      success: (number !== null) && titleValid.isValid,
    };
  } catch (error) {
    console.error('Template extraction failed:', error);
    return { sheet_number: null, sheet_title: null, success: false };
  }
}

// ============================================================
// MAIN: RUN SHEET INDEX V2.3 AND PERSIST
// ============================================================
export async function runSheetIndexV2AndPersist(params: {
  projectId: string;
  jobId: string;
  filePath: string;
  useVisionFallback?: boolean;
}): Promise<SheetIndexRow[]> {
  const { projectId, jobId, filePath, useVisionFallback = true } = params;
  
  console.log('[SheetIndex v2.3] Starting extraction:', { projectId, jobId });
  
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
  
  const RENDER_DPI = 150;
  const renderScale = RENDER_DPI / 72;
  
  // First pass: extract all sheets with heuristics
  const firstPassResults: Array<{
    sourceIndex: number;
    result: ExtractionResult;
    canvas: HTMLCanvasElement;
    renderBase64?: string;
    width: number;
    height: number;
    viewportWidth: number;
    viewportHeight: number;
  }> = [];
  
  console.log(`[SheetIndex v2.3] Processing ${pdf.numPages} sheets...`);
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const sourceIndex = i - 1;
    
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      
      // Pass 1: Heuristic extraction
      const result = extractFromTextItems(
        textContent.items as TextItem[],
        viewport.width,
        viewport.height
      );
      
      // Render sheet
      const { canvas, width, height } = await renderSheetToCanvas(page, RENDER_DPI);
      
      firstPassResults.push({
        sourceIndex,
        result,
        canvas,
        width,
        height,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });
    } catch (error) {
      console.warn(`Failed first pass for sheet ${sourceIndex}:`, error);
      const placeholderCanvas = document.createElement('canvas');
      placeholderCanvas.width = 100;
      placeholderCanvas.height = 100;
      
      firstPassResults.push({
        sourceIndex,
        result: {
          sheet_number: null,
          sheet_title: null,
          discipline: null,
          sheet_kind: 'unknown',
          confidence: 0,
          extraction_source: 'unknown',
          extraction_notes: { error: 'first_pass_failed' },
        },
        canvas: placeholderCanvas,
        width: 100,
        height: 100,
        viewportWidth: 100,
        viewportHeight: 100,
      });
    }
  }
  
  // Detect boilerplate titles across all sheets
  const boilerplateIndices = detectBoilerplateTitles(
    firstPassResults.map(r => ({
      sheet_title: r.result.sheet_title,
      sourceIndex: r.sourceIndex,
    }))
  );
  
  console.log(`[SheetIndex v2.3] Detected ${boilerplateIndices.size} sheets with boilerplate titles`);
  
  // Group sheets by discipline for template calibration
  const disciplineGroups = new Map<string, typeof firstPassResults>();
  for (const pass1 of firstPassResults) {
    const discipline = getDisciplinePrefix(pass1.result.sheet_number);
    const group = disciplineGroups.get(discipline) || [];
    group.push(pass1);
    disciplineGroups.set(discipline, group);
  }
  
  // Calibrate templates for each discipline (up to 3 samples each)
  const templates = new Map<string, TitleBlockTemplate | null>();
  
  for (const [discipline, sheets] of disciplineGroups.entries()) {
    if (discipline === 'UNKNOWN') continue;
    
    // Select up to 3 calibration sheets with valid sheet numbers
    const calibrationSheets = sheets
      .filter(s => s.result.sheet_number !== null)
      .slice(0, 3)
      .map(s => ({
        sourceIndex: s.sourceIndex,
        sheetNumber: s.result.sheet_number!,
        renderBase64: canvasToBase64(s.canvas),
      }));
    
    if (calibrationSheets.length === 0) continue;
    
    const template = await loadOrCreateTemplate(projectId, jobId, discipline, calibrationSheets);
    templates.set(discipline, template);
  }
  
  console.log(`[SheetIndex v2.3] Calibrated ${templates.size} templates`);
  
  // Second pass: process each sheet with template-based or vision extraction
  const finalResults: SheetIndexRow[] = [];
  
  for (const pass1 of firstPassResults) {
    const { sourceIndex, result, canvas, width, height, viewportWidth, viewportHeight } = pass1;
    
    let finalResult = { ...result };
    let visionUsed = false;
    let visionSucceeded = false;
    let templateUsed = false;
    let templateSucceeded = false;
    
    const fallbackCheck = needsVisionFallback(result);
    const isBoilerplate = boilerplateIndices.has(sourceIndex);
    
    if (isBoilerplate) {
      finalResult.extraction_notes = {
        ...finalResult.extraction_notes,
        boilerplate_detected: true,
      };
    }
    
    // Try template-based extraction if available
    const discipline = getDisciplinePrefix(result.sheet_number);
    const template = templates.get(discipline);
    
    if ((fallbackCheck.needed || isBoilerplate) && template && template.confidence >= 0.6) {
      templateUsed = true;
      finalResult.extraction_notes = {
        ...finalResult.extraction_notes,
        template_discipline: discipline,
      };
      
      const templateResult = await extractWithTemplate(canvas, template);
      
      if (templateResult.success) {
        templateSucceeded = true;
        finalResult = {
          sheet_number: templateResult.sheet_number,
          sheet_title: templateResult.sheet_title,
          discipline: inferDiscipline(templateResult.sheet_number, templateResult.sheet_title),
          sheet_kind: inferSheetKind(templateResult.sheet_title),
          confidence: 0,
          extraction_source: 'template_fields',
          extraction_notes: {
            ...finalResult.extraction_notes,
            template_used: true,
            template_succeeded: true,
          },
        };
      } else {
        finalResult.extraction_notes = {
          ...finalResult.extraction_notes,
          template_used: true,
          template_failed: true,
        };
      }
    }
    
    // Crop title block with dynamic positioning
    const titleBlockCanvas = cropTitleBlockDynamic(
      canvas,
      width,
      height,
      result.sheetNumberPosition,
      viewportWidth,
      viewportHeight,
      renderScale
    );
    
    // Upload assets
    let sheet_render_asset_path: string | null = null;
    let title_block_asset_path: string | null = null;
    
    try {
      const renderBlob = await canvasToBlob(canvas);
      const renderPath = `projects/${projectId}/jobs/${jobId}/sheets/${sourceIndex}/render.png`;
      
      const { error: renderUploadError } = await supabase.storage
        .from('project-files')
        .upload(renderPath, renderBlob, {
          contentType: 'image/png',
          upsert: true,
        });
      
      if (!renderUploadError) {
        sheet_render_asset_path = renderPath;
      }
      
      const titleBlockBlob = await canvasToBlob(titleBlockCanvas);
      const titleBlockPath = `projects/${projectId}/jobs/${jobId}/sheets/${sourceIndex}/titleblock.png`;
      
      const { error: tbUploadError } = await supabase.storage
        .from('project-files')
        .upload(titleBlockPath, titleBlockBlob, {
          contentType: 'image/png',
          upsert: true,
        });
      
      if (!tbUploadError) {
        title_block_asset_path = titleBlockPath;
      }
    } catch (uploadError) {
      console.warn(`Failed to upload assets for sheet ${sourceIndex}:`, uploadError);
    }
    
    // Apply vision fallback if template didn't succeed and still needed
    if (useVisionFallback && !templateSucceeded && (fallbackCheck.needed || isBoilerplate)) {
      visionUsed = true;
      finalResult.extraction_notes = {
        ...finalResult.extraction_notes,
        vision_reason: isBoilerplate ? 'boilerplate_title' : fallbackCheck.reason,
      };
      
      const titleBlockBase64 = canvasToBase64(titleBlockCanvas);
      const visionResult = await extractWithVision(titleBlockBase64);
      
      if (visionResult.sheet_number || visionResult.sheet_title) {
        const visionTitleValid = validateTitle(visionResult.sheet_title);
        
        if (visionResult.sheet_number && visionTitleValid.isValid) {
          visionSucceeded = true;
          finalResult = {
            sheet_number: visionResult.sheet_number,
            sheet_title: visionResult.sheet_title,
            discipline: inferDiscipline(visionResult.sheet_number, visionResult.sheet_title),
            sheet_kind: inferSheetKind(visionResult.sheet_title),
            confidence: 0,
            extraction_source: 'vision_titleblock',
            extraction_notes: {
              ...finalResult.extraction_notes,
              vision_used: true,
              vision_succeeded: true,
            },
          };
        } else if (visionResult.sheet_number && !result.sheet_number) {
          visionSucceeded = true;
          finalResult.sheet_number = visionResult.sheet_number;
          finalResult.discipline = inferDiscipline(visionResult.sheet_number, finalResult.sheet_title);
          finalResult.extraction_source = 'vision_titleblock';
          finalResult.extraction_notes = {
            ...finalResult.extraction_notes,
            vision_used: true,
            vision_partial: true,
          };
        }
      }
      
      if (!visionSucceeded) {
        finalResult.extraction_notes = {
          ...finalResult.extraction_notes,
          vision_used: true,
          vision_failed: true,
        };
        if (!templateSucceeded) {
          finalResult.extraction_source = 'unknown';
        }
      }
    }
    
    // Calculate final confidence
    const finalConfidence = calculateFinalConfidence(
      finalResult,
      visionUsed,
      visionSucceeded,
      templateUsed,
      templateSucceeded
    );
    
    finalResults.push({
      source_index: sourceIndex,
      sheet_number: finalResult.sheet_number,
      sheet_title: finalResult.sheet_title,
      discipline: finalResult.discipline,
      sheet_kind: finalResult.sheet_kind,
      confidence: finalConfidence,
      extraction_source: finalResult.extraction_source,
      extraction_notes: finalResult.extraction_notes,
      sheet_render_asset_path,
      title_block_asset_path,
    });
  }
  
  // Persist to database
  await persistSheetIndex(projectId, jobId, finalResults);
  
  console.log(`[SheetIndex v2.3] Completed: ${finalResults.length} sheets processed`);
  
  return finalResults;
}

// ============================================================
// PERSISTENCE (upsert on job_id + source_index)
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
    }));
    
    const { error } = await supabase
      .from('analysis_sheet_index_v2' as any)
      .upsert(batch, {
        onConflict: 'job_id,source_index',
      });
    
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
  }));
}
