// ============================================================
// SHEET INDEX v3.0 - STRIP-THEN-VALIDATE (REQ-5, REQ-6)
// Never blind reject - strip label prefixes first
// ============================================================

import type { RejectionReason } from './types';

/**
 * Sheet number patterns (AEC standard formats)
 * Ordered by priority (higher = better)
 */
export const SHEET_NUMBER_PATTERNS = [
  { pattern: /\b([A-Z]{1,2})(\d{3,4}(?:\.\d{1,2})?)\b/i, priority: 3 },
  { pattern: /\b([A-Z]{1,2})[-.](\d{2,4}(?:\.\d{1,2})?)\b/i, priority: 3 },
  { pattern: /\b([A-Z]{1,2})(\d)[-.](\d{2,3})\b/i, priority: 2 },
  { pattern: /\b(FP|FA|FS|ID|LP|EL)[-.]?(\d{2,4})\b/i, priority: 2 },
  { pattern: /\b([A-Z])[-.]?(\d{2,4})\b/i, priority: 1 },
];

/**
 * Title prefix patterns to strip (case-insensitive)
 */
const TITLE_PREFIX_PATTERN = /^(SHEET\s*(TITLE|NAME)\s*[:.]?\s*|DRAWING\s*TITLE\s*[:.]?\s*|TITLE\s*[:.]?\s*)/i;

/**
 * Number prefix patterns to strip (case-insensitive)
 */
