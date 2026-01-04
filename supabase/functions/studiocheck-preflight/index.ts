import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// STUDIOCHECK PREFLIGHT QUALITY GATE v1.0
// Computability checks ONLY - no analysis
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PreflightInput {
  fileId: string;
  projectId: string;
}

interface PreflightWarning {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

interface PreflightResult {
  result: "PASS" | "PASS_WITH_LIMITATIONS" | "FAIL";
  warnings: PreflightWarning[];
  blocked_patterns: string[];
  indexing_summary: {
    total_pages: number;
    pages_tested: number;
    success_rate: number;
    avg_confidence: number;
  };
  remediation_guidance?: string;
}

interface SheetIdCandidate {
  sheet_id: string;
  confidence: number;
  region: string;
  raw_text: string;
}

// Sheet ID regex patterns
const SHEET_ID_PATTERNS = [
  /^([A-Z]{1,2})[-.]?(\d{3,4})$/i,
  /^([A-Z]{1,2})[-.](\d{2,4})$/i,
  /^([A-Z]{1,2})(\d)[-.](\d{2,3})$/i,
  /^(G)[-.]?(\d{3})$/i,
  /^(C)[-.]?(\d{1,2})\.?(\d)?$/i,
];

function extractSheetIdFromText(text: string): { sheetId: string; confidence: number } | null {
  const cleaned = text.trim().toUpperCase();
  
  for (const pattern of SHEET_ID_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      const prefix = match[1];
      const number = match.slice(2).filter(Boolean).join("");
      const sheetId = `${prefix}${number}`;
      const confidence = sheetId.length >= 4 ? 0.95 : 0.85;
      return { sheetId, confidence };
    }
  }
  
  const looseMatch = cleaned.match(/^([A-Z]{1,2})\s*[-.]?\s*(\d{2,4})$/i);
  if (looseMatch) {
    const sheetId = `${looseMatch[1]}${looseMatch[2]}`;
    return { sheetId, confidence: 0.75 };
  }
  
  return null;
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
    const { fileId, projectId } = (await req.json()) as PreflightInput;

    if (!fileId || !projectId) {
      return json({ error: "fileId and projectId are required" }, 400);
    }

