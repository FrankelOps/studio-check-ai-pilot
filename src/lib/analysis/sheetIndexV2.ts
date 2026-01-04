// ============================================================
// STUDIOCHECK SHEET INDEX v2.1
// Improved extraction with title block crops + vision fallback
// ============================================================

import { supabase } from '@/integrations/supabase/client';
import type { SheetIndexRow, SheetKind, ExtractionSource } from './types';

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
  // Standard: A101, A1.01, A-101, M201, E001
  /\b([A-Z]{1,3})[-.]?(\d{2,4}(?:\.\d{1,2})?)\b/i,
  // With level prefix: A1-101, S2.01
  /\b([A-Z]{1,2})(\d)[-.](\d{2,3})\b/i,
  // Fire/Civil multi-char: FP101, FA201, C1.0
  /\b(FP|FA|FS|ID|LP|EL)[-.]?(\d{2,4})\b/i,
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
  // Primary: from sheet number prefix
  if (sheetNumber) {
    // Try 2-char prefix first (FP, FA, etc.)
    const prefix2 = sheetNumber.substring(0, 2).toUpperCase();
    if (DISCIPLINE_MAP[prefix2]) return DISCIPLINE_MAP[prefix2];
    
    // Then 1-char prefix
    const prefix1 = sheetNumber.charAt(0).toUpperCase();
    if (DISCIPLINE_MAP[prefix1]) return DISCIPLINE_MAP[prefix1];
  }
  
  // Secondary: from title keywords
  if (sheetTitle) {
    const upperTitle = sheetTitle.toUpperCase();
    for (const [keyword, discipline] of Object.entries(DISCIPLINE_KEYWORDS)) {
      if (upperTitle.includes(keyword)) return discipline;
    }
  }
  
  return null;
}

function inferSheetKind(sheetTitle: string | null): SheetKind {
  if (!sheetTitle) return 'unknown';
  
  const upper = sheetTitle.toUpperCase();
  
  if (upper.includes('SCHEDULE')) return 'schedule';
  if (upper.includes('RCP') || upper.includes('REFLECTED CEILING')) return 'rcp';
  if (upper.includes('DETAIL')) return 'detail';
  if (upper.includes('LEGEND') || upper.includes('ABBREVIATION') || upper.includes('SYMBOL')) return 'legend';
  if (upper.includes('SECTION')) return 'general'; // Could add 'section' type
  if (upper.includes('ELEVATION')) return 'general'; // Could add 'elevation' type
  if (upper.includes('PLAN') || upper.includes('FLOOR') || upper.includes('ROOF') || upper.includes('SITE')) return 'plan';
  if (upper.includes('COVER') || upper.includes('INDEX') || upper.includes('SHEET LIST')) return 'general';
  
  return 'general';
}

// ============================================================
// TITLE BLOCK EXTRACTION RESULT
// ============================================================
interface ExtractionResult {
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  sheet_kind: SheetKind;
  confidence: number;
  extraction_source: ExtractionSource;
}

