// ============================================================
// SHEET INDEX v3.0 - LABEL DETECTION (REQ-1)
// Strong label lexicon only - BAN generic "SHEET"
// ============================================================

import type { LabelHit, TextItemWithPos, PxBBox } from './types';

/** 
 * Number label patterns (weight 3)
 * "SHEET NO", "SHEET NUMBER", "SHEET #", "DRAWING NO", "DWG NO", "DWG. NO.", "SHT. NO."
 */
const NUMBER_LABEL_PATTERNS = [
  /\bSHEET\s*(NO\.?|NUMBER|#)\b/i,
  /\bDRAWING\s*(NO\.?|NUMBER)\b/i,
  /\bDWG\.?\s*(NO\.?|NUMBER)\b/i,
  /\bSHT\.?\s*(NO\.?|NUMBER)\b/i,
];

/**
 * Title label patterns (weight 3)
 * "SHEET TITLE", "DRAWING TITLE", "TITLE:"
 */
const TITLE_LABEL_PATTERNS = [
  /\bSHEET\s*TITLE\b/i,
  /\bDRAWING\s*TITLE\b/i,
  /\bTITLE\s*:/i,
];

/**
 * Moderate alias patterns (weight 2)
 * "TITLE" alone - only counts if a number label is in the same cluster
 */
const MODERATE_LABEL_PATTERNS = [
  /^TITLE$/i,
];

/**
 * Convert PDF coordinates to render pixel coordinates
 * PDF text Y is bottom-origin; canvas Y is top-origin
 */
export function toRenderPx(
  item: { x: number; y: number; width?: number; height?: number },
  viewportW: number,
  viewportH: number,
  renderScale: number
): { x: number; y: number; w: number; h: number } {
  const x = item.x * renderScale;
  const y = (viewportH - item.y) * renderScale;
  const w = (item.width || 0) * renderScale;
  const h = (item.height || 0) * renderScale;
  return { x, y, w, h };
}

/**
 * Detect all label hits from text items
 * Returns array of LabelHit with bbox, weight, and label type
 */
export function detectLabelHits(params: {
  textItems: TextItemWithPos[];
  viewportW: number;
  viewportH: number;
  renderScale: number;
}): LabelHit[] {
  const { textItems, viewportW, viewportH, renderScale } = params;
  const hits: LabelHit[] = [];

  for (const item of textItems) {
    const text = item.text.trim();
    if (!text) continue;

    const pxPos = toRenderPx(item, viewportW, viewportH, renderScale);
    const bbox: PxBBox = {
      x: pxPos.x,
      y: pxPos.y - pxPos.h, // Adjust for text baseline
      w: Math.max(pxPos.w, 50), // Minimum width for label
      h: Math.max(pxPos.h, 20), // Minimum height
    };
    const center = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };

    // Check number labels (weight 3)
    for (const pattern of NUMBER_LABEL_PATTERNS) {
      if (pattern.test(text)) {
        hits.push({
          text,
          label_type: 'number',
          weight: 3,
          bbox,
          center,
        });
        break;
      }
    }

    // Check title labels (weight 3) - only if not already matched
    if (!hits.some(h => h.text === text && h.label_type === 'number')) {
      for (const pattern of TITLE_LABEL_PATTERNS) {
        if (pattern.test(text)) {
          hits.push({
            text,
            label_type: 'title',
            weight: 3,
            bbox,
            center,
          });
          break;
        }
      }
    }

    // Check moderate labels (weight 2) - only if not already matched
    if (!hits.some(h => h.text === text)) {
      for (const pattern of MODERATE_LABEL_PATTERNS) {
        if (pattern.test(text)) {
          hits.push({
            text,
            label_type: 'moderate',
            weight: 2,
            bbox,
            center,
          });
          break;
        }
      }
    }
  }

  return hits;
}

/**
 * Get median label height from detected labels
 * Used for scale-normalized clustering epsilon
 */
export function getMedianLabelHeight(hits: LabelHit[]): number {
  if (hits.length === 0) return 30; // Default fallback
  
  const heights = hits.map(h => h.bbox.h).sort((a, b) => a - b);
  const mid = Math.floor(heights.length / 2);
  
  if (heights.length % 2 === 0) {
    return (heights[mid - 1] + heights[mid]) / 2;
  }
  return heights[mid];
}

/**
 * Get median label width from detected labels
 */
export function getMedianLabelWidth(hits: LabelHit[]): number {
  if (hits.length === 0) return 100; // Default fallback
  
  const widths = hits.map(h => h.bbox.w).sort((a, b) => a - b);
  const mid = Math.floor(widths.length / 2);
  
  if (widths.length % 2 === 0) {
    return (widths[mid - 1] + widths[mid]) / 2;
  }
  return widths[mid];
}
