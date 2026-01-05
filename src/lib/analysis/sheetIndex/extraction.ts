// ============================================================
// SHEET INDEX v3.0 - LABEL-ANCHORED VALUE EXTRACTION (REQ-4)
// Read values adjacent to detected labels, not random text
// ============================================================

import type { LabelHit, AnchoredRegion, TextItemWithPos, PxBBox } from './types';
import { toRenderPx } from './labels';
import { validateSheetNumber, validateSheetTitle, normalizeCandidate } from './validation';

/**
 * Clamp value to range [min, max]
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if a point is inside a bounding box
 */
function pointInBBox(px: number, py: number, bbox: PxBBox): boolean {
  return px >= bbox.x && px <= bbox.x + bbox.w && py >= bbox.y && py <= bbox.y + bbox.h;
}

/**
 * Calculate "right-of" region for a label
 * Used to find values placed to the right of labels
 */
function getRightOfRegion(label: LabelHit): PxBBox {
  const lw = label.bbox.w;
  const lh = label.bbox.h;
  
  return {
    x: label.bbox.x + label.bbox.w + clamp(0.25 * lw, 10, 30),
    y: label.bbox.y - clamp(0.50 * lh, 10, 40),
    w: clamp(6.0 * lw, 250, 900),
    h: clamp(2.5 * lh, 80, 220),
  };
}

/**
 * Calculate "below" region for a label
 * Used to find values placed below labels
 */
function getBelowRegion(label: LabelHit, isTitle: boolean = false): PxBBox {
  const lw = label.bbox.w;
  const lh = label.bbox.h;
  
  // Title labels get taller below region
  const heightMultiplier = isTitle ? 7.0 : 5.0;
  const maxHeight = isTitle ? 650 : 520;
  
  return {
    x: label.bbox.x - clamp(0.25 * lw, 10, 40),
    y: label.bbox.y + label.bbox.h + clamp(0.25 * lh, 8, 25),
    w: clamp(10.0 * lw, 450, 1400),
    h: clamp(heightMultiplier * lh, isTitle ? 200 : 140, maxHeight),
  };
}

/**
 * Extract text items whose center lies inside a region
 */
function getTextInRegion(params: {
  textItems: TextItemWithPos[];
  region: PxBBox;
  viewportW: number;
  viewportH: number;
  renderScale: number;
}): string[] {
  const { textItems, region, viewportW, viewportH, renderScale } = params;
  
  const results: string[] = [];
  
  for (const item of textItems) {
    const px = toRenderPx(item, viewportW, viewportH, renderScale);
    const centerX = px.x + px.w / 2;
    const centerY = px.y - px.h / 2; // Adjust for text baseline
    
    if (pointInBBox(centerX, centerY, region)) {
      const text = normalizeCandidate(item.text);
      if (text.length > 0) {
        results.push(text);
      }
    }
  }
  
  return results;
}

/**
 * Extract sheet number from anchored regions around number labels
 */
export function extractSheetNumberAnchored(params: {
  numberLabels: LabelHit[];
  textItems: TextItemWithPos[];
  viewportW: number;
  viewportH: number;
  renderScale: number;
}): {
  value: string | null;
  confidence_bonus: number;
  regions: AnchoredRegion[];
} {
  const { numberLabels, textItems, viewportW, viewportH, renderScale } = params;
  const regions: AnchoredRegion[] = [];
  
  interface Candidate {
    value: string;
    priority: number;
    label: string;
    region_type: 'right_of' | 'below';
  }
  
  const candidates: Candidate[] = [];
  
  for (const label of numberLabels) {
    // Try right-of region first
    const rightRegion = getRightOfRegion(label);
    const rightTexts = getTextInRegion({
      textItems,
      region: rightRegion,
      viewportW,
      viewportH,
      renderScale,
    });
    
    let rightChosen: string | null = null;
    let rightPass = false;
    let rightRejection: string | undefined;
    
    for (const text of rightTexts) {
      const validation = validateSheetNumber(text);
      if (validation.valid && validation.value) {
        candidates.push({
          value: validation.value,
          priority: validation.priority,
          label: label.text,
          region_type: 'right_of',
        });
        rightChosen = validation.value;
        rightPass = true;
        break;
      } else if (!rightRejection) {
        rightRejection = validation.rejection_reason;
      }
    }
    
    regions.push({
      region_type: 'right_of',
      label_used: label.text,
      bbox: rightRegion,
      candidates: rightTexts,
      chosen: rightChosen,
      pass: rightPass,
      rejection_reason: rightRejection,
    });
    
    // Try below region
    const belowRegion = getBelowRegion(label, false);
    const belowTexts = getTextInRegion({
      textItems,
      region: belowRegion,
      viewportW,
      viewportH,
      renderScale,
    });
    
    let belowChosen: string | null = null;
    let belowPass = false;
    let belowRejection: string | undefined;
    
    for (const text of belowTexts) {
      const validation = validateSheetNumber(text);
      if (validation.valid && validation.value) {
        candidates.push({
          value: validation.value,
          priority: validation.priority,
          label: label.text,
          region_type: 'below',
        });
        belowChosen = validation.value;
        belowPass = true;
        break;
      } else if (!belowRejection) {
        belowRejection = validation.rejection_reason;
      }
    }
    
    regions.push({
      region_type: 'below',
      label_used: label.text,
      bbox: belowRegion,
      candidates: belowTexts,
      chosen: belowChosen,
      pass: belowPass,
      rejection_reason: belowRejection,
    });
  }
  
  // Choose best candidate by priority, then shortest length
  if (candidates.length === 0) {
    return { value: null, confidence_bonus: 0, regions };
  }
  
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.value.length - b.value.length;
  });
  
  return {
    value: candidates[0].value,
    confidence_bonus: 0.05, // Anchored extraction bonus
    regions,
  };
}

