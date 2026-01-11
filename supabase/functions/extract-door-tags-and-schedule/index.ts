// ============================================================
// EXTRACT DOOR TAGS AND SCHEDULE - Vision-based extraction
// Extracts door IDs from plans/elevations OR door schedule
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractRequest {
  jobId: string;
  projectId: string;
  mode: "tags" | "schedule";
  sourceIndex: number;
  sheetNumber: string;
  renderAssetPath: string;
}

interface ExtractedDoorTag {
  door_id: string;
  bbox: { x: number; y: number; w: number; h: number };
  snippet_text: string;
  confidence: number;
}

interface ExtractedScheduleItem {
  door_id: string;
  row_bbox: { x: number; y: number; w: number; h: number };
  snippet_text: string;
  confidence: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { jobId, projectId, mode, sourceIndex, sheetNumber, renderAssetPath } = 
      (await req.json()) as ExtractRequest;

    if (!jobId || !projectId || !mode || sourceIndex === undefined || !sheetNumber || !renderAssetPath) {
      return json({ error: "Missing required fields" }, 400);
    }

    console.log(`[extract-doors] Processing ${mode} from sheet ${sheetNumber} (source_index=${sourceIndex})`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!lovableApiKey) {
      return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    // Get signed URL for render asset
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("project-files")
      .createSignedUrl(renderAssetPath, 600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("[extract-doors] Failed to get signed URL:", signedUrlError);
      return json({ error: "Failed to access render asset" }, 500);
    }

    // Fetch the image and convert to base64
    const imageResponse = await fetch(signedUrlData.signedUrl);
    if (!imageResponse.ok) {
      return json({ error: "Failed to fetch render image" }, 500);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Build prompt based on mode
    let systemPrompt: string;
    
    if (mode === "tags") {
      systemPrompt = `You are an expert at reading architectural floor plans.
Extract ALL door tags/numbers visible on this floor plan or elevation.

Door tags are typically shown as:
- Numbers in circles or hexagons near door openings (e.g., "101", "102A", "D-1")
- Numbers adjacent to door swings
- Door marks in bubbles pointing to doors

Return ONLY valid JSON array:
[
  {
    "door_id": "101",
    "bbox": {"x": 0.45, "y": 0.32, "w": 0.03, "h": 0.03},
    "snippet_text": "101",
    "confidence": 0.95
  }
]

Rules:
- door_id should be the exact tag shown (preserve format like "101", "102A", "D-1")
- Trim whitespace but do NOT modify the ID
- bbox values are normalized 0-1 relative to image dimensions
- Only include tags with confidence >= 0.75
- Return empty array [] if no door tags found
- Exclude window tags, room numbers, or general annotation numbers`;
    } else {
      systemPrompt = `You are an expert at reading architectural door schedules.
Extract ALL door entries from this door schedule sheet.

Door schedules typically have columns like:
- DOOR NO. / DOOR MARK / DOOR ID
- WIDTH / HEIGHT
- TYPE / MATERIAL / FINISH
- HARDWARE SET
- REMARKS

Return ONLY valid JSON array:
[
  {
    "door_id": "101",
    "row_bbox": {"x": 0.1, "y": 0.25, "w": 0.8, "h": 0.03},
    "snippet_text": "101 - 3'-0\" x 7'-0\" - TYPE A",
    "confidence": 0.95
  }
]

Rules:
- door_id is the door number/mark from the first column
- row_bbox covers the entire schedule row for that door
- snippet_text summarizes the key info from that row
- Only include entries with confidence >= 0.75
- Return empty array [] if not a door schedule or no entries found
- Exclude header rows, notes, or legends`;
    }

    const visionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: mode === "tags" 
                  ? `Extract all door tags from this floor plan (${sheetNumber}).`
                  : `Extract all door entries from this door schedule (${sheetNumber}).`,
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64Image}` },
              },
            ],
          },
        ],
        max_tokens: 3000,
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error("[extract-doors] AI gateway error:", visionResponse.status, errorText);
      return json({ status: "error", extracted_count: 0, error: "AI extraction failed" });
    }

    const visionData = await visionResponse.json();
    const content = visionData.choices?.[0]?.message?.content || "[]";

    // Parse JSON response
    let items: (ExtractedDoorTag | ExtractedScheduleItem)[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        items = parsed.filter((item: ExtractedDoorTag | ExtractedScheduleItem) => 
          item.confidence >= 0.75 &&
          item.door_id &&
          (item as ExtractedDoorTag).bbox || (item as ExtractedScheduleItem).row_bbox
        );
      }
    } catch (parseError) {
      console.warn("[extract-doors] Failed to parse AI response:", content);
    }

    // Normalize door IDs (trim whitespace only)
    items = items.map(item => ({
      ...item,
      door_id: item.door_id.trim(),
    }));

    // High-precision filter: suppress ambiguous extractions
    items = items.filter(item => {
      // Door ID should be alphanumeric with possible dashes/letters
      const doorPattern = /^[A-Z0-9][-A-Z0-9]{0,10}$/i;
      if (!doorPattern.test(item.door_id)) {
        console.log(`[extract-doors] Suppressing invalid door ID: ${item.door_id}`);
        return false;
      }
      if (item.confidence < 0.80) {
        console.log(`[extract-doors] Suppressing low confidence: ${item.door_id} (${item.confidence})`);
        return false;
      }
      return true;
    });

    console.log(`[extract-doors] Found ${items.length} valid ${mode}`);

    // Insert into appropriate table
    const basePath = `projects/${projectId}/jobs/${jobId}/sheets/${sourceIndex}/p1_doors/${mode}`;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (mode === "tags") {
        const tag = item as ExtractedDoorTag;
        const { error: insertError } = await supabase
          .from("analysis_door_tags_v1")
          .insert({
            project_id: projectId,
            job_id: jobId,
            source_index: sourceIndex,
            sheet_number: sheetNumber,
            door_id: tag.door_id,
            bbox: tag.bbox,
            snippet_text: tag.snippet_text,
            extraction_source: "vision",
            confidence: tag.confidence,
            evidence_asset_path: renderAssetPath,
          });

        if (insertError) {
          console.error(`[extract-doors] Failed to insert tag:`, insertError);
        }
      } else {
        const scheduleItem = item as ExtractedScheduleItem;
        const { error: insertError } = await supabase
          .from("analysis_door_schedule_items_v1")
          .insert({
            project_id: projectId,
            job_id: jobId,
            source_index: sourceIndex,
            schedule_sheet_number: sheetNumber,
            door_id: scheduleItem.door_id,
            row_bbox: scheduleItem.row_bbox,
            snippet_text: scheduleItem.snippet_text,
            extraction_source: "vision",
            confidence: scheduleItem.confidence,
            evidence_asset_path: renderAssetPath,
          });

        if (insertError) {
          console.error(`[extract-doors] Failed to insert schedule item:`, insertError);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[extract-doors] Complete in ${duration}ms`);

    return json({
      status: "success",
      extracted_count: items.length,
      mode,
      duration_ms: duration,
    });

  } catch (error) {
    console.error("[extract-doors] Error:", error);
    return json({ 
      status: "error", 
      extracted_count: 0, 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});
