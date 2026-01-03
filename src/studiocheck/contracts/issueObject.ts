import { z } from 'zod';

// ============================================================
// STUDIOCHECK ISSUE OBJECT CONTRACT v1.0
// FROZEN - Do not modify without version bump
// ============================================================

/**
 * Custom Zod refinement that rejects any object containing "page" or "page_number" fields
 * This enforces the global constraint: NO PDF PAGE NUMBERS anywhere
 */
const noPageFieldsRefinement = (obj: Record<string, unknown>, ctx: z.RefinementCtx) => {
  const checkForPageFields = (o: unknown, path: string[] = []): void => {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      for (const [key, value] of Object.entries(o as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'page' || lowerKey === 'page_number' || lowerKey === 'pagenumber') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Field "${key}" is forbidden. Use sheet_id instead of page references.`,
            path: [...path, key],
          });
        }
        checkForPageFields(value, [...path, key]);
      }
    } else if (Array.isArray(o)) {
      o.forEach((item, index) => checkForPageFields(item, [...path, String(index)]));
    }
  };
  checkForPageFields(obj);
};

// ============================================================
// EVIDENCE ITEM SCHEMA
// ============================================================

export const EvidenceItemSchema = z.object({
  sheet_id: z.string().min(1, 'sheet_id is required'),
  bounding_box: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).strict().optional(),
  table_row: z.object({
    sheet_id: z.string(),
    row_index: z.number(),
    column_values: z.record(z.string()),
  }).strict().optional(),
  snippet_text: z.string().min(1, 'snippet_text is required'),
  extraction_method: z.enum(['ocr', 'vision', 'text_layer', 'table_parser']),
  confidence: z.number().min(0).max(1),
}).strict();

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ============================================================
// LOCATION CONTEXT SCHEMA
// ============================================================

export const LocationContextSchema = z.object({
  primary_sheet: z.string().min(1, 'primary_sheet is required'),
  secondary_sheets: z.array(z.string()).optional(),
  entity_refs: z.array(z.object({
    type: z.string(),
    id: z.string(),
    label: z.string().optional(),
  }).strict()).optional(),
}).strict();

export type LocationContext = z.infer<typeof LocationContextSchema>;

// ============================================================
// RISK PROFILE SCHEMA
// ============================================================

export const RiskProfileSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  impact_type: z.string().min(1),
  rationale: z.string().min(1),
}).strict();

export type RiskProfile = z.infer<typeof RiskProfileSchema>;

// ============================================================
// FINDING SCHEMA
// ============================================================

export const FindingSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
}).strict();

// ============================================================
// RECOMMENDATION SCHEMA
// ============================================================

export const RecommendationSchema = z.object({
  action: z.string().min(1),
  responsible_party: z.string().optional(),
}).strict();

// ============================================================
// QUALITY SCHEMA
// ============================================================

export const QualitySchema = z.object({
  confidence_overall: z.number().min(0).max(1),
  suppression_notes: z.string().optional(),
}).strict();

// ============================================================
// TRACE SCHEMA
// ============================================================

export const TraceSchema = z.object({
  model: z.string().min(1),
  prompt_hash: z.string().optional(),
  run_id: z.string().min(1),
}).strict();

// ============================================================
// PREFLIGHT RESULT SCHEMA
// ============================================================

export const PreflightWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
});

export const PreflightResultSchema = z.object({
  result: z.enum(['PASS', 'PASS_WITH_LIMITATIONS', 'FAIL']),
  warnings: z.array(PreflightWarningSchema),
  blocked_patterns: z.array(z.string()),
  indexing_summary: z.object({
    total_pages: z.number(),
    pages_tested: z.number(),
    success_rate: z.number().min(0).max(1),
    avg_confidence: z.number().min(0).max(1),
  }),
});

export type PreflightResult = z.infer<typeof PreflightResultSchema>;

// ============================================================
// ISSUE OBJECT V1 SCHEMA (FROZEN CONTRACT)
// ============================================================

const IssueObjectBaseSchema = z.object({
  issue_id: z.string().uuid(),
  pattern_id: z.string().min(1, 'pattern_id is required'),
  pattern_version: z.string().min(1, 'pattern_version is required'),
  phase_context: z.enum(['SD', 'DD', 'CD']),
  finding: FindingSchema,
  location_context: LocationContextSchema,
  evidence: z.array(EvidenceItemSchema).min(1, 'Evidence array must not be empty'),
  risk: RiskProfileSchema,
  recommendation: RecommendationSchema,
  quality: QualitySchema,
  trace: TraceSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
}).strict();

/**
 * Helper to detect forbidden page keys anywhere in an object (deep recursive check)
 */
function containsForbiddenPageKeys(value: unknown): boolean {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.some(item => containsForbiddenPageKeys(item));
    }
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'page' || lowerKey === 'page_number' || lowerKey === 'pagenumber') {
        return true;
      }
      if (containsForbiddenPageKeys(val)) {
        return true;
      }
    }
  }
  return false;
}

export const IssueObjectSchemaV1 = z.preprocess(
  (val) => {
    // Check for forbidden page keys BEFORE Zod strips unknown fields
    if (containsForbiddenPageKeys(val)) {
      // Return a marker that will fail validation
      return { __hasForbiddenPageKeys: true };
    }
    return val;
  },
  IssueObjectBaseSchema
).refine(
  (val) => !(val as Record<string, unknown>).__hasForbiddenPageKeys,
  { message: 'Page/page_number fields are forbidden. Use sheet_id instead.' }
);

export type IssueObjectV1 = z.infer<typeof IssueObjectSchemaV1>;

// ============================================================
// VALIDATION HELPER
// ============================================================

export function validateIssueObject(data: unknown): { success: true; data: IssueObjectV1 } | { success: false; errors: z.ZodError } {
  const result = IssueObjectSchemaV1.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// ============================================================
// SHEET INDEX ENTRY (for Part 3)
// ============================================================

export const SheetIndexEntrySchema = z.object({
  sheet_id: z.string().min(1),
  sheet_title: z.string().optional(),
  discipline: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence_snip_ref: z.string().optional(),
});

export type SheetIndexEntry = z.infer<typeof SheetIndexEntrySchema>;
