// ============================================================
// STUDIOCHECK SHEET INDEXER v1.0
// Deterministic sheet indexing from title block OCR
// ============================================================

import type { SheetIndexEntry } from '../contracts';

/**
 * Regex patterns for common AEC sheet ID formats
 * Examples: A101, A-101, A1.01, M201, E-001, S1-101
 */
export const SHEET_ID_PATTERNS = [
  // Standard: A101, M201, E001
  /^([A-Z]{1,2})[-.]?(\d{3,4})$/i,
  // With separator: A-101, M.201
  /^([A-Z]{1,2})[-.](\d{2,4})$/i,
  // With sub-number: A1.01, S1-101
  /^([A-Z]{1,2})(\d)[-.](\d{2,3})$/i,
  // Cover sheets: G001, G-001
  /^(G)[-.]?(\d{3})$/i,
  // Civil: C1.0, C-1.0
  /^(C)[-.]?(\d{1,2})\.?(\d)?$/i,
];

/**
 * Discipline prefixes mapped to discipline names
 */
export const DISCIPLINE_MAP: Record<string, string> = {
  'A': 'Architectural',
  'S': 'Structural',
  'M': 'Mechanical',
  'P': 'Plumbing',
  'E': 'Electrical',
  'F': 'Fire Protection',
  'C': 'Civil',
  'L': 'Landscape',
  'I': 'Interior',
  'G': 'General',
  'T': 'Telecommunications',
  'D': 'Demo',
  'X': 'Existing Conditions',
};

/**
 * Extract sheet ID from text using regex patterns
 */
export function extractSheetId(text: string): { sheetId: string; confidence: number } | null {
  // Clean the text
  const cleaned = text.trim().toUpperCase();
  
  // Try each pattern
  for (const pattern of SHEET_ID_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      // Reconstruct the sheet ID in normalized form
      const prefix = match[1];
      const number = match.slice(2).filter(Boolean).join('');
      const sheetId = `${prefix}${number}`;
      
      // Higher confidence for longer matches and standard formats
      const confidence = sheetId.length >= 4 ? 0.95 : 0.85;
      
      return { sheetId, confidence };
    }
  }
  
  // Try looser pattern for edge cases
  const looseMatch = cleaned.match(/^([A-Z]{1,2})\s*[-.]?\s*(\d{2,4})$/i);
  if (looseMatch) {
    const sheetId = `${looseMatch[1]}${looseMatch[2]}`;
    return { sheetId, confidence: 0.75 };
  }
  
  return null;
}

/**
 * Infer discipline from sheet ID prefix
 */
export function inferDiscipline(sheetId: string): string {
  const prefix = sheetId.charAt(0).toUpperCase();
  return DISCIPLINE_MAP[prefix] || 'Unknown';
}

/**
 * Title block crop regions to try (relative coordinates 0-1)
 */
export const TITLE_BLOCK_REGIONS = [
  { name: 'bottom_right', x: 0.65, y: 0.85, width: 0.35, height: 0.15 },
  { name: 'bottom_center', x: 0.3, y: 0.85, width: 0.4, height: 0.15 },
  { name: 'right_edge', x: 0.85, y: 0.3, width: 0.15, height: 0.7 },
  { name: 'bottom_full', x: 0.0, y: 0.85, width: 1.0, height: 0.15 },
];

/**
 * Result from attempting to extract sheet ID from a single region
 */
export interface RegionExtractionResult {
  region: string;
  sheetId: string | null;
  sheetTitle: string | null;
  confidence: number;
  rawText: string;
}

/**
 * Parse OCR text from title block to extract sheet ID and title
 */
export function parseTitleBlockText(text: string): { sheetId: string | null; sheetTitle: string | null; confidence: number } {
  if (!text || text.trim().length < 2) {
    return { sheetId: null, sheetTitle: null, confidence: 0 };
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let bestMatch: { sheetId: string; confidence: number } | null = null;
  let sheetTitle: string | null = null;

  for (const line of lines) {
    // Try to extract sheet ID
    const result = extractSheetId(line);
    if (result && (!bestMatch || result.confidence > bestMatch.confidence)) {
      bestMatch = result;
    }

    // Look for sheet title patterns (usually near "SHEET TITLE" or just a descriptive line)
    const titlePatterns = [
      /(?:SHEET\s*TITLE|DRAWING\s*TITLE)[:\s]*(.+)/i,
      /(?:FLOOR\s*PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE)[:\s]*(.+)/i,
    ];

    for (const pattern of titlePatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        sheetTitle = match[1].trim();
        break;
      }
    }
  }

  // If we found a sheet ID, also look for a descriptive title on adjacent lines
  if (bestMatch && !sheetTitle) {
    for (const line of lines) {
      // Skip the sheet ID line itself
      if (line.toUpperCase().includes(bestMatch.sheetId)) continue;
      
      // Look for descriptive text (more than 3 chars, contains letters)
      if (line.length > 3 && /[a-zA-Z]{3,}/.test(line) && !/^[A-Z]{1,2}\d{2,4}$/i.test(line)) {
        sheetTitle = line;
        break;
      }
    }
  }

  return {
    sheetId: bestMatch?.sheetId || null,
    sheetTitle,
    confidence: bestMatch?.confidence || 0,
  };
}

/**
 * Build sheet index from extracted title block data
 * This is called by the preflight/orchestrator after OCR extraction
 */
export function buildSheetIndexFromExtractions(
  extractions: Array<{
    sheetId: string;
    sheetTitle?: string;
    confidence: number;
    evidenceSnipRef?: string;
  }>
): SheetIndexEntry[] {
  return extractions
    .filter(e => e.sheetId && e.confidence >= 0.5) // Include lower confidence for index, mark appropriately
    .map(e => ({
      sheet_id: e.sheetId,
      sheet_title: e.sheetTitle,
      discipline: inferDiscipline(e.sheetId),
      confidence: e.confidence,
      evidence_snip_ref: e.evidenceSnipRef,
    }));
}

/**
 * Validate sheet index for completeness
 */
export function validateSheetIndex(index: SheetIndexEntry[], totalPages: number): {
  valid: boolean;
  successRate: number;
  avgConfidence: number;
  unindexedCount: number;
} {
  const indexed = index.filter(e => e.confidence >= 0.85);
  const successRate = totalPages > 0 ? indexed.length / totalPages : 0;
  const avgConfidence = index.length > 0
    ? index.reduce((sum, e) => sum + e.confidence, 0) / index.length
    : 0;

  return {
    valid: successRate >= 0.9,
    successRate,
    avgConfidence,
    unindexedCount: totalPages - indexed.length,
  };
}