/**
 * Extract sheet title from anchored regions around title labels
 */
export function extractSheetTitleAnchored(params: {
  titleLabels: LabelHit[];
  textItems: TextItemWithPos[];
  viewportW: number;
  viewportH: number;
  renderScale: number;
}): {
  value: string | null;
  confidence_bonus: number;
  truncation_suspected: boolean;
  regions: AnchoredRegion[];
} {
  const { titleLabels, textItems, viewportW, viewportH, renderScale } = params;
  const regions: AnchoredRegion[] = [];
  
  interface Candidate {
    value: string;
    score: number;
    truncation_suspected: boolean;
    label: string;
    region_type: 'right_of' | 'below';
  }
  
  const candidates: Candidate[] = [];
  
  for (const label of titleLabels) {
    // Try right-of region first
    const rightRegion = getRightOfRegion(label);
    const rightTexts = getTextInRegion({
      textItems,
      region: rightRegion,
      viewportW,
      viewportH,
      renderScale,
    });
    
    let rightChosen: string | null = null;
    let rightPass = false;
    let rightRejection: string | undefined;
    
    for (const text of rightTexts) {
      const validation = validateSheetTitle(text);
      if (validation.valid && validation.value) {
        candidates.push({
          value: validation.value,
          score: validation.score,
          truncation_suspected: validation.truncation_suspected || false,
          label: label.text,
          region_type: 'right_of',
        });
        rightChosen = validation.value;
        rightPass = true;
        break;
      } else if (!rightRejection) {
        rightRejection = validation.rejection_reason;
      }
    }
    
    regions.push({
      region_type: 'right_of',
      label_used: label.text,
      bbox: rightRegion,
      candidates: rightTexts,
      chosen: rightChosen,
      pass: rightPass,
      rejection_reason: rightRejection,
    });
    
    // Try below region (with taller height for titles)
    const belowRegion = getBelowRegion(label, true);
    const belowTexts = getTextInRegion({
      textItems,
      region: belowRegion,
      viewportW,
      viewportH,
      renderScale,
    });
    
    let belowChosen: string | null = null;
    let belowPass = false;
    let belowRejection: string | undefined;
    
    for (const text of belowTexts) {
      const validation = validateSheetTitle(text);
      if (validation.valid && validation.value) {
        candidates.push({
          value: validation.value,
          score: validation.score,
          truncation_suspected: validation.truncation_suspected || false,
          label: label.text,
          region_type: 'below',
        });
        belowChosen = validation.value;
        belowPass = true;
        break;
      } else if (!belowRejection) {
        belowRejection = validation.rejection_reason;
      }
    }
    
    regions.push({
      region_type: 'below',
      label_used: label.text,
      bbox: belowRegion,
      candidates: belowTexts,
      chosen: belowChosen,
      pass: belowPass,
      rejection_reason: belowRejection,
    });
  }
  
  // Choose best candidate by score
  if (candidates.length === 0) {
    return { value: null, confidence_bonus: 0, truncation_suspected: false, regions };
  }
  
  candidates.sort((a, b) => b.score - a.score);
  
  return {
    value: candidates[0].value,
    confidence_bonus: 0.05, // Anchored extraction bonus
    truncation_suspected: candidates[0].truncation_suspected,
    regions,
  };
}
