// ============================================================
// STUDIOCHECK CONTRACTS - PUBLIC API
// ============================================================

export {
  IssueObjectSchemaV1,
  EvidenceItemSchema,
  LocationContextSchema,
  RiskProfileSchema,
  PreflightResultSchema,
  SheetIndexEntrySchema,
  validateIssueObject,
  type IssueObjectV1,
  type EvidenceItem,
  type LocationContext,
  type RiskProfile,
  type PreflightResult,
  type SheetIndexEntry,
} from './issueObject';

export {
  PatternRegistryV1,
  getPhase1Patterns,
  isPatternBlocked,
  getPattern,
  type PatternDefinition,
} from './patternRegistry';
