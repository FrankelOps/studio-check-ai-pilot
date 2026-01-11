// ============================================================
// P1 RUN ARCH COMPLETENESS - Deterministic checks + issue emission
// Performs P1A, P1B, P1C checks and emits IssueObjectV1 records
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RunRequest {
  jobId: string;
  projectId: string;
  phaseContext?: "SD" | "DD" | "CD";
}

interface IssueObjectV1 {
  issue_id: string;
  pattern_id: string;
  pattern_version: string;
  phase_context: "SD" | "DD" | "CD";
  finding: {
    title: string;
    summary: string;
    description: string;
  };
  location_context: {
    primary_sheet: string;
    secondary_sheets?: string[];
    entity_refs?: Array<{ type: string; id: string; label?: string }>;
  };
  evidence: Array<{
    sheet_id: string;
    bounding_box?: { x: number; y: number; width: number; height: number };
    table_row?: { sheet_id: string; row_index: number; column_values: Record<string, string> };
    snippet_text: string;
    extraction_method: "ocr" | "vision" | "text_layer" | "table_parser";
    confidence: number;
  }>;
  risk: {
    severity: "LOW" | "MEDIUM" | "HIGH";
    impact_type: string;
    rationale: string;
  };
  recommendation: {
    action: string;
    responsible_party?: string;
  };
  quality: {
    confidence_overall: number;
    suppression_notes?: string;
  };
  trace: {
    model: string;
    prompt_hash?: string;
    run_id: string;
  };
  created_at: string;
}