const NUMBER_PREFIX_PATTERN = /^(SHEET\s*(NO\.?|NUMBER|#)\s*[:.]?\s*|DRAWING\s*(NO\.?|NUMBER)\s*[:.]?\s*|DWG\.?\s*(NO\.?|NUMBER)\s*[:.]?\s*|SHT\.?\s*(NO\.?|NUMBER)\s*[:.]?\s*)/i;

/**
 * Junk patterns - reject AFTER stripping
 */
const SCALE_JUNK_PATTERN = /^(NOT\s*TO\s*SCALE|SCALE\s*[:.].*)$/i;
const STAMP_JUNK_PATTERN = /^(ISSUED\s*FOR\b.*|NOT\s*FOR\s*CONSTRUCTION|PRELIMINARY|BID\s*SET|REVIEW\s*SET|FOR\s*REVIEW)$/i;
const LABEL_REMNANT_PATTERN = /^(SHEET|DRAWING|DWG|SHT|TITLE)\b[:.]?$/i;

/**
 * Truncation indicators at end of title
 */
const TRUNCATION_ENDINGS = ['AND', 'PROJECT', 'INFORMATION', 'THE', 'TO', 'FOR', 'OF', 'IN', 'AT', 'WITH'];

/**
 * Normalize candidate string: collapse whitespace, trim punctuation at ends
 */
export function normalizeCandidate(raw: string): string {
  if (!raw) return '';
  
  // Collapse whitespace
  let normalized = raw.replace(/\s+/g, ' ').trim();
  
  // Trim punctuation at ends
  normalized = normalized.replace(/^[:\-.,;]+\s*/, '');
  normalized = normalized.replace(/\s*[:\-.,;]+$/, '');
  
  return normalized;
}

/**
 * Strip label prefix from candidate (for title extraction)
 */
export function stripTitlePrefix(candidate: string): { stripped: string; hadPrefix: boolean } {
  const stripped = candidate.replace(TITLE_PREFIX_PATTERN, '').trim();
  return {
    stripped,
    hadPrefix: stripped !== candidate,
  };
}

/**
 * Strip label prefix from candidate (for number extraction)
 */
export function stripNumberPrefix(candidate: string): { stripped: string; hadPrefix: boolean } {
  const stripped = candidate.replace(NUMBER_PREFIX_PATTERN, '').trim();
  return {
    stripped,
    hadPrefix: stripped !== candidate,
  };
}

/**
 * Validate and score a sheet number candidate
 * Returns null if invalid, or { value, priority } if valid
 */
export function validateSheetNumber(candidate: string): { 
  valid: boolean; 
  value: string | null; 
  priority: number;
  rejection_reason?: RejectionReason;
} {
  const normalized = normalizeCandidate(candidate);
  const { stripped } = stripNumberPrefix(normalized);
  
  if (!stripped || stripped.length < 2) {
    return { valid: false, value: null, priority: 0, rejection_reason: 'too_short' };
  }
  
  // Check against patterns (ordered by priority)
  for (const { pattern, priority } of SHEET_NUMBER_PATTERNS) {
    const match = stripped.match(pattern);
    if (match) {
      // Reconstruct normalized sheet number
      const groups = match.slice(1).filter(Boolean);
      const value = groups.join('').toUpperCase().replace(/[-.]/g, '');
      return { valid: true, value, priority };
    }
  }
  
  return { valid: false, value: null, priority: 0, rejection_reason: 'invalid_number_pattern' };
}

/**
 * Validate and score a sheet title candidate
 * Returns rejection reason if invalid
 */
export function validateSheetTitle(candidate: string): {
  valid: boolean;
  value: string | null;
  score: number;
  rejection_reason?: RejectionReason;
  truncation_suspected?: boolean;
} {
  const normalized = normalizeCandidate(candidate);
  const { stripped, hadPrefix } = stripTitlePrefix(normalized);
  
  // Empty after stripping
  if (!stripped) {
    return { valid: false, value: null, score: 0, rejection_reason: hadPrefix ? 'label_prefix_only' : 'too_short' };
  }
  
  // Too short
  if (stripped.length < 4) {
    return { valid: false, value: null, score: 0, rejection_reason: 'too_short' };
  }
  
  // Too long
  if (stripped.length > 120) {
    return { valid: false, value: null, score: 0, rejection_reason: 'too_long' };
  }
  
  // Scale junk
  if (SCALE_JUNK_PATTERN.test(stripped)) {
    return { valid: false, value: null, score: 0, rejection_reason: 'scale_junk' };
  }
  
  // Stamp junk
  if (STAMP_JUNK_PATTERN.test(stripped)) {
    return { valid: false, value: null, score: 0, rejection_reason: 'stamp_junk' };
  }
  
  // Label remnant
  if (LABEL_REMNANT_PATTERN.test(stripped)) {
    return { valid: false, value: null, score: 0, rejection_reason: 'label_prefix_only' };
  }
  
  // Must contain >= 4 letters
  const letters = (stripped.match(/[a-zA-Z]/g) || []).length;
  if (letters < 4) {
    return { valid: false, value: null, score: 0, rejection_reason: 'insufficient_letters' };
  }
  
  // Check for truncation
  const words = stripped.toUpperCase().split(/\s+/);
  const lastWord = words[words.length - 1];
  const truncation_suspected = TRUNCATION_ENDINGS.includes(lastWord);
  
  // Calculate score
  let score = 0;
  score += 5; // Base for valid title
  if (!hadPrefix) score += 2; // Bonus for clean extraction
  if (!truncation_suspected) score += 2; // Bonus for complete title
  
  // Check for AEC keywords
  const AEC_KEYWORDS = [
    'PLAN', 'FLOOR', 'ROOF', 'RCP', 'REFLECTED', 'CEILING',
    'SCHEDULE', 'DETAIL', 'SECTION', 'ELEVATION', 'LEGEND',
    'MECHANICAL', 'ELECTRICAL', 'PLUMBING', 'STRUCTURAL',
    'LEVEL', 'SITE', 'BASEMENT', 'GROUND', 'TYPICAL',
  ];
  const upperStripped = stripped.toUpperCase();
  if (AEC_KEYWORDS.some(kw => upperStripped.includes(kw))) {
    score += 3;
  }
  
  return { 
    valid: true, 
    value: stripped, 
    score,
    truncation_suspected,
  };
}

/**
 * Choose best candidate from multiple options
 */
export function chooseBestCandidate<T extends { score: number; valid: boolean }>(
  candidates: T[]
): T | null {
  const valid = candidates.filter(c => c.valid);
  if (valid.length === 0) return null;
  
  valid.sort((a, b) => b.score - a.score);
  return valid[0];
}
