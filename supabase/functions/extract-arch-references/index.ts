// ============================================================
// EXTRACT ARCH REFERENCES - Vision-based extraction
// Extracts callout references from architectural plan sheets
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
  renderAssetPath: string;
}

interface ExtractedReference {
  ref_type: "detail" | "section" | "elevation";
  ref_id: string;
  target_sheet_number: string;
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
    const { jobId, projectId, sourceIndex, sheetNumber, renderAssetPath } = 
      (await req.json()) as ExtractRequest;

    if (!jobId || !projectId || sourceIndex === undefined || !sheetNumber || !renderAssetPath) {
      return json({ error: "Missing required fields" }, 400);
    }

    console.log(`[extract-arch-references] Processing sheet ${sheetNumber} (source_index=${sourceIndex})`);

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
      console.error("[extract-arch-references] Failed to get signed URL:", signedUrlError);
      return json({ error: "Failed to access render asset" }, 500);
    }

    // Fetch the image and convert to base64
    const imageResponse = await fetch(signedUrlData.signedUrl);
    if (!imageResponse.ok) {
      return json({ error: "Failed to fetch render image" }, 500);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Call Lovable AI Gateway for reference extraction
    const systemPrompt = `You are an expert at reading architectural construction drawings.
Extract ALL reference callouts that point to other sheets from this architectural plan.

Look for these patterns:
- Detail bubbles: "3/A501", "1/A502" (detail number / sheet number)
- Section markers: "A-A/A301", "1/A301" (section ID / sheet number)
- Elevation references: "NORTH/A401", "1/A201" (elevation name or number / sheet number)
- Text callouts: "SEE SHEET A102", "REFER TO A501", "SEE DETAIL 3/A501"

Return ONLY valid JSON array:
[
  {
    "ref_type": "detail" | "section" | "elevation",
    "ref_id": "3" or "A-A" or "NORTH",
    "target_sheet_number": "A501",
    "bbox": {"x": 0.45, "y": 0.32, "w": 0.05, "h": 0.03},
    "snippet_text": "3/A501",
    "confidence": 0.95
  }
]

Rules:
- bbox values are normalized 0-1 relative to image dimensions
- Only include references with confidence >= 0.70
- ref_id is the detail/section/elevation identifier (e.g., "3", "A-A", "NORTH")
- target_sheet_number is the destination sheet (e.g., "A501", "A301")
- snippet_text is the exact text as shown on the drawing
- Return empty array [] if no valid references found
- Do NOT include interior door/window schedules or specifications
- Only include cross-sheet references (callouts pointing to OTHER sheets)`;

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
                text: `Extract all cross-sheet reference callouts from this architectural plan sheet (${sheetNumber}).`,
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
      console.error("[extract-arch-references] AI gateway error:", visionResponse.status, errorText);
      return json({ status: "error", extracted_count: 0, error: "AI extraction failed" });
    }

    const visionData = await visionResponse.json();
    const content = visionData.choices?.[0]?.message?.content || "[]";

    // Parse JSON response
    let references: ExtractedReference[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        references = parsed.filter((ref: ExtractedReference) => 
          ref.confidence >= 0.70 &&
          ref.ref_type &&
          ref.ref_id &&
          ref.target_sheet_number &&
          ref.bbox
        );
      }
    } catch (parseError) {
      console.warn("[extract-arch-references] Failed to parse AI response:", content);
    }

    // High-precision filter: suppress ambiguous extractions
    references = references.filter(ref => {
      // Must have valid sheet number pattern
      const sheetPattern = /^[A-Z]{1,2}[-]?\d{1,4}$/i;
      if (!sheetPattern.test(ref.target_sheet_number)) {
        console.log(`[extract-arch-references] Suppressing invalid sheet: ${ref.target_sheet_number}`);
        return false;
      }
      // Suppress low confidence
      if (ref.confidence < 0.80) {
        console.log(`[extract-arch-references] Suppressing low confidence: ${ref.snippet_text} (${ref.confidence})`);
        return false;
      }
      return true;
    });

    console.log(`[extract-arch-references] Found ${references.length} valid references`);

    // Insert extracted references into database
    const basePath = `projects/${projectId}/jobs/${jobId}/sheets/${sourceIndex}/p1_refs`;
    
    for (let i = 0; i < references.length; i++) {
      const ref = references[i];
      const evidencePath = `${basePath}/ref_${i}.png`;

      // TODO: In production, crop and store evidence image based on bbox
      // For now, store the full render path as evidence
      const { error: insertError } = await supabase
        .from("analysis_references_v1")
        .insert({
          project_id: projectId,
          job_id: jobId,
          source_index: sourceIndex,
          calling_sheet_number: sheetNumber,
          ref_type: ref.ref_type,
          ref_id: ref.ref_id,
          target_sheet_number: ref.target_sheet_number,
          bbox: ref.bbox,
          snippet_text: ref.snippet_text,
          extraction_source: "vision",
          confidence: ref.confidence,
          evidence_asset_path: renderAssetPath, // Use full render until cropping implemented
        });

      if (insertError) {
        console.error(`[extract-arch-references] Failed to insert reference:`, insertError);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[extract-arch-references] Complete in ${duration}ms`);

    return json({
      status: "success",
      extracted_count: references.length,
      duration_ms: duration,
    });

  } catch (error) {
    console.error("[extract-arch-references] Error:", error);
    return json({ 
      status: "error", 
      extracted_count: 0, 
      error: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});