// ============================================================
// PASS 1: HEURISTIC TEXT EXTRACTION
// ============================================================
function extractFromTextItems(
  textItems: TextItem[],
  viewportWidth: number,
  viewportHeight: number
): ExtractionResult {
  let sheet_number: string | null = null;
  let sheet_title: string | null = null;
  let heuristicConfidence = 0;
  
  // Title block region: bottom-right 25% width x 20% height
  const titleBlockMinX = viewportWidth * 0.75;
  const titleBlockMinY = viewportHeight * 0.80;
  
  // Filter items in title block region
  const titleBlockItems = textItems.filter(item => {
    const x = item.transform[4];
    const y = item.transform[5];
    return x >= titleBlockMinX && y <= viewportHeight * 0.20; // Y is inverted in PDF
  });
  
  // If no items in title block region, use all items
  const searchItems = titleBlockItems.length >= 5 ? titleBlockItems : textItems;
  
  // Collect all text
  const allText = searchItems.map(item => item.str.trim()).filter(Boolean);
  
  // Extract sheet number
  for (const text of allText) {
    for (const pattern of SHEET_NUMBER_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        // Normalize: remove separators
        sheet_number = match[0].toUpperCase().replace(/[-.]/g, '');
        heuristicConfidence += 0.4;
        break;
      }
    }
    if (sheet_number) break;
  }
  
  // Extract sheet title - look for descriptive lines
  const titleCandidates = allText.filter(text => {
    // Must be longer than 6 chars
    if (text.length < 6) return false;
    // Must not be just the sheet number
    if (sheet_number && text.toUpperCase().includes(sheet_number)) return false;
    // Must contain letters
    if (!/[a-zA-Z]{3,}/.test(text)) return false;
    // Should not be just punctuation/numbers
    if (/^[\d\s\-\._:;,]+$/.test(text)) return false;
    return true;
  });
  
  // Pick the best title candidate
  const aecKeywords = ['PLAN', 'RCP', 'REFLECTED', 'SCHEDULE', 'DETAIL', 'SECTION', 'ELEVATION', 'LEGEND', 'FLOOR', 'ROOF', 'SITE', 'LEVEL', 'MECHANICAL', 'ELECTRICAL', 'PLUMBING'];
  
  let bestTitle: string | null = null;
  let bestScore = 0;
  
  for (const candidate of titleCandidates) {
    let score = candidate.length; // Base score from length
    const upper = candidate.toUpperCase();
    
    // Bonus for AEC keywords
    for (const keyword of aecKeywords) {
      if (upper.includes(keyword)) {
        score += 20;
        break;
      }
    }
    
    // Bonus for all caps (title style)
    if (candidate === candidate.toUpperCase() && /[A-Z]/.test(candidate)) {
      score += 10;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestTitle = candidate;
    }
  }
  
  sheet_title = bestTitle;
  
  // Add confidence for title quality
  if (sheet_title && sheet_title.length > 6) {
    // Check if title is NOT just punctuation
    const alphaChars = sheet_title.replace(/[^a-zA-Z]/g, '');
    if (alphaChars.length >= 4) {
      heuristicConfidence += 0.3;
      
      // Bonus for AEC keywords
      const upper = sheet_title.toUpperCase();
      if (aecKeywords.some(kw => upper.includes(kw))) {
        heuristicConfidence += 0.2;
      }
    }
  }
  
  // Add confidence for text layer existing
  if (textItems.length >= 30) {
    heuristicConfidence += 0.1;
  }
  
  // Infer discipline and kind
  const discipline = inferDiscipline(sheet_number, sheet_title);
  const sheet_kind = inferSheetKind(sheet_title);
  
  return {
    sheet_number,
    sheet_title,
    discipline,
    sheet_kind,
    confidence: Math.min(heuristicConfidence, 0.95),
    extraction_source: 'vector_text',
  };
}

// ============================================================
// VALIDATION: Check if extraction looks invalid
// ============================================================
function isExtractionInvalid(result: ExtractionResult): boolean {
  // No sheet number = weak
  if (!result.sheet_number) return true;
  
  // Title is invalid (just punctuation, very short, or garbage)
  if (result.sheet_title) {
    const alphaChars = result.sheet_title.replace(/[^a-zA-Z]/g, '');
    if (alphaChars.length < 4) return true;
    
    // Common garbage patterns
    if (/^[\s:.\-_,;]+$/.test(result.sheet_title)) return true;
    if (result.sheet_title.length < 4) return true;
  }
  
  return result.confidence < 0.75;
}

// ============================================================
// PASS 2: VISION FALLBACK (using Lovable AI Gateway)
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
// RENDER + CROP UTILITIES
// ============================================================
async function renderSheetToCanvas(
  page: PDFPageProxy,
  dpi: number = 150
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const scale = dpi / 72; // PDF is 72 DPI by default
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  return { canvas, width: viewport.width, height: viewport.height };
}

