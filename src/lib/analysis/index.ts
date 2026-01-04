// ============================================================
// STUDIOCHECK ANALYSIS - PUBLIC API
// ============================================================

export type {
  PreflightStatus,
  PreflightFlag,
  PreflightRecommendation,
  PreflightMetrics,
  PreflightReport,
  SheetKind,
  SheetIndexRow,
  PreflightReportRow,
  SheetIndexV2Row,
  ExtractionSource,
} from './types';

export {
  runPdfPreflightAndPersist,
  fetchPreflightReport,
} from './preflight';

export {
  runSheetIndexV2AndPersist,
  fetchSheetIndex,
} from './sheetIndexV2';
