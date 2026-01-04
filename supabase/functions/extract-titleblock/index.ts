// ============================================================
// EXTRACT TITLE BLOCK - Vision-based extraction
// Uses Lovable AI Gateway for OCR/extraction from title block images
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image, meta } = await req.json();
    
    // Log metadata for debugging
    if (meta) {
      console.log("[extract-titleblock] Request meta:", JSON.stringify({
        jobId: meta.jobId || "unknown",
        projectId: meta.projectId || "unknown",
        sourceIndex: meta.sourceIndex ?? "unknown",
        expectedDiscipline: meta.expectedDiscipline || "unknown",
        phase: meta.phase || "unknown",
        imageSize: image ? `${Math.round(image.length / 1024)}KB` : "no image"
      }));
    } else {
      console.log("[extract-titleblock] Request without meta, imageSize:", image ? `${Math.round(image.length / 1024)}KB` : "no image");
    }
    
    if (!image) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert at reading architectural/engineering drawing title blocks.
Extract the sheet number and sheet title from the title block image.
Return ONLY valid JSON in this exact format: {"sheet_number": "...", "sheet_title": "..."}

Rules:
- Sheet numbers follow AEC patterns like: A101, A1.01, M-201, E001, FP101, S1-101
- Sheet titles are descriptive names like: "FIRST FLOOR PLAN", "MECHANICAL SCHEDULE", "ELECTRICAL DETAILS"
- IGNORE jurisdiction stamps like "SEATTLE DCI USE ONLY", "NOT FOR CONSTRUCTION", etc.
- IGNORE general notes like "dimensions must be checked", "verify on site", etc.
- The sheet title should describe the CONTENT of the drawing (plan, detail, schedule, etc.)
- If you cannot find a value, use null
- Do NOT include any other text or explanation, ONLY the JSON object`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
                text: "Extract the sheet number and sheet title from this title block image.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ sheet_number: null, sheet_title: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    try {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return new Response(
          JSON.stringify({
            sheet_number: parsed.sheet_number || null,
            sheet_title: parsed.sheet_title || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (parseError) {
      console.warn("Failed to parse AI response as JSON:", content);
    }

    return new Response(
      JSON.stringify({ sheet_number: null, sheet_title: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("extract-titleblock error:", error);
    return new Response(
      JSON.stringify({ error: error.message, sheet_number: null, sheet_title: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
