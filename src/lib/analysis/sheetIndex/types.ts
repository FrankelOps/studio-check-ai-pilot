// ============================================================
// SHEET INDEX v3.0 - TYPES
// ============================================================

import type { SheetKind, ExtractionSource } from '../types';

/** Pixel-based bounding box (in render coordinate space) */
export interface PxBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A detected label with its bounding box and weight */
export interface LabelHit {
  text: string;
  label_type: 'number' | 'title' | 'moderate';
  weight: number;
  bbox: PxBBox;
  center: { x: number; y: number };
}

/** A cluster of labels that may represent a title block region */
export interface LabelCluster {
  members: LabelHit[];
  bbox: PxBBox;
  score: number;
  has_number_label: boolean;
  has_title_label: boolean;
  tightness_bonus: number;
  why_selected?: string;
}

/** An anchored value region adjacent to a label */
export interface AnchoredRegion {
  region_type: 'right_of' | 'below';
  label_used: string;
  bbox: PxBBox;
  candidates: string[];
  chosen: string | null;
  pass: boolean;
  rejection_reason?: string;
}

/** Rejection reasons for invalid values */
export type RejectionReason =
  | 'label_prefix_only'
  | 'scale_junk'
  | 'stamp_junk'
  | 'too_short'
  | 'invalid_number_pattern'
  | 'too_long'
  | 'insufficient_letters'
  | 'boilerplate'
  | 'other';

/** Confidence base by extraction source */
export const CONFIDENCE_BASE: Record<string, number> = {
  'vector_anchored': 0.95,
  'vector_heuristic': 0.80,
  'ocr_crop': 0.75,
  'vision_crop': 0.70,
  'vision_full': 0.60,
  'fail_crop': 0.30,
  'unknown': 0.20,
};

/** Extraction notes with full debugging info */
export interface ExtractionNotesV3 {
  // Label detection
  label_hits?: LabelHit[];
  
  // Clustering
  clusters?: Array<{
    bbox: PxBBox;
    score: number;
    members: string[];
    why_selected?: string;
  }>;
  selected_cluster_index?: number;
  
  // Anchored extraction
  anchored_regions?: AnchoredRegion[];
  
  // Fallback path
  fallback_path?: string[];
  
  // Crop evidence
  crop_attempt_paths?: string[];
  crop_locator?: PxBBox | null;
  
  // Rejection/validation
  rejection_reason?: RejectionReason;
  
  // Rotation
  rotation_issue?: boolean;
  rotation_degrees?: number;
  
  // Truncation detection
  truncation_suspected?: boolean;
  
  // Flags
  flag_for_review?: boolean;
  manual_flag?: boolean;
  
  // Performance
  timing_ms?: number;
  
  // Template (if used)
  template_rejected?: boolean;
  template_reject_reason?: string;
  
  // Vision
  vision_calls?: number;
  vision_reason?: string;
  
  // Generic catch-all
  [key: string]: unknown;
}

/** Full extraction result */
export interface ExtractionResultV3 {
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  sheet_kind: SheetKind;
  confidence: number;
  extraction_source: ExtractionSource;
  extraction_notes: ExtractionNotesV3;
}

/** Metadata for edge function calls */
export interface ExtractionMeta {
  jobId: string;
  projectId: string;
  sourceIndex: number;
  expectedDiscipline: string;
  phase: string;
  renderW?: number;
  renderH?: number;
  cropStrategy?: string;
  attempt?: number;
}

/** Text item from PDF.js with position */
export interface TextItemWithPos {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** Crop strategy types */
export type CropStrategy = 'vector_label' | 'fallback_br' | 'fallback_bottom_strip' | 'fail_crop' | 'unknown';
