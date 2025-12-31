import "jsr:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// STUDIOCHECK ORCHESTRATOR v1.0
// Phase 1: P1 (PresenceWithEvidence) + P2 (SchedulePlanSync - Door only)
// NO MONOLITHIC PROMPTS
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RunInput {
  fileId: string;
  projectId: string;
  declaredPhase: "SD" | "DD" | "CD";
}

interface SheetIndexEntry {
  sheet_id: string;
  sheet_title?: string;
  discipline: string;
  confidence: number;
}

interface EvidenceItem {
  sheet_id: string;
  bounding_box?: { x: number; y: number; width: number; height: number };
  table_row?: { sheet_id: string; row_index: number; column_values: Record<string, string> };
  snippet_text: string;
  extraction_method: "ocr" | "vision" | "text_layer" | "table_parser";
  confidence: number;
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
  evidence: EvidenceItem[];
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

// Validate issue object has no page fields and has required evidence
function validateIssue(issue: IssueObjectV1): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for forbidden page fields
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

  // Required fields
  if (!issue.pattern_id) errors.push("Missing pattern_id");
  if (!issue.pattern_version) errors.push("Missing pattern_version");
  if (!issue.location_context?.primary_sheet) errors.push("Missing primary_sheet");
  if (!issue.evidence || issue.evidence.length === 0) errors.push("Evidence array is empty");
  if (issue.quality?.confidence_overall < 0 || issue.quality?.confidence_overall > 1) {
    errors.push("confidence_overall must be between 0 and 1");
  }

  // Each evidence must have sheet_id
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
    const { fileId, projectId, declaredPhase } = (await req.json()) as RunInput;

    if (!fileId || !projectId || !declaredPhase) {
      return json({ error: "fileId, projectId, and declaredPhase are required" }, 400);
    }

