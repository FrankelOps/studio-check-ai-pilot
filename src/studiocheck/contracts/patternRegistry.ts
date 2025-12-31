// ============================================================
// STUDIOCHECK PATTERN REGISTRY v1.0
// FROZEN - Do not modify without version bump
// ============================================================

export interface PatternDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  required_inputs: string[];
  blocked_by_preflight_conditions: string[];
  phase_1_enabled: boolean;
}

/**
 * PatternRegistryV1 - FROZEN CONTRACT
 * 
 * Contains exactly 7 patterns. Only P1 and P2 are enabled for Phase 1.
 * DO NOT add new patterns without versioning the registry.
 */
export const PatternRegistryV1: Record<string, PatternDefinition> = Object.freeze({
  P1: Object.freeze({
    id: 'P1',
    name: 'PresenceWithEvidence',
    version: '1.0.0',
    description: 'Detects callouts or references that point to missing sheets or missing details. Validates that referenced entities exist in the document set.',
    required_inputs: ['sheet_index', 'extracted_callouts'],
    blocked_by_preflight_conditions: ['sheet_indexing_failed'],
    phase_1_enabled: true,
  }),

  P2: Object.freeze({
    id: 'P2',
    name: 'SchedulePlanSync',
    version: '1.0.0',
    description: 'Cross-references schedule data (e.g., door schedule) with plan annotations (e.g., door tags). Phase 1 scope: Door Schedule vs Door Tags only.',
    required_inputs: ['sheet_index', 'schedule_tables', 'plan_annotations'],
    blocked_by_preflight_conditions: ['sheet_indexing_failed', 'schedule_extraction_failed'],
    phase_1_enabled: true,
  }),

  P3: Object.freeze({
    id: 'P3',
    name: 'CrossDisciplineBackgroundConsistency',
    version: '1.0.0',
    description: 'Validates that background/underlay sheets from other disciplines are consistent and up-to-date across referenced drawings.',
    required_inputs: ['sheet_index', 'background_layer_refs'],
    blocked_by_preflight_conditions: ['sheet_indexing_failed'],
    phase_1_enabled: false,
  }),

  P4: Object.freeze({
    id: 'P4',
    name: 'CoverageByScope',
    version: '1.0.0',
    description: 'Ensures all scoped areas/rooms have corresponding coverage in relevant discipline sheets (e.g., every room has electrical coverage).',
    required_inputs: ['sheet_index', 'scope_areas', 'discipline_coverage_maps'],
    blocked_by_preflight_conditions: ['sheet_indexing_failed', 'scope_extraction_failed'],
    phase_1_enabled: false,
  }),

  P5: Object.freeze({
    id: 'P5',
    name: 'ConstraintComplianceADA',
    version: '1.0.0',
    description: 'Checks ADA clearance requirements against extracted dimensions. REQUIRES scale metadata to compute real-world measurements.',
    required_inputs: ['sheet_index', 'extracted_dimensions', 'scale_metadata'],
    blocked_by_preflight_conditions: ['sheet_indexing_failed', 'scale_not_detected'],
    phase_1_enabled: false,
  }),

  P6: Object.freeze({
    id: 'P6',
    name: 'SymbolLegendMatch',
    version: '1.0.0',
    description: 'Validates that all symbols used in drawings are defined in the legend and vice versa.',
    required_inputs: ['sheet_index', 'legend_symbols', 'drawing_symbols'],
    blocked_by_preflight_conditions: ['sheet_indexing_failed', 'legend_extraction_failed'],
    phase_1_enabled: false,
  }),

  P7: Object.freeze({
    id: 'P7',
    name: 'DetailReferenceIntegrity',
    version: '1.0.0',
    description: 'Ensures all detail callouts (e.g., "See Detail 3/A501") reference existing details on the target sheet.',
    required_inputs: ['sheet_index', 'detail_callouts', 'detail_definitions'],
    blocked_by_preflight_conditions: ['sheet_indexing_failed'],
    phase_1_enabled: false,
  }),
}) as Record<string, PatternDefinition>;

/**
 * Get all patterns enabled for Phase 1
 */
export function getPhase1Patterns(): PatternDefinition[] {
  return Object.values(PatternRegistryV1).filter(p => p.phase_1_enabled);
}

/**
 * Check if a pattern is blocked by a given preflight condition
 */
export function isPatternBlocked(patternId: string, conditions: string[]): boolean {
  const pattern = PatternRegistryV1[patternId];
  if (!pattern) return true;
  return pattern.blocked_by_preflight_conditions.some(c => conditions.includes(c));
}

/**
 * Get pattern by ID
 */
export function getPattern(patternId: string): PatternDefinition | undefined {
  return PatternRegistryV1[patternId];
}