    console.log(`[PREFLIGHT] Starting for file=${fileId}, project=${projectId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch file metadata
    const { data: fileData, error: fileError } = await supabase
      .from("uploaded_files")
      .select("file_path, file_name, file_size")
      .eq("id", fileId)
      .single();

    if (fileError || !fileData) {
      console.error(`[PREFLIGHT] File not found: ${fileId}`, fileError);
      return json({ error: "File not found", details: fileError?.message }, 404);
    }

    // Create signed URL for PDF
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from("project-files")
      .createSignedUrl(fileData.file_path, 3600); // 1 hour

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error(`[PREFLIGHT] Failed to create signed URL`, signedUrlError);
      return json({ error: "Failed to access file" }, 500);
    }

    const pdfUrl = signedUrlData.signedUrl;
    const pdfcoApiKey = Deno.env.get("PDFCO_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!pdfcoApiKey) {
      return json({ error: "PDFCO_API_KEY not configured" }, 500);
    }

    const warnings: PreflightWarning[] = [];
    const blockedPatterns: string[] = [];
    let totalPages = 0;
    let textExtractionSuccess = false;
    let rasterizationSuccess = false;

    // ============================================================
    // CHECK 1: PDF STRUCTURE - Extract text from first 3 pages
    // ============================================================
    console.log(`[PREFLIGHT] Check 1: PDF structure`);
    
    try {
      const textExtractResponse = await fetch("https://api.pdf.co/v1/pdf/convert/to/text", {
        method: "POST",
        headers: {
          "x-api-key": pdfcoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: pdfUrl,
          pages: "0-2", // First 3 pages (0-indexed)
          inline: true,
        }),
      });

      const textResult = await textExtractResponse.json();
      
      if (textResult.error === false && textResult.body) {
        const extractedText = textResult.body;
        textExtractionSuccess = extractedText.length >= 50;
        console.log(`[PREFLIGHT] Text extraction: ${extractedText.length} chars`);
        
        if (!textExtractionSuccess) {
          warnings.push({
            code: "LOW_TEXT_CONTENT",
            severity: "warning",
            message: `Only ${extractedText.length} characters extracted from first 3 pages. Document may be image-based.`,
          });
        }
      }

      // Get total page count
      const pageCountResponse = await fetch("https://api.pdf.co/v1/pdf/info", {
        method: "POST",
        headers: {
          "x-api-key": pdfcoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: pdfUrl }),
      });
      
      const pageInfo = await pageCountResponse.json();
      totalPages = pageInfo.pageCount || 0;
      console.log(`[PREFLIGHT] Total pages: ${totalPages}`);
      
    } catch (err) {
      console.error(`[PREFLIGHT] Text extraction failed:`, err);
      warnings.push({
        code: "TEXT_EXTRACTION_FAILED",
        severity: "error",
        message: "Failed to extract text from PDF",
      });
    }

    // ============================================================
    // CHECK 2: RASTERIZATION VIABILITY
    // ============================================================
    console.log(`[PREFLIGHT] Check 2: Rasterization viability`);
    
    let firstPageImageUrl: string | null = null;
    
    try {
      const rasterResponse = await fetch("https://api.pdf.co/v1/pdf/convert/to/png", {
        method: "POST",
        headers: {
          "x-api-key": pdfcoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: pdfUrl,
          pages: "0",
          async: false,
        }),
      });

      const rasterResult = await rasterResponse.json();
      
      if (rasterResult.error === false && rasterResult.urls && rasterResult.urls.length > 0) {
        rasterizationSuccess = true;
        firstPageImageUrl = rasterResult.urls[0];
        console.log(`[PREFLIGHT] Rasterization success`);
      }
    } catch (err) {
      console.error(`[PREFLIGHT] Rasterization failed:`, err);
      warnings.push({
        code: "RASTERIZATION_FAILED",
        severity: "error",
        message: "Failed to rasterize PDF pages",
      });
    }

    // If both text extraction AND rasterization fail, FAIL preflight
    if (!textExtractionSuccess && !rasterizationSuccess) {
      console.log(`[PREFLIGHT] FAIL - No viable extraction method`);
      return json({
        result: "FAIL",
        warnings,
        blocked_patterns: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
        indexing_summary: {
          total_pages: totalPages,
          pages_tested: 0,
          success_rate: 0,
          avg_confidence: 0,
        },
        remediation_guidance: "The PDF cannot be processed. Text extraction failed and rasterization is not viable. Please ensure the PDF is not corrupted and contains readable content.",
      } as PreflightResult);
    }

    // ============================================================
    // CHECK 3: SHEET ID INDEXABILITY (CRITICAL)
    // ============================================================
    console.log(`[PREFLIGHT] Check 3: Sheet ID indexability`);
    
    const pagesToTest = Math.min(5, totalPages);
    const sheetIdCandidates: SheetIdCandidate[] = [];
    let pagesWithValidSheetId = 0;
    let totalConfidence = 0;

    if (openaiApiKey && rasterizationSuccess) {
      // Rasterize first 5 pages for title block OCR
      try {
        const rasterPagesResponse = await fetch("https://api.pdf.co/v1/pdf/convert/to/png", {
          method: "POST",
          headers: {
            "x-api-key": pdfcoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: pdfUrl,
            pages: `0-${pagesToTest - 1}`,
            async: false,
          }),
        });

        const rasterPages = await rasterPagesResponse.json();
        
        if (rasterPages.error === false && rasterPages.urls) {
          for (let i = 0; i < rasterPages.urls.length; i++) {
            const pageImageUrl = rasterPages.urls[i];
            
            // Use OpenAI Vision to extract title block info
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
                      content: `You are a construction document analyzer. Extract the sheet ID (drawing number) from the title block of this architectural/engineering drawing.
                      
The sheet ID is typically in the format: A101, M-201, S1.02, E001, etc.
- First 1-2 letters indicate discipline (A=Architectural, S=Structural, M=Mechanical, E=Electrical, P=Plumbing, C=Civil, etc.)
- Followed by numbers

Look in the title block area (usually bottom-right corner) for the sheet number.

Respond ONLY with a JSON object:
{
  "sheet_id": "A101" or null if not found,
  "sheet_title": "FIRST FLOOR PLAN" or null,
  "confidence": 0.0-1.0,
  "location": "bottom-right" | "bottom-center" | "right-edge" | "not_found"
}`
                    },
                    {
                      role: "user",
                      content: [
                        {
                          type: "image_url",
                          image_url: { url: pageImageUrl, detail: "high" }
                        }
                      ]
                    }
                  ],
                  max_tokens: 200,
                }),
              });

              const visionResult = await visionResponse.json();
              const content = visionResult.choices?.[0]?.message?.content || "";
              
              // Parse JSON from response
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.sheet_id && parsed.confidence >= 0.5) {
                  sheetIdCandidates.push({
                    sheet_id: parsed.sheet_id,
                    confidence: parsed.confidence,
                    region: parsed.location || "unknown",
                    raw_text: parsed.sheet_title || "",
                  });
                  
                  if (parsed.confidence >= 0.85) {
                    pagesWithValidSheetId++;
                  }
                  totalConfidence += parsed.confidence;
                }
              }
            } catch (visionErr) {
              console.error(`[PREFLIGHT] Vision extraction failed for sheet ${i}:`, visionErr);
            }
          }
        }
      } catch (err) {
        console.error(`[PREFLIGHT] Sheet ID indexing failed:`, err);
        warnings.push({
          code: "SHEET_INDEXING_ERROR",
          severity: "error",
          message: "Failed to extract sheet IDs from title blocks",
        });
      }
    } else if (!openaiApiKey) {
      warnings.push({
        code: "OPENAI_NOT_CONFIGURED",
        severity: "error",
        message: "OpenAI API key not configured. Vision-based sheet ID extraction unavailable.",
      });
    }

    const successRate = pagesToTest > 0 ? pagesWithValidSheetId / pagesToTest : 0;
    const avgConfidence = sheetIdCandidates.length > 0 
      ? totalConfidence / sheetIdCandidates.length 
      : 0;

    console.log(`[PREFLIGHT] Sheet ID indexing: ${pagesWithValidSheetId}/${pagesToTest} pages, success_rate=${successRate.toFixed(2)}`);

    // If success rate < 90%, FAIL
    if (successRate < 0.90) {
      console.log(`[PREFLIGHT] FAIL - Sheet ID indexing below threshold`);
      return json({
        result: "FAIL",
        warnings: [
          ...warnings,
          {
            code: "SHEET_INDEXING_FAILED",
            severity: "error",
            message: `Only ${(successRate * 100).toFixed(0)}% of tested pages have valid sheet IDs. Minimum required: 90%.`,
          },
        ],
        blocked_patterns: ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
        indexing_summary: {
          total_pages: totalPages,
          pages_tested: pagesToTest,
          success_rate: successRate,
          avg_confidence: avgConfidence,
        },
        remediation_guidance: "Sheet ID extraction failed. Ensure the PDF has clearly visible title blocks with standard sheet numbering (e.g., A101, M201). The title block should be in the bottom-right corner of each sheet.",
      } as PreflightResult);
    }

    // ============================================================
    // CHECK 4: SCALE METADATA
    // ============================================================
    console.log(`[PREFLIGHT] Check 4: Scale metadata detection`);
    
    let scaleDetected = false;
    
    // For now, we'll check if scale text is present in extracted text or use vision
    // This is a simplified check - full implementation would parse scale annotations
    if (openaiApiKey && firstPageImageUrl) {
      try {
        const scaleResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
                content: `Look for drawing scale notation in this construction drawing. Common formats:
- "SCALE: 1/4" = 1'-0""
- "1:100"
- "NTS" (Not To Scale)

Respond ONLY with JSON:
{
  "scale_found": true/false,
  "scale_value": "1/4\" = 1'-0\"" or null,
  "is_nts": true/false
}`
              },
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: { url: firstPageImageUrl, detail: "low" }
                  }
                ]
              }
            ],
            max_tokens: 100,
          }),
        });

        const scaleResult = await scaleResponse.json();
        const content = scaleResult.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          scaleDetected = parsed.scale_found === true && !parsed.is_nts;
        }
      } catch (err) {
        console.error(`[PREFLIGHT] Scale detection failed:`, err);
      }
    }

    if (!scaleDetected) {
      warnings.push({
        code: "SCALE_NOT_DETECTED",
        severity: "warning",
        message: "Drawing scale not detected. ADA clearance checks (P5) will be blocked.",
      });
      blockedPatterns.push("P5");
    }

    // ============================================================
    // DETERMINE FINAL RESULT
    // ============================================================
    const duration = Date.now() - startTime;
    console.log(`[PREFLIGHT] Complete in ${duration}ms`);

    const result: PreflightResult = {
      result: blockedPatterns.length > 0 ? "PASS_WITH_LIMITATIONS" : "PASS",
      warnings,
      blocked_patterns: blockedPatterns,
      indexing_summary: {
        total_pages: totalPages,
        pages_tested: pagesToTest,
        success_rate: successRate,
        avg_confidence: avgConfidence,
      },
    };

    return json(result);

  } catch (err) {
    console.error(`[PREFLIGHT] Unhandled error:`, err);
    return json({ 
      error: "Preflight check failed", 
      details: err instanceof Error ? err.message : String(err) 
    }, 500);
  }
});
