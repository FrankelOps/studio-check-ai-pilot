// ============================================================
// DETECT TITLE BLOCK TEMPLATE - Vision-based calibration
// Locates "SHEET TITLE" and "SHEET NO" label+value bounding boxes
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TemplateResult {
  bbox_sheet_title_value: BBox | null;
  bbox_sheet_number_value: BBox | null;
  confidence: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images, discipline } = await req.json();
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images provided" }),
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

    console.log(`[detect-titleblock-template] Processing ${images.length} calibration images for discipline: ${discipline || 'unknown'}`);

    const systemPrompt = `You are an expert at analyzing architectural/engineering drawing title blocks to identify labeled fields.

Your task is to locate the VALUE REGIONS (not the labels) for:
1. "SHEET TITLE" or "TITLE" - The field where the sheet name is written (e.g., "FIRST FLOOR PLAN")
2. "SHEET NO", "SHEET NUMBER", "SH NO", "SHEET #" - The field where the sheet number is written (e.g., "A101")

Return the BOUNDING BOXES as normalized coordinates (0-1 range based on image dimensions).

CRITICAL RULES:
- Return the VALUE boxes, NOT the label boxes
- The value box should be where the actual text content appears, next to or below the label
- Ignore any stamps, jurisdiction notes, or boilerplate text areas
- Focus on the dedicated title block area (usually bottom-right of the drawing)

Return ONLY valid JSON in this exact format:
{
  "bbox_sheet_title_value": {"x": 0.75, "y": 0.85, "w": 0.20, "h": 0.04},
  "bbox_sheet_number_value": {"x": 0.92, "y": 0.93, "w": 0.06, "h": 0.03},
  "confidence": 0.85
}

If you cannot locate a field, use null for that bbox.
Set confidence to 0.0-1.0 based on how clearly the fields are visible.`;

    // Use first image for template detection (most reliable)
    const primaryImage = images[0];
    
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
                text: `Analyze this ${discipline || 'architectural'} drawing and locate the SHEET TITLE and SHEET NUMBER value regions in the title block. Return normalized bounding boxes (0-1 range).`,
              },
              {
                type: "image_url",
                image_url: {
                  url: primaryImage.startsWith('http') 
                    ? primaryImage 
                    : `data:image/png;base64,${primaryImage}`,
                },
              },
            ],
          },
        ],
        max_tokens: 400,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429 || response.status === 402) {
        return new Response(
          JSON.stringify({ error: response.status === 429 ? "Rate limit exceeded" : "AI credits exhausted" }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ bbox_sheet_title_value: null, bbox_sheet_number_value: null, confidence: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    console.log(`[detect-titleblock-template] AI response: ${content.substring(0, 200)}...`);
    
    // Parse JSON from response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        const result: TemplateResult = {
          bbox_sheet_title_value: validateBBox(parsed.bbox_sheet_title_value),
          bbox_sheet_number_value: validateBBox(parsed.bbox_sheet_number_value),
          confidence: typeof parsed.confidence === 'number' 
            ? Math.min(1, Math.max(0, parsed.confidence)) 
            : 0.5,
        };
        
        console.log(`[detect-titleblock-template] Successfully extracted template with confidence ${result.confidence}`);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (parseError) {
      console.warn("Failed to parse AI response as JSON:", content);
    }

    return new Response(
      JSON.stringify({ bbox_sheet_title_value: null, bbox_sheet_number_value: null, confidence: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("detect-titleblock-template error:", error);
    return new Response(
      JSON.stringify({ error: error.message, bbox_sheet_title_value: null, bbox_sheet_number_value: null, confidence: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function validateBBox(bbox: unknown): BBox | null {
  if (!bbox || typeof bbox !== 'object') return null;
  
  const b = bbox as Record<string, unknown>;
  const x = typeof b.x === 'number' ? b.x : null;
  const y = typeof b.y === 'number' ? b.y : null;
  const w = typeof b.w === 'number' ? b.w : null;
  const h = typeof b.h === 'number' ? b.h : null;
  
  if (x === null || y === null || w === null || h === null) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1 || w <= 0 || w > 1 || h <= 0 || h > 1) return null;
  
  return { x, y, w, h };
}