function generateUUID(): string {
  return crypto.randomUUID();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Validate issue has no forbidden page fields
function validateIssue(issue: IssueObjectV1): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const checkForPageFields = (obj: unknown, path: string = ""): void => {
    if (obj && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "page" || lowerKey === "page_number" || lowerKey === "pagenumber") {
          errors.push(`Forbidden field "${key}" found at ${path}`);
        }
        checkForPageFields(value, `${path}.${key}`);
      }
    }
  };
  checkForPageFields(issue);

  if (!issue.pattern_id) errors.push("Missing pattern_id");
  if (!issue.pattern_version) errors.push("Missing pattern_version");
  if (!issue.location_context?.primary_sheet) errors.push("Missing primary_sheet");
  if (!issue.evidence || issue.evidence.length === 0) errors.push("Evidence array is empty");
  
  issue.evidence?.forEach((e, i) => {
    if (!e.sheet_id) errors.push(`Evidence[${i}] missing sheet_id`);
  });

  return { valid: errors.length === 0, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = generateUUID();
  const startTime = Date.now();

  try {
    const { jobId, projectId, phaseContext = "CD" } = (await req.json()) as RunRequest;

    if (!jobId || !projectId) {
      return json({ error: "jobId and projectId are required" }, 400);
    }

    console.log(`[p1-run] Starting P1 checks for job=${jobId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const issues: IssueObjectV1[] = [];
    const stats = {
      references_checked: 0,
      target_labels_checked: 0,
      door_tags_checked: 0,
      door_schedule_items_checked: 0,
      p1a_issues: 0,
      p1b_issues: 0,
      p1c_issues: 0,
    };

    // ================================================================
    // FETCH DATA
    // ================================================================

    // Get sheet index
    const { data: sheetIndex, error: sheetError } = await supabase
      .from("analysis_sheet_index_v2")
      .select("source_index, sheet_number, sheet_title, discipline, sheet_kind, confidence")
      .eq("job_id", jobId);

    if (sheetError || !sheetIndex) {
      console.error("[p1-run] Failed to fetch sheet index:", sheetError);
      return json({ status: "error", error: "Failed to fetch sheet index" }, 500);
    }

    const sheetNumbers = new Set(sheetIndex.map(s => s.sheet_number).filter(Boolean));
    console.log(`[p1-run] Sheet index has ${sheetNumbers.size} sheets`);

    // Get references
    const { data: references } = await supabase
      .from("analysis_references_v1")
      .select("*")
      .eq("job_id", jobId);

    // Get target labels
    const { data: targetLabels } = await supabase
      .from("analysis_target_labels_v1")
      .select("*")
      .eq("job_id", jobId);

    // Get door tags
    const { data: doorTags } = await supabase
      .from("analysis_door_tags_v1")
      .select("*")
      .eq("job_id", jobId);

    // Get door schedule items
    const { data: doorScheduleItems } = await supabase
      .from("analysis_door_schedule_items_v1")
      .select("*")
      .eq("job_id", jobId);

    console.log(`[p1-run] Data: ${references?.length || 0} refs, ${targetLabels?.length || 0} labels, ${doorTags?.length || 0} tags, ${doorScheduleItems?.length || 0} schedule items`);

    // ================================================================
    // P1A: FORWARD REFERENCE INTEGRITY
    // ================================================================
    console.log("[p1-run] Running P1A: Forward Reference Integrity");

    if (references && references.length > 0) {
      for (const ref of references) {
        stats.references_checked++;

        // Check 1: Does target sheet exist?
        if (!sheetNumbers.has(ref.target_sheet_number)) {
          const issue: IssueObjectV1 = {
            issue_id: generateUUID(),
            pattern_id: "P1A_ReferenceForward",
            pattern_version: "1.0",
            phase_context: phaseContext,
            finding: {
              title: `Missing Target Sheet: ${ref.target_sheet_number}`,
              summary: `Reference on ${ref.calling_sheet_number} points to non-existent sheet ${ref.target_sheet_number}`,
              description: `A ${ref.ref_type} callout "${ref.snippet_text}" on sheet ${ref.calling_sheet_number} references sheet ${ref.target_sheet_number}, which does not exist in the document set. This indicates either a missing sheet or an incorrect reference.`,
            },
            location_context: {
              primary_sheet: ref.calling_sheet_number,
              secondary_sheets: [ref.target_sheet_number],
              entity_refs: [{ type: ref.ref_type, id: ref.ref_id }],
            },
            evidence: [{
              sheet_id: ref.calling_sheet_number,
              bounding_box: ref.bbox ? {
                x: ref.bbox.x,
                y: ref.bbox.y,
                width: ref.bbox.w,
                height: ref.bbox.h,
              } : undefined,
              snippet_text: ref.snippet_text,
              extraction_method: "vision",
              confidence: ref.confidence,
            }],
            risk: {
              severity: "HIGH",
              impact_type: "Documentation Completeness",
              rationale: "Missing referenced sheets create broken navigation and may indicate incomplete deliverables.",
            },
            recommendation: {
              action: `Add sheet ${ref.target_sheet_number} to the document set or correct the reference on ${ref.calling_sheet_number}.`,
              responsible_party: "Design Team",
            },
            quality: {
              confidence_overall: ref.confidence,
            },
            trace: {
              model: "p1-deterministic",
              run_id: runId,
            },
            created_at: new Date().toISOString(),
          };

          const validation = validateIssue(issue);
          if (validation.valid) {
            issues.push(issue);
            stats.p1a_issues++;
          }
          continue;
        }

        // Check 2: Does target label exist on target sheet?
        if (targetLabels && targetLabels.length > 0) {
          const matchingLabel = targetLabels.find(
            label => 
              label.target_sheet_number === ref.target_sheet_number &&
              label.label_type === ref.ref_type &&
              label.label_id === ref.ref_id
          );

          if (!matchingLabel && ref.confidence >= 0.80) {
            const issue: IssueObjectV1 = {
              issue_id: generateUUID(),
              pattern_id: "P1A_ReferenceForward",
              pattern_version: "1.0",
              phase_context: phaseContext,
              finding: {
                title: `Target Label Missing: ${ref.ref_type} ${ref.ref_id} on ${ref.target_sheet_number}`,
                summary: `Reference "${ref.snippet_text}" points to ${ref.ref_type} ${ref.ref_id} which was not found on ${ref.target_sheet_number}`,
                description: `Sheet ${ref.calling_sheet_number} references ${ref.ref_type} "${ref.ref_id}" on sheet ${ref.target_sheet_number}, but this ${ref.ref_type} identifier was not detected on the target sheet. The target sheet exists but the specific ${ref.ref_type} may be missing or mislabeled.`,
              },
              location_context: {
                primary_sheet: ref.calling_sheet_number,
                secondary_sheets: [ref.target_sheet_number],
                entity_refs: [{ type: ref.ref_type, id: ref.ref_id }],
              },
              evidence: [{
                sheet_id: ref.calling_sheet_number,
                bounding_box: ref.bbox ? {
                  x: ref.bbox.x,
                  y: ref.bbox.y,
                  width: ref.bbox.w,
                  height: ref.bbox.h,
                } : undefined,
                snippet_text: ref.snippet_text,
                extraction_method: "vision",
                confidence: ref.confidence,
              }],
              risk: {
                severity: "HIGH",
                impact_type: "Reference Integrity",
                rationale: "Callouts to non-existent details/sections cause confusion during construction.",
              },
              recommendation: {
                action: `Verify ${ref.ref_type} "${ref.ref_id}" exists on sheet ${ref.target_sheet_number} or correct the reference.`,
                responsible_party: "Design Team",
              },
              quality: {
                confidence_overall: Math.min(ref.confidence, 0.85),
                suppression_notes: "Label extraction may be incomplete",
              },
              trace: {
                model: "p1-deterministic",
                run_id: runId,
              },
              created_at: new Date().toISOString(),
            };

            const validation = validateIssue(issue);
            if (validation.valid) {
              issues.push(issue);
              stats.p1a_issues++;
            }
          }
        }
      }
    }

    // ================================================================
    // P1B: REVERSE REFERENCE COVERAGE
    // ================================================================
    console.log("[p1-run] Running P1B: Reverse Reference Coverage");

    if (targetLabels && targetLabels.length > 0) {
      for (const label of targetLabels) {
        stats.target_labels_checked++;

        // Check if any reference points to this label
        const isReferenced = references?.some(
          ref => 
            ref.target_sheet_number === label.target_sheet_number &&
            ref.ref_type === label.label_type &&
            ref.ref_id === label.label_id
        );

        if (!isReferenced) {
          // Suppress if label is TYP/TYPICAL (defensive, should already be filtered)
          const typPattern = /^(TYP|TYPICAL|NOT\s*USED)$/i;
          if (typPattern.test(label.label_id)) continue;

          const issue: IssueObjectV1 = {
            issue_id: generateUUID(),
            pattern_id: "P1B_ReferenceReverse",
            pattern_version: "1.0",
            phase_context: phaseContext,
            finding: {
              title: `Unreferenced ${label.label_type}: ${label.label_id} on ${label.target_sheet_number}`,
              summary: `${label.label_type} "${label.label_id}" on sheet ${label.target_sheet_number} is not referenced from any plan sheet`,
              description: `Sheet ${label.target_sheet_number} contains ${label.label_type} "${label.label_id}" (${label.snippet_text}), but no callout references this ${label.label_type} from any architectural plan sheet. This may indicate orphaned content or missing callouts.`,
            },
            location_context: {
              primary_sheet: label.target_sheet_number,
              entity_refs: [{ type: label.label_type, id: label.label_id }],
            },
            evidence: [{
              sheet_id: label.target_sheet_number,
              bounding_box: label.bbox ? {
                x: label.bbox.x,
                y: label.bbox.y,
                width: label.bbox.w,
                height: label.bbox.h,
              } : undefined,
              snippet_text: label.snippet_text,
              extraction_method: "vision",
              confidence: label.confidence,
            }],
            risk: {
              severity: "MEDIUM",
              impact_type: "Documentation Completeness",
              rationale: "Unreferenced details may be orphaned or may need callouts added to plan sheets.",
            },
            recommendation: {
              action: `Add reference callouts to ${label.label_type} "${label.label_id}" on relevant plan sheets, or remove if obsolete.`,
              responsible_party: "Design Team",
            },
            quality: {
              confidence_overall: label.confidence,
            },
            trace: {
              model: "p1-deterministic",
              run_id: runId,
            },
            created_at: new Date().toISOString(),
          };

          const validation = validateIssue(issue);
          if (validation.valid) {
            issues.push(issue);
            stats.p1b_issues++;
          }
        }
      }
    }

    // ================================================================
    // P1C: BIDIRECTIONAL DOOR SCHEDULE SYNC
    // ================================================================
    console.log("[p1-run] Running P1C: Door Schedule Sync");

    const scheduleDoorIds = new Set(doorScheduleItems?.map(d => d.door_id) || []);
    const planDoorIds = new Set(doorTags?.map(d => d.door_id) || []);

    // Forward: Tags → Schedule
    if (doorTags && doorTags.length > 0) {
      for (const tag of doorTags) {
        stats.door_tags_checked++;

        if (!scheduleDoorIds.has(tag.door_id)) {
          const issue: IssueObjectV1 = {
            issue_id: generateUUID(),
            pattern_id: "P1C_DoorScheduleSync",
            pattern_version: "1.0",
            phase_context: phaseContext,
            finding: {
              title: `Door Tag Missing in Schedule: ${tag.door_id}`,
              summary: `Door "${tag.door_id}" on ${tag.sheet_number} has no entry in the door schedule`,
              description: `Door tag "${tag.door_id}" appears on floor plan ${tag.sheet_number} but is not listed in the door schedule. This may result in undefined hardware, dimensions, or specifications for this door.`,
            },
            location_context: {
              primary_sheet: tag.sheet_number,
              entity_refs: [{ type: "door", id: tag.door_id }],
            },
            evidence: [{
              sheet_id: tag.sheet_number,
              bounding_box: tag.bbox ? {
                x: tag.bbox.x,
                y: tag.bbox.y,
                width: tag.bbox.w,
                height: tag.bbox.h,
              } : undefined,
              snippet_text: tag.snippet_text,
              extraction_method: "vision",
              confidence: tag.confidence,
            }],
            risk: {
              severity: "MEDIUM",
              impact_type: "Schedule Consistency",
              rationale: "Doors not in schedule may lack specifications needed for ordering and installation.",
            },
            recommendation: {
              action: `Add door "${tag.door_id}" to the door schedule with appropriate specifications.`,
              responsible_party: "Architect",
            },
            quality: {
              confidence_overall: tag.confidence,
            },
            trace: {
              model: "p1-deterministic",
              run_id: runId,
            },
            created_at: new Date().toISOString(),
          };

          const validation = validateIssue(issue);
          if (validation.valid) {
            issues.push(issue);
            stats.p1c_issues++;
          }
        }
      }
    }

    // Reverse: Schedule → Tags
    if (doorScheduleItems && doorScheduleItems.length > 0) {
      for (const scheduleItem of doorScheduleItems) {
        stats.door_schedule_items_checked++;

        if (!planDoorIds.has(scheduleItem.door_id)) {
          const issue: IssueObjectV1 = {
            issue_id: generateUUID(),
            pattern_id: "P1C_DoorScheduleSync",
            pattern_version: "1.0",
            phase_context: phaseContext,
            finding: {
              title: `Scheduled Door Not Found on Plans: ${scheduleItem.door_id}`,
              summary: `Door "${scheduleItem.door_id}" in schedule on ${scheduleItem.schedule_sheet_number} not found on any plan`,
              description: `The door schedule lists door "${scheduleItem.door_id}" (${scheduleItem.snippet_text}) but this door number was not found tagged on any floor plan. This may indicate an orphaned schedule entry or missing door tag on plans.`,
            },
            location_context: {
              primary_sheet: scheduleItem.schedule_sheet_number,
              entity_refs: [{ type: "door", id: scheduleItem.door_id }],
            },
            evidence: [{
              sheet_id: scheduleItem.schedule_sheet_number,
              bounding_box: scheduleItem.row_bbox ? {
                x: scheduleItem.row_bbox.x,
                y: scheduleItem.row_bbox.y,
                width: scheduleItem.row_bbox.w,
                height: scheduleItem.row_bbox.h,
              } : undefined,
              snippet_text: scheduleItem.snippet_text,
              extraction_method: "vision",
              confidence: scheduleItem.confidence,
            }],
            risk: {
              severity: "MEDIUM",
              impact_type: "Schedule Consistency",
              rationale: "Orphaned schedule entries may cause confusion or indicate deleted doors.",
            },
            recommendation: {
              action: `Verify door "${scheduleItem.door_id}" exists on plans or remove from schedule if obsolete.`,
              responsible_party: "Architect",
            },
            quality: {
              confidence_overall: scheduleItem.confidence,
            },
            trace: {
              model: "p1-deterministic",
              run_id: runId,
            },
            created_at: new Date().toISOString(),
          };

          const validation = validateIssue(issue);
          if (validation.valid) {
            issues.push(issue);
            stats.p1c_issues++;
          }
        }
      }
    }

    // ================================================================
    // PERSIST ISSUES
    // ================================================================
    console.log(`[p1-run] Persisting ${issues.length} issues`);

    for (const issue of issues) {
      const { error: insertError } = await supabase
        .from("analysis_issues_v1")
        .insert({
          project_id: projectId,
          job_id: jobId,
          pattern_id: issue.pattern_id,
          pattern_version: issue.pattern_version,
          issue_json: issue,
        });

      if (insertError) {
        console.error(`[p1-run] Failed to insert issue:`, insertError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[p1-run] Complete in ${duration}ms`);

    return json({
      status: "success",
      run_id: runId,
      issues_written: issues.length,
      stats,
      duration_ms: duration,
    });

  } catch (error) {
    console.error("[p1-run] Error:", error);
    return json({
      status: "error",
      run_id: runId,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
