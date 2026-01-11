// ============================================================
// EXTRACT TARGET LABELS - Vision-based extraction
// Extracts detail/section/elevation identifiers from target sheets
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractRequest {
  jobId: string;
  projectId: string;
  sourceIndex: number;
  sheetNumber: string;
  sheetKind: "detail" | "section" | "elevation";
  renderAssetPath: string;
}

interface ExtractedLabel {
  label_type: "detail" | "section" | "elevation";
  label_id: string;
  bbox: { x: number; y: number; w: number; h: number };
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
    const { jobId, projectId, sourceIndex, sheetNumber, sheetKind, renderAssetPath } = 
      (await req.json()) as ExtractRequest;

    if (!jobId || !projectId || sourceIndex === undefined || !sheetNumber || !sheetKind || !renderAssetPath) {
      return json({ error: "Missing required fields" }, 400);
    }

    console.log(`[extract-target-labels] Processing ${sheetKind} sheet ${sheetNumber} (source_index=${sourceIndex})`);

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
      console.error("[extract-target-labels] Failed to get signed URL:", signedUrlError);
      return json({ error: "Failed to access render asset" }, 500);
    }

    // Fetch the image and convert to base64
    const imageResponse = await fetch(signedUrlData.signedUrl);
    if (!imageResponse.ok) {
      return json({ error: "Failed to fetch render image" }, 500);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Build prompt based on sheet kind
    const labelTypeInstructions = {
      detail: `Look for detail identifiers/numbers shown in title bubbles or labels.
Common patterns: circled numbers like "1", "2", "3" or alphanumeric like "A", "B", "D1"
These appear as titles above or below detail drawings.`,
      section: `Look for section identifiers shown in section markers or titles.
Common patterns: "A-A", "B-B", "1-1", "SECTION A" or single letters/numbers in triangular markers.
These appear at section cut lines or as section drawing titles.`,
      elevation: `Look for elevation identifiers/names in titles.
Common patterns: "NORTH", "SOUTH", "EAST", "WEST", "ELEVATION A", "1", "2"
These appear as titles above elevation drawings.`,
    };

    const systemPrompt = `You are an expert at reading architectural construction drawings.
Extract ALL ${sheetKind} identifiers/labels present on this ${sheetKind} sheet.

${labelTypeInstructions[sheetKind]}

Return ONLY valid JSON array:
[
  {
    "label_type": "${sheetKind}",
    "label_id": "3" or "A-A" or "NORTH",
    "bbox": {"x": 0.45, "y": 0.32, "w": 0.15, "h": 0.04},
    "snippet_text": "DETAIL 3",
    "confidence": 0.95
  }
]

Rules:
- bbox values are normalized 0-1 relative to image dimensions
- Only include identifiers with confidence >= 0.70
- label_id is the identifier only (e.g., "3", "A-A", "NORTH"), not full title
- snippet_text is the full text including any prefix like "DETAIL 3" or "SECTION A-A"
- Return empty array [] if no valid identifiers found
- EXCLUDE labels marked as "TYP", "TYPICAL", or "NOT USED"
- EXCLUDE general notes or specifications`;

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
                text: `Extract all ${sheetKind} identifiers from this sheet (${sheetNumber}).`,
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64Image}` },
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error("[extract-target-labels] AI gateway error:", visionResponse.status, errorText);
      return json({ status: "error", extracted_count: 0, error: "AI extraction failed" });
    }

    const visionData = await visionResponse.json();
    const content = visionData.choices?.[0]?.message?.content || "[]";

    // Parse JSON response
    let labels: ExtractedLabel[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        labels = parsed.filter((label: ExtractedLabel) => 
          label.confidence >= 0.70 &&
          label.label_type &&
          label.label_id &&
          label.bbox
        );
      }
    } catch (parseError) {
      console.warn("[extract-target-labels] Failed to parse AI response:", content);
    }

    // High-precision filter
    labels = labels.filter(label => {
      // Exclude TYP/TYPICAL markers
      const typPattern = /^(TYP|TYPICAL|NOT\s*USED)$/i;
      if (typPattern.test(label.label_id)) {
        console.log(`[extract-target-labels] Excluding TYP/NOT USED: ${label.label_id}`);
        return false;
      }
      // Suppress low confidence
      if (label.confidence < 0.80) {
        console.log(`[extract-target-labels] Suppressing low confidence: ${label.label_id} (${label.confidence})`);
        return false;
      }
      return true;
    });

    console.log(`[extract-target-labels] Found ${labels.length} valid labels`);

    // Insert extracted labels into database
    const basePath = `projects/${projectId}/jobs/${jobId}/sheets/${sourceIndex}/p1_targets`;
    
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const evidencePath = `${basePath}/label_${i}.png`;

      const { error: insertError } = await supabase
        .from("analysis_target_labels_v1")
        .insert({
          project_id: projectId,
          job_id: jobId,
          source_index: sourceIndex,
          target_sheet_number: sheetNumber,
          label_type: label.label_type,
          label_id: label.label_id,
          bbox: label.bbox,
          snippet_text: label.snippet_text,
          extraction_source: "vision",
          confidence: label.confidence,
          evidence_asset_path: renderAssetPath,
        });

      if (insertError) {
        console.error(`[extract-target-labels] Failed to insert label:`, insertError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[extract-target-labels] Complete in ${duration}ms`);

    return json({
      status: "success",
      extracted_count: labels.length,
      duration_ms: duration,
    });

  } catch (error) {
    console.error("[extract-target-labels] Error:", error);
    return json({ 
      status: "error", 
      extracted_count: 0, 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});
