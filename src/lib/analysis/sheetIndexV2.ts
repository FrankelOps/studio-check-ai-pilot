// ============================================================
// STUDIOCHECK SHEET INDEX V2 - STAGE 0
// Extracts sheet metadata from PDF title blocks
// ============================================================

import { supabase } from '@/integrations/supabase/client';
import { extractSheetId, inferDiscipline, parseTitleBlockText } from '@/studiocheck/indexing/sheetIndexer';
import type { SheetIndexRow, SheetKind } from './types';

// PDF.js types
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent(): Promise<{
    items: Array<{
      str: string;
      transform: number[];
    }>;
  }>;
}

interface PDFjsLib {
  getDocument(params: { data: ArrayBuffer }): { promise: Promise<PDFDocumentProxy> };
}

// Lazy load PDF.js
let pdfjsLib: PDFjsLib | null = null;

async function getPdfJs(): Promise<PDFjsLib> {
  if (pdfjsLib) return pdfjsLib;
  
  const pdfjs = await import('pdfjs-dist');
  const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  
  pdfjsLib = pdfjs as unknown as PDFjsLib;
  return pdfjsLib;
}

/**
 * Discipline prefix mapping
 */
const DISCIPLINE_PREFIX_MAP: Record<string, string> = {
  'A': 'Architectural',
  'S': 'Structural',
  'M': 'Mechanical',
  'P': 'Plumbing',
  'E': 'Electrical',
  'FP': 'Fire Protection',
  'FA': 'Fire Alarm',
  'F': 'Fire Protection',
  'C': 'Civil',
  'L': 'Landscape',
  'I': 'Interior',
  'G': 'General',
  'T': 'Telecommunications',
  'D': 'Demolition',
  'X': 'Existing',
};

/**
 * Infer sheet kind from title text
 */
function inferSheetKind(title: string | null): SheetKind {
  if (!title) return 'unknown';
  
  const upperTitle = title.toUpperCase();
  
  if (upperTitle.includes('SCHEDULE')) return 'schedule';
  if (upperTitle.includes('RCP') || upperTitle.includes('REFLECTED CEILING')) return 'rcp';
  if (upperTitle.includes('DETAIL')) return 'detail';
  if (upperTitle.includes('LEGEND')) return 'legend';
  if (upperTitle.includes('SECTION')) return 'detail';
  if (upperTitle.includes('ELEVATION')) return 'detail';
  if (upperTitle.includes('PLAN')) return 'plan';
  if (upperTitle.includes('FLOOR')) return 'plan';
  if (upperTitle.includes('ROOF')) return 'plan';
  if (upperTitle.includes('SITE')) return 'plan';
  if (upperTitle.includes('COVER') || upperTitle.includes('TITLE')) return 'general';
  if (upperTitle.includes('INDEX') || upperTitle.includes('SHEET LIST')) return 'general';
  if (upperTitle.includes('NOTE') || upperTitle.includes('GENERAL')) return 'general';
  
  return 'unknown';
}

/**
 * Infer discipline from sheet number or title
 */
function inferDisciplineFromContext(sheetNumber: string | null, title: string | null): string | null {
  // Try sheet number prefix first
  if (sheetNumber) {
    // Handle two-letter prefixes first (FP, FA)
    const twoLetterPrefix = sheetNumber.substring(0, 2).toUpperCase();
    if (DISCIPLINE_PREFIX_MAP[twoLetterPrefix]) {
      return DISCIPLINE_PREFIX_MAP[twoLetterPrefix];
    }
    
    // Try single letter prefix
    const oneLetterPrefix = sheetNumber.charAt(0).toUpperCase();
    if (DISCIPLINE_PREFIX_MAP[oneLetterPrefix]) {
      return DISCIPLINE_PREFIX_MAP[oneLetterPrefix];
    }
  }
  
  // Fallback to title keywords
  if (title) {
    const upperTitle = title.toUpperCase();
    if (upperTitle.includes('MECHANICAL') || upperTitle.includes('HVAC')) return 'Mechanical';
    if (upperTitle.includes('PLUMBING')) return 'Plumbing';
    if (upperTitle.includes('ELECTRICAL')) return 'Electrical';
    if (upperTitle.includes('STRUCTURAL')) return 'Structural';
    if (upperTitle.includes('FIRE')) return 'Fire Protection';
    if (upperTitle.includes('CIVIL')) return 'Civil';
    if (upperTitle.includes('ARCH') || upperTitle.includes('FLOOR PLAN')) return 'Architectural';
    if (upperTitle.includes('INTERIOR')) return 'Interior';
    if (upperTitle.includes('LANDSCAPE')) return 'Landscape';
  }
  
  return null;
}

/**
 * Extract text from bottom portion of page (title block region)
 */
async function extractTitleBlockText(page: PDFPageProxy): Promise<string> {
  try {
    const textContent = await page.getTextContent();
    
    // Get all text items
    const items = textContent.items as Array<{ str: string; transform: number[] }>;
    if (items.length === 0) return '';
    
    // Sort by Y position (bottom items have lower Y in PDF coordinate system)
    // PDF coordinates: origin at bottom-left
    const sortedItems = items
      .filter(item => item.str.trim().length > 0)
      .sort((a, b) => {
        // transform[5] is the Y coordinate
        return a.transform[5] - b.transform[5];
      });
    
    // Take bottom 30% of items (likely title block)
    const bottomCount = Math.max(10, Math.floor(sortedItems.length * 0.3));
    const bottomItems = sortedItems.slice(0, bottomCount);
    
    // Also include items from the right side (title block often on right)
    const maxX = Math.max(...items.map(item => item.transform[4]));
    const rightThreshold = maxX * 0.6;
    const rightItems = items.filter(item => item.transform[4] > rightThreshold);
    
    // Combine and deduplicate
    const allRelevantItems = [...new Set([...bottomItems, ...rightItems])];
    
    // Return concatenated text
    return allRelevantItems.map(item => item.str.trim()).join('\n');
  } catch {
    return '';
  }
}

