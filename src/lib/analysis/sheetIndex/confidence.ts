// ============================================================
// SHEET INDEX v3.0 - CONFIDENCE AS QA GATE (REQ-8)
// Deterministic calculation, not decoration
// ============================================================

import type { ExtractionSource } from '../types';
import { CONFIDENCE_BASE } from './types';
import { SHEET_NUMBER_PATTERNS } from './validation';

export interface ConfidenceParams {
  extraction_source: ExtractionSource;
  sheet_number: string | null;
  sheet_title: string | null;
  has_both_labels_in_cluster: boolean;
  title_passes_clean_checks: boolean;
  truncation_suspected: boolean;
  anchored_extraction: boolean;
}

export interface ConfidenceResult {
  confidence: number;
  flag_for_review: boolean;
  manual_flag: boolean;
  breakdown: string[];
}

/**
 * Calculate confidence deterministically based on extraction source and results
 * 
 * Base by extraction_source:
 * - vector_anchored: 0.95
 * - vector_heuristic: 0.80
 * - ocr_crop: 0.75
 * - vision_crop: 0.70
 * - vision_full: 0.60
 * 
 * Adjustments:
 * +0.03 if number+title found in same selected cluster
 * +0.03 if sheet_number pattern is top-tier
 * +0.02 if title passes clean letter/length checks
 * -0.10 if only one of (number/title) found
 * -0.20 if truncation suspected
 * 
 * Routing:
 * - confidence >= 0.85 → auto-accept
 * - 0.30 <= confidence < 0.85 → flag_for_review=true
 * - confidence < 0.30 → manual_flag=true
 */
export function calculateConfidenceV3(params: ConfidenceParams): ConfidenceResult {
  const breakdown: string[] = [];
  
  // Get base confidence
  const sourceKey = params.extraction_source === 'vector_text' 
    ? (params.anchored_extraction ? 'vector_anchored' : 'vector_heuristic')
    : params.extraction_source;
  
  let confidence = CONFIDENCE_BASE[sourceKey] ?? CONFIDENCE_BASE['unknown'];
  breakdown.push(`base(${sourceKey})=${confidence.toFixed(2)}`);
  
  // Adjustments
  
  // +0.03 if both number+title in same cluster
  if (params.has_both_labels_in_cluster) {
    confidence += 0.03;
    breakdown.push('+0.03(both_labels_in_cluster)');
  }
  
  // +0.03 if sheet_number pattern is top-tier (priority 3)
  if (params.sheet_number) {
    for (const { pattern, priority } of SHEET_NUMBER_PATTERNS) {
      if (pattern.test(params.sheet_number) && priority === 3) {
        confidence += 0.03;
        breakdown.push('+0.03(top_tier_pattern)');
        break;
      }
    }
  }
  
  // +0.02 if title passes clean checks
  if (params.title_passes_clean_checks) {
    confidence += 0.02;
    breakdown.push('+0.02(clean_title)');
  }
  
  // -0.10 if only one of (number/title) found
  const hasNumber = params.sheet_number !== null;
  const hasTitle = params.sheet_title !== null;
  if (hasNumber !== hasTitle) {
    confidence -= 0.10;
    breakdown.push('-0.10(missing_' + (hasNumber ? 'title' : 'number') + ')');
  }
  
  // -0.20 if truncation suspected
  if (params.truncation_suspected) {
    confidence -= 0.20;
    breakdown.push('-0.20(truncation_suspected)');
  }
  
  // Clamp to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));
  
  // Routing
  let flag_for_review = false;
  let manual_flag = false;
  
  if (confidence < 0.30) {
    manual_flag = true;
    breakdown.push('→ manual_flag');
  } else if (confidence < 0.85) {
    flag_for_review = true;
    breakdown.push('→ flag_for_review');
  } else {
    breakdown.push('→ auto_accept');
  }
  
  return {
    confidence,
    flag_for_review,
    manual_flag,
    breakdown,
  };
}