    console.log(`[ORCHESTRATOR] Run ${runId}: file=${fileId}, project=${projectId}, phase=${declaredPhase}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ============================================================
    // STEP 1: Call Preflight
    // ============================================================
    console.log(`[ORCHESTRATOR] Step 1: Preflight check`);
    
    const preflightResponse = await fetch(`${supabaseUrl}/functions/v1/studiocheck-preflight`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileId, projectId }),
    });

    const preflight = await preflightResponse.json();

    if (preflight.result === "FAIL") {
      console.log(`[ORCHESTRATOR] Preflight FAILED - aborting analysis`);
      return json({
        run_id: runId,
        status: "PREFLIGHT_FAILED",
        preflight,
        issues_count: 0,
        issues: [],
      });
    }

    console.log(`[ORCHESTRATOR] Preflight ${preflight.result}`);

    // ============================================================
    // STEP 2: Build Sheet Index
    // ============================================================
    console.log(`[ORCHESTRATOR] Step 2: Building sheet index`);
    
    const sheetIndex: SheetIndexEntry[] = [];
    const pdfcoApiKey = Deno.env.get("PDFCO_API_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    // Get file URL
    const { data: fileData } = await supabase
      .from("uploaded_files")
      .select("file_path")
      .eq("id", fileId)
      .single();

    const { data: signedUrlData } = await supabase
      .storage
      .from("project-files")
      .createSignedUrl(fileData!.file_path, 3600);

    const pdfUrl = signedUrlData!.signedUrl;

    // Get PDF info for total pages
    const pdfInfoResponse = await fetch("https://api.pdf.co/v1/pdf/info", {
      method: "POST",
      headers: {
        "x-api-key": pdfcoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: pdfUrl }),
    });
    const pdfInfo = await pdfInfoResponse.json();
    const totalPages = pdfInfo.pageCount || 0;

    // Rasterize all pages for sheet indexing
    const rasterResponse = await fetch("https://api.pdf.co/v1/pdf/convert/to/png", {
      method: "POST",
      headers: {
        "x-api-key": pdfcoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: pdfUrl,
        pages: `0-${totalPages - 1}`,
        async: false,
      }),
    });
    
    const rasterResult = await rasterResponse.json();
    const pageImages = rasterResult.urls || [];

    // Extract sheet IDs from each page using vision
    for (let i = 0; i < pageImages.length; i++) {
      try {
        const visionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Extract the sheet ID and title from this construction drawing's title block.
Respond ONLY with JSON:
{
  "sheet_id": "A101" or null,
  "sheet_title": "FIRST FLOOR PLAN" or null,
  "confidence": 0.0-1.0
}`
              },
              {
                role: "user",
                content: [{ type: "image_url", image_url: { url: pageImages[i], detail: "high" } }]
              }
            ],
            max_tokens: 150,
          }),
        });

        const visionResult = await visionResponse.json();
        const content = visionResult.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.sheet_id && parsed.confidence >= 0.5) {
            const discipline = parsed.sheet_id.match(/^([A-Z]{1,2})/)?.[1] || "X";
            const disciplineMap: Record<string, string> = {
              A: "Architectural", S: "Structural", M: "Mechanical",
              P: "Plumbing", E: "Electrical", C: "Civil", G: "General",
            };
            sheetIndex.push({
              sheet_id: parsed.sheet_id,
              sheet_title: parsed.sheet_title,
              discipline: disciplineMap[discipline] || "Other",
              confidence: parsed.confidence,
            });
          }
        }
      } catch (err) {
        console.error(`[ORCHESTRATOR] Sheet index extraction failed for image ${i}:`, err);
      }
    }

    console.log(`[ORCHESTRATOR] Built sheet index with ${sheetIndex.length} entries`);

    // ============================================================
    // STEP 3: Run Pattern P1 - PresenceWithEvidence
    // ============================================================
    console.log(`[ORCHESTRATOR] Step 3: Running P1 (PresenceWithEvidence)`);
    
    const issues: IssueObjectV1[] = [];
    const sheetIds = new Set(sheetIndex.map(s => s.sheet_id));

    // For each page, look for callouts/references to other sheets
    for (let i = 0; i < pageImages.length; i++) {
      const currentSheet = sheetIndex[i];
      if (!currentSheet) continue;

      try {
        const calloutResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Find all sheet references and detail callouts in this construction drawing.
Look for patterns like:
- "SEE SHEET A102"
- "SEE DETAIL 3/A501"
- "REFER TO M201"
- Callout bubbles with sheet numbers

Respond ONLY with JSON array:
[
  {
    "reference_type": "sheet" | "detail",
    "target_sheet_id": "A102",
    "callout_text": "SEE SHEET A102",
    "confidence": 0.0-1.0
  }
]

Return empty array [] if no references found.`
              },
              {
                role: "user",
                content: [{ type: "image_url", image_url: { url: pageImages[i], detail: "high" } }]
              }
            ],
            max_tokens: 500,
          }),
        });

        const calloutResult = await calloutResponse.json();
        const content = calloutResult.choices?.[0]?.message?.content || "[]";
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
          const callouts = JSON.parse(jsonMatch[0]);
          
          for (const callout of callouts) {
            if (callout.target_sheet_id && callout.confidence >= 0.7) {
              // Check if referenced sheet exists in index
              if (!sheetIds.has(callout.target_sheet_id)) {
                const issue: IssueObjectV1 = {
                  issue_id: generateUUID(),
                  pattern_id: "P1",
                  pattern_version: "1.0.0",
                  phase_context: declaredPhase,
                  finding: {
                    title: `Missing Referenced Sheet: ${callout.target_sheet_id}`,
                    summary: `Sheet ${currentSheet.sheet_id} references ${callout.target_sheet_id} which was not found in the document set.`,
                    description: `A callout on sheet ${currentSheet.sheet_id} points to sheet ${callout.target_sheet_id}, but this sheet does not exist in the indexed document set. This may indicate a missing sheet or incorrect reference.`,
                  },
                  location_context: {
                    primary_sheet: currentSheet.sheet_id,
                    secondary_sheets: [callout.target_sheet_id],
                    entity_refs: [{
                      type: callout.reference_type,
                      id: callout.target_sheet_id,
                      label: callout.callout_text,
                    }],
                  },
                  evidence: [{
                    sheet_id: currentSheet.sheet_id,
                    snippet_text: callout.callout_text,
                    extraction_method: "vision",
                    confidence: callout.confidence,
                  }],
                  risk: {
                    severity: "MEDIUM",
                    impact_type: "Coordination",
                    rationale: "Missing sheet references can cause confusion during construction and may indicate incomplete documentation.",
                  },
                  recommendation: {
                    action: `Verify if sheet ${callout.target_sheet_id} should be included in the set, or update the reference on ${currentSheet.sheet_id}.`,
                    responsible_party: "Design Team",
                  },
                  quality: {
                    confidence_overall: callout.confidence,
                  },
                  trace: {
                    model: "gpt-4o-mini",
                    run_id: runId,
                  },
                  created_at: new Date().toISOString(),
                };

                const validation = validateIssue(issue);
                if (validation.valid) {
                  issues.push(issue);
                } else {
                  console.warn(`[ORCHESTRATOR] P1 issue validation failed:`, validation.errors);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`[ORCHESTRATOR] P1 extraction failed for sheet ${i}:`, err);
      }
    }

    console.log(`[ORCHESTRATOR] P1 found ${issues.length} issues`);

    // ============================================================
    // STEP 4: Run Pattern P2 - SchedulePlanSync (Door Schedule only)
    // ============================================================
    console.log(`[ORCHESTRATOR] Step 4: Running P2 (SchedulePlanSync - Doors)`);

    // Find schedule sheets (typically "SCHEDULE" in title or discipline prefix)
    const scheduleSheets = sheetIndex.filter(s => 
      s.sheet_title?.toUpperCase().includes("SCHEDULE") ||
      s.sheet_title?.toUpperCase().includes("DOOR") ||
      s.sheet_id.startsWith("A0") // Common for schedule sheets
    );

    // Find plan sheets
    const planSheets = sheetIndex.filter(s =>
      s.sheet_title?.toUpperCase().includes("PLAN") ||
      s.sheet_title?.toUpperCase().includes("FLOOR")
    );

    // Extract door schedule data
    const doorScheduleData: Array<{ door_id: string; sheet_id: string; attributes: Record<string, string> }> = [];
    
    for (const sheet of scheduleSheets) {
      const sheetIdx = sheetIndex.findIndex(s => s.sheet_id === sheet.sheet_id);
      if (sheetIdx < 0 || sheetIdx >= pageImages.length) continue;

      try {
        const scheduleResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Extract door schedule entries from this drawing if present.
Look for a table with columns like: DOOR NO., WIDTH, HEIGHT, TYPE, HARDWARE, etc.

Respond ONLY with JSON:
{
  "is_door_schedule": true/false,
  "doors": [
    {
      "door_id": "101",
      "width": "3'-0\"",
      "height": "7'-0\"",
      "type": "A"
    }
  ]
}

Return {"is_door_schedule": false, "doors": []} if not a door schedule.`
              },
              {
                role: "user",
                content: [{ type: "image_url", image_url: { url: pageImages[sheetIdx], detail: "high" } }]
              }
            ],
            max_tokens: 1000,
          }),
        });

        const scheduleResult = await scheduleResponse.json();
        const content = scheduleResult.choices?.[0]?.message?.content || "{}";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.is_door_schedule && parsed.doors) {
            for (const door of parsed.doors) {
              doorScheduleData.push({
                door_id: door.door_id,
                sheet_id: sheet.sheet_id,
                attributes: door,
              });
            }
          }
        }
      } catch (err) {
        console.error(`[ORCHESTRATOR] P2 schedule extraction failed:`, err);
      }
    }

    // Extract door tags from plan sheets
    const doorPlanData: Array<{ door_id: string; sheet_id: string }> = [];
    
    for (const sheet of planSheets) {
      const sheetIdx = sheetIndex.findIndex(s => s.sheet_id === sheet.sheet_id);
      if (sheetIdx < 0 || sheetIdx >= pageImages.length) continue;

      try {
        const planResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Extract door tags/numbers from this floor plan.
Door tags are usually shown as numbers in circles near door openings (e.g., 101, 102, 203).

Respond ONLY with JSON array of door IDs found:
["101", "102", "103"]

Return empty array [] if no door tags visible.`
              },
              {
                role: "user",
                content: [{ type: "image_url", image_url: { url: pageImages[sheetIdx], detail: "high" } }]
              }
            ],
            max_tokens: 500,
          }),
        });

        const planResult = await planResponse.json();
        const content = planResult.choices?.[0]?.message?.content || "[]";
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
          const doorIds = JSON.parse(jsonMatch[0]);
          for (const doorId of doorIds) {
            doorPlanData.push({ door_id: String(doorId), sheet_id: sheet.sheet_id });
          }
        }
      } catch (err) {
        console.error(`[ORCHESTRATOR] P2 plan extraction failed:`, err);
      }
    }

    // Compare schedule vs plan
    const scheduleDoorsSet = new Set(doorScheduleData.map(d => d.door_id));
    const planDoorsSet = new Set(doorPlanData.map(d => d.door_id));

    // Doors in plan but not in schedule
    for (const planDoor of doorPlanData) {
      if (!scheduleDoorsSet.has(planDoor.door_id)) {
        const issue: IssueObjectV1 = {
          issue_id: generateUUID(),
          pattern_id: "P2",
          pattern_version: "1.0.0",
          phase_context: declaredPhase,
          finding: {
            title: `Door ${planDoor.door_id} Missing from Schedule`,
            summary: `Door ${planDoor.door_id} appears on plan sheet ${planDoor.sheet_id} but is not listed in the door schedule.`,
            description: `A door tag "${planDoor.door_id}" was found on the floor plan but has no corresponding entry in the door schedule. This may cause issues during construction as hardware, dimensions, and specifications may be undefined.`,
          },
          location_context: {
            primary_sheet: planDoor.sheet_id,
            entity_refs: [{ type: "door", id: planDoor.door_id }],
          },
          evidence: [{
            sheet_id: planDoor.sheet_id,
            snippet_text: `Door tag ${planDoor.door_id}`,
            extraction_method: "vision",
            confidence: 0.85,
          }],
          risk: {
            severity: "MEDIUM",
            impact_type: "Documentation",
            rationale: "Missing schedule entries can lead to undefined hardware, incorrect ordering, or field conflicts.",
          },
          recommendation: {
            action: `Add door ${planDoor.door_id} to the door schedule with appropriate specifications.`,
            responsible_party: "Architect",
          },
          quality: {
            confidence_overall: 0.85,
          },
          trace: {
            model: "gpt-4o-mini",
            run_id: runId,
          },
          created_at: new Date().toISOString(),
        };

        const validation = validateIssue(issue);
        if (validation.valid) {
          issues.push(issue);
        }
      }
    }

    // Doors in schedule but not in plan
    for (const scheduleDoor of doorScheduleData) {
      if (!planDoorsSet.has(scheduleDoor.door_id)) {
        const issue: IssueObjectV1 = {
          issue_id: generateUUID(),
          pattern_id: "P2",
          pattern_version: "1.0.0",
          phase_context: declaredPhase,
          finding: {
            title: `Scheduled Door ${scheduleDoor.door_id} Not Found on Plans`,
            summary: `Door ${scheduleDoor.door_id} is listed in the schedule on ${scheduleDoor.sheet_id} but no corresponding tag was found on floor plans.`,
            description: `The door schedule lists door "${scheduleDoor.door_id}" but this door number was not found tagged on any of the floor plan sheets. This may indicate an orphaned schedule entry or missing door tag on plans.`,
          },
          location_context: {
            primary_sheet: scheduleDoor.sheet_id,
            entity_refs: [{ type: "door", id: scheduleDoor.door_id }],
          },
          evidence: [{
            sheet_id: scheduleDoor.sheet_id,
            snippet_text: `Schedule row for door ${scheduleDoor.door_id}`,
            extraction_method: "vision",
            confidence: 0.85,
            table_row: {
              sheet_id: scheduleDoor.sheet_id,
              row_index: 0,
              column_values: scheduleDoor.attributes,
            },
          }],
          risk: {
            severity: "LOW",
            impact_type: "Documentation",
            rationale: "Orphaned schedule entries may cause confusion but are less critical than missing specifications.",
          },
          recommendation: {
            action: `Verify if door ${scheduleDoor.door_id} exists on plans or remove from schedule if obsolete.`,
            responsible_party: "Architect",
          },
          quality: {
            confidence_overall: 0.80,
          },
          trace: {
            model: "gpt-4o-mini",
            run_id: runId,
          },
          created_at: new Date().toISOString(),
        };

        const validation = validateIssue(issue);
        if (validation.valid) {
          issues.push(issue);
        }
      }
    }

    console.log(`[ORCHESTRATOR] P2 found ${issues.length - issues.filter(i => i.pattern_id === "P1").length} additional issues`);

    // ============================================================
    // STEP 5: Persist Results
    // ============================================================
    const analysisResult = {
      preflight,
      sheet_index: sheetIndex,
      issues,
      meta: {
        run_id: runId,
        declared_phase: declaredPhase,
        patterns_run: ["P1", "P2"],
        total_pages: totalPages,
        duration_ms: Date.now() - startTime,
      },
    };

    // Upsert to analysis_results
    const { error: insertError } = await supabase
      .from("analysis_results")
      .upsert({
        id: runId,
        file_id: fileId,
        project_id: projectId,
        status: "complete",
        analysis_data: analysisResult,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`[ORCHESTRATOR] Failed to persist results:`, insertError);
    }

    const duration = Date.now() - startTime;
    console.log(`[ORCHESTRATOR] Complete in ${duration}ms with ${issues.length} issues`);

    return json({
      run_id: runId,
      status: "COMPLETE",
      preflight,
      issues_count: issues.length,
      issues,
    });

  } catch (err) {
    console.error(`[ORCHESTRATOR] Unhandled error:`, err);
    return json({ 
      error: "Analysis failed", 
      details: err instanceof Error ? err.message : String(err),
      run_id: runId,
    }, 500);
  }
});