/**
 * Run sheet index extraction and persist results
 */
export async function runSheetIndexV2AndPersist(params: {
  projectId: string;
  jobId: string;
  filePath: string;
  pdfBytes?: ArrayBuffer; // Optional: reuse bytes from preflight
}): Promise<SheetIndexRow[]> {
  const { projectId, jobId, filePath } = params;
  let { pdfBytes } = params;
  
  // Download PDF if bytes not provided
  if (!pdfBytes) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from('project-files')
      .download(filePath);
    
    if (downloadError || !blob) {
      console.error('Failed to download file for sheet indexing:', downloadError);
      return [];
    }
    
    pdfBytes = await blob.arrayBuffer();
  }
  
  try {
    const pdfjs = await getPdfJs();
    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    
    const sheetRows: SheetIndexRow[] = [];
    
    // Process each sheet
    for (let i = 1; i <= pdf.numPages; i++) {
      const sourceIndex = i - 1; // 0-based internal index
      
      try {
        const page = await pdf.getPage(i);
        const titleBlockText = await extractTitleBlockText(page);
        
        // Use existing sheetIndexer to parse
        const parsed = parseTitleBlockText(titleBlockText);
        
        // If parser didn't find sheet ID, try extracting from full text
        let sheetNumber = parsed.sheetId;
        let sheetTitle = parsed.sheetTitle;
        let confidence = parsed.confidence;
        
        if (!sheetNumber && titleBlockText) {
          // Try to find any sheet ID pattern in the text
          const lines = titleBlockText.split('\n');
          for (const line of lines) {
            const result = extractSheetId(line);
            if (result) {
              sheetNumber = result.sheetId;
              confidence = result.confidence * 0.8; // Lower confidence for fallback
              break;
            }
          }
        }
        
        // If still no title, try to find the longest meaningful line
        if (!sheetTitle && titleBlockText) {
          const lines = titleBlockText.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 5 && /[a-zA-Z]{3,}/.test(l))
            .filter(l => !extractSheetId(l)); // Exclude sheet IDs
          
          if (lines.length > 0) {
            // Pick the longest line that looks like a title
            sheetTitle = lines.sort((a, b) => b.length - a.length)[0];
          }
        }
        
        const discipline = sheetNumber 
          ? inferDiscipline(sheetNumber) 
          : inferDisciplineFromContext(sheetNumber, sheetTitle);
        
        const sheetKind = inferSheetKind(sheetTitle);
        
        sheetRows.push({
          source_index: sourceIndex,
          sheet_number: sheetNumber,
          sheet_title: sheetTitle,
          discipline,
          sheet_kind: sheetKind,
          confidence: confidence || (sheetNumber ? 0.6 : 0.2),
        });
        
      } catch (pageError) {
        console.warn(`Error processing sheet at index ${sourceIndex}:`, pageError);
        // Add placeholder for failed sheet
        sheetRows.push({
          source_index: sourceIndex,
          sheet_number: null,
          sheet_title: null,
          discipline: null,
          sheet_kind: 'unknown',
          confidence: 0,
        });
      }
    }
    
    // Persist to database (upsert for idempotency)
    await persistSheetIndex(projectId, jobId, sheetRows);
    
    return sheetRows;
    
  } catch (error) {
    console.error('Sheet index extraction error:', error);
    return [];
  }
}

/**
 * Persist sheet index rows to database
 */
async function persistSheetIndex(
  projectId: string,
  jobId: string,
  rows: SheetIndexRow[]
): Promise<void> {
  if (rows.length === 0) return;
  
  // Delete existing rows for this job (idempotency)
  await supabase
    .from('analysis_sheet_index_v2' as any)
    .delete()
    .eq('job_id', jobId);
  
  // Insert new rows
  const insertRows = rows.map(row => ({
    project_id: projectId,
    job_id: jobId,
    source_index: row.source_index,
    sheet_number: row.sheet_number,
    sheet_title: row.sheet_title,
    discipline: row.discipline,
    sheet_kind: row.sheet_kind,
    confidence: row.confidence,
  }));
  
  const { error } = await supabase
    .from('analysis_sheet_index_v2' as any)
    .insert(insertRows);
  
  if (error) {
    console.error('Failed to persist sheet index:', error);
    throw new Error('Failed to save sheet index');
  }
}

/**
 * Fetch sheet index for a job
 */
export async function fetchSheetIndex(jobId: string): Promise<SheetIndexRow[]> {
  const { data, error } = await supabase
    .from('analysis_sheet_index_v2' as any)
    .select('*')
    .eq('job_id', jobId)
    .order('source_index', { ascending: true });
  
  if (error || !data) return [];
  
  return data.map((row: any) => ({
    source_index: row.source_index,
    sheet_number: row.sheet_number,
    sheet_title: row.sheet_title,
    discipline: row.discipline,
    sheet_kind: row.sheet_kind as SheetKind,
    confidence: Number(row.confidence),
  }));
}