function cropTitleBlock(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): HTMLCanvasElement {
  // Title block: bottom-right 25% width x 20% height
  const cropWidth = Math.floor(width * 0.25);
  const cropHeight = Math.floor(height * 0.20);
  const cropX = width - cropWidth;
  const cropY = height - cropHeight;
  
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get crop canvas context');
  
  ctx.drawImage(
    canvas,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );
  
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
// MAIN: RUN SHEET INDEX V2 AND PERSIST
// ============================================================
export async function runSheetIndexV2AndPersist(params: {
  projectId: string;
  jobId: string;
  filePath: string;
  useVisionFallback?: boolean;
}): Promise<SheetIndexRow[]> {
  const { projectId, jobId, filePath, useVisionFallback = true } = params;
  
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
  
  const results: SheetIndexRow[] = [];
  const RENDER_DPI = 150;
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const sourceIndex = i - 1;
    
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Get text content for heuristic extraction
      const textContent = await page.getTextContent();
      
      // Pass 1: Heuristic extraction
      let result = extractFromTextItems(
        textContent.items as TextItem[],
        viewport.width,
        viewport.height
      );
      
      // Render sheet
      const { canvas, width, height } = await renderSheetToCanvas(page, RENDER_DPI);
      
      // Crop title block
      const titleBlockCanvas = cropTitleBlock(canvas, width, height);
      
      // Upload assets to storage
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
      
      // Pass 2: Vision fallback if extraction is weak
      if (useVisionFallback && isExtractionInvalid(result)) {
        const titleBlockBase64 = canvasToBase64(titleBlockCanvas);
        const visionResult = await extractWithVision(titleBlockBase64);
        
        if (visionResult.sheet_number || visionResult.sheet_title) {
          // Merge vision results
          result = {
            sheet_number: visionResult.sheet_number || result.sheet_number,
            sheet_title: visionResult.sheet_title || result.sheet_title,
            discipline: inferDiscipline(
              visionResult.sheet_number || result.sheet_number,
              visionResult.sheet_title || result.sheet_title
            ),
            sheet_kind: inferSheetKind(visionResult.sheet_title || result.sheet_title),
            confidence: calculateVisionConfidence(visionResult),
            extraction_source: 'vision_titleblock',
          };
        }
      }
      
      // Apply confidence penalties for invalid extraction
      let finalConfidence = result.confidence;
      if (!result.sheet_number) finalConfidence = Math.min(finalConfidence, 0.50);
      if (result.sheet_title) {
        const alphaChars = result.sheet_title.replace(/[^a-zA-Z]/g, '');
        if (alphaChars.length < 4) finalConfidence = Math.min(finalConfidence, 0.30);
      } else {
        finalConfidence = Math.min(finalConfidence, 0.40);
      }
      
      results.push({
        source_index: sourceIndex,
        sheet_number: result.sheet_number,
        sheet_title: result.sheet_title,
        discipline: result.discipline,
        sheet_kind: result.sheet_kind,
        confidence: finalConfidence,
        extraction_source: result.extraction_source,
        sheet_render_asset_path,
        title_block_asset_path,
      });
      
    } catch (error) {
      console.warn(`Failed to process sheet ${sourceIndex}:`, error);
      results.push({
        source_index: sourceIndex,
        sheet_number: null,
        sheet_title: null,
        discipline: null,
        sheet_kind: 'unknown',
        confidence: 0,
        extraction_source: 'unknown',
        sheet_render_asset_path: null,
        title_block_asset_path: null,
      });
    }
  }
  
  // Persist to database using upsert
  await persistSheetIndex(projectId, jobId, results);
  
  return results;
}

function calculateVisionConfidence(visionResult: { sheet_number: string | null; sheet_title: string | null }): number {
  let confidence = 0.50; // Base for vision
  
  if (visionResult.sheet_number) {
    confidence += 0.30;
    // Bonus for matching AEC pattern
    for (const pattern of SHEET_NUMBER_PATTERNS) {
      if (pattern.test(visionResult.sheet_number)) {
        confidence += 0.10;
        break;
      }
    }
  }
  
  if (visionResult.sheet_title && visionResult.sheet_title.length > 6) {
    const alphaChars = visionResult.sheet_title.replace(/[^a-zA-Z]/g, '');
    if (alphaChars.length >= 4) {
      confidence += 0.15;
    }
  }
  
  return Math.min(confidence, 0.95);
}

// ============================================================
// PERSISTENCE (upsert on job_id + source_index)
// ============================================================
async function persistSheetIndex(
  projectId: string,
  jobId: string,
  results: SheetIndexRow[]
): Promise<void> {
  // Batch in chunks of 50
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
    sheet_render_asset_path: row.sheet_render_asset_path,
    title_block_asset_path: row.title_block_asset_path,
  }));
}
