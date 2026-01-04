// ============================================================
// STUDIOCHECK ANALYSIS TYPES - STAGE 0
// ============================================================

/**
 * Preflight status enum
 */
export type PreflightStatus = 'PASS' | 'PASS_WITH_LIMITATIONS' | 'FAIL';

/**
 * Preflight flag representing a quality issue found
 */
export interface PreflightFlag {
  code: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
}

/**
 * Preflight recommendation for improving document quality
 */
export interface PreflightRecommendation {
  code: string;
  message: string;
}

/**
 * Preflight metrics collected during analysis
 */
export interface PreflightMetrics {
  total_sheets: number;
  text_layer_coverage_ratio: number;
  sheets_with_text_layer: number;
  sheets_with_rotation: number;
  encrypted_or_error: boolean;
}

/**
 * Complete preflight report
 */
export interface PreflightReport {
  status: PreflightStatus;
  flags: PreflightFlag[];
  recommendations: PreflightRecommendation[];
  metrics: PreflightMetrics;
}

/**
 * Sheet kind enum for categorizing drawing types
 */
export type SheetKind = 'plan' | 'rcp' | 'schedule' | 'detail' | 'legend' | 'general' | 'unknown';

/**
 * Extraction source indicating how the sheet data was extracted
 */
export type ExtractionSource = 'vector_text' | 'vision_titleblock' | 'unknown';

/**
 * Sheet index row representing a single sheet in the document
 * Note: source_index is 0-based internal ordering (NOT a "page number")
 */
export interface SheetIndexRow {
  source_index: number;
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  sheet_kind: SheetKind;
  confidence: number;
  extraction_source?: ExtractionSource;
  sheet_render_asset_path?: string | null;
  title_block_asset_path?: string | null;
}

/**
 * Database row for analysis_preflight_reports
 */
export interface PreflightReportRow {
  id: string;
  project_id: string;
  job_id: string;
  created_by: string;
  status: PreflightStatus;
  flags: PreflightFlag[];
  recommendations: PreflightRecommendation[];
  metrics: PreflightMetrics;
  created_at: string;
}

/**
 * Database row for analysis_sheet_index_v2
 */
export interface SheetIndexV2Row {
  id: string;
  project_id: string;
  job_id: string;
  source_index: number;
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  sheet_kind: SheetKind;
  confidence: number;
  title_block_asset_path: string | null;
  sheet_render_asset_path: string | null;
  created_at: string;
}
