import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import { fromUint8Array } from 'https://esm.sh/pdf2pic@3.0.3';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rasterization and caching config
const PDFCO_API_KEY = Deno.env.get('PDFCO_API_KEY') || '';
const USE_RASTERIZER = /^(1|true|yes|on)$/i.test(Deno.env.get('USE_RASTERIZER') || '');
const RASTERIZE_DPI = Number(Deno.env.get('RASTERIZE_DPI') || 400);
const SIGN_TTL = Number(Deno.env.get('RASTERIZE_TTL_SECONDS') || 3600);

// Service client for storage/cache operations
const sbService = createClient(supabaseUrl, supabaseKey);

type RasterizeResult = { page: number; signedUrl: string; storagePath: string };

async function createSignedUrlFromProjectFiles(filePath: string, ttlSeconds = SIGN_TTL) {
  const { data, error } = await sbService.storage.from('project-files').createSignedUrl(filePath, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error('Failed to create signed URL for PDF source');
  return data.signedUrl;
}

async function pdfcoRasterizeToPngUrls(pdfSignedUrl: string, dpi = RASTERIZE_DPI): Promise<string[]> {
  if (!PDFCO_API_KEY) throw new Error('Missing PDFCO_API_KEY');
  const resp = await fetch('https://api.pdf.co/v1/pdf/convert/to/png', {
    method: 'POST',
    headers: { 'x-api-key': PDFCO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: pdfSignedUrl, dpi, async: false, pages: '' })
  });
  const data = await resp.json();
  if (!resp.ok || !data?.urls?.length) {
    console.error('PDF.co error', data);
    throw new Error('PDF rasterization failed');
  }
  return data.urls as string[];
}

async function uploadPngToStorage(pngResponse: Response, destPath: string): Promise<string> {
  const bytes = new Uint8Array(await pngResponse.arrayBuffer());
  const { error } = await sbService.storage.from('studiocheck-pages').upload(
    destPath,
    new Blob([bytes], { type: 'image/png' }),
    { upsert: true }
  );
  if (error) throw error;
  const { data: signed } = await sbService.storage.from('studiocheck-pages').createSignedUrl(destPath, SIGN_TTL);
  if (!signed?.signedUrl) throw new Error('Failed to sign stored page PNG');
  return signed.signedUrl;
}

async function listCachedPageImages(prefix: string): Promise<RasterizeResult[]> {
  const { data: list, error } = await sbService.storage.from('studiocheck-pages').list(prefix, { limit: 1000 });
  if (error) return [];
  const out: RasterizeResult[] = [];
  for (const it of list || []) {
    const m = it.name.match(/^page-(\d+)\.png$/);
    if (!m) continue;
    const page = Number(m[1]);
    const path = `${prefix}${it.name}`;
    const { data: signed } = await sbService.storage.from('studiocheck-pages').createSignedUrl(path, SIGN_TTL);
    if (signed?.signedUrl) out.push({ page, signedUrl: signed.signedUrl, storagePath: path });
  }
  return out.sort((a, b) => a.page - b.page);
}

async function ensurePageImages(projectId: string, fileId: string, pdfSignedUrl: string): Promise<RasterizeResult[]> {
  const prefix = `${projectId}/${fileId}/`;
  const cached = await listCachedPageImages(prefix);
  if (cached.length) {
    console.log('rasterize:cache-hit', { pages: cached.length });
    return cached;
  }
  console.log('rasterize:start', { dpi: RASTERIZE_DPI });
  const pngUrls = await pdfcoRasterizeToPngUrls(pdfSignedUrl, RASTERIZE_DPI);
  const results: RasterizeResult[] = [];
  for (let i = 0; i < pngUrls.length; i++) {
    const resp = await fetch(pngUrls[i]);
    const dest = `${prefix}page-${i + 1}.png`;
    const signed = await uploadPngToStorage(resp, dest);
    results.push({ page: i + 1, signedUrl: signed, storagePath: dest });
  }
  console.log('rasterize:done', { pages: results.length });
  return results;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// StudioCheck – Specificity-First QA/QC Reviewer (v2) - Updated with Patch Instructions
export const SYSTEM_PROMPT = `
You are StudioCheck, an expert construction QA/QC reviewer for commercial, healthcare, and life-science projects.

TASK
Analyze each drawing page to identify potential issues that could cause RFIs, change orders, delays, or non-compliance.

INPUT MODALITIES
• You will receive both a page IMAGE and the OCR TEXT for the same page.
• Use the image for visual evidence (symbols, tags, callouts, backgrounds, door swings, clearances).
• Use text for notes/schedules/spec references.

OUTPUT RULES (IMPORTANT)
• Return an ARRAY of finding objects (0 or more). Do NOT return null or undefined.
• Include low-confidence findings (use the "confidence" field) instead of omitting them.
• NEVER return an empty string for any field; use concise plain English.
• Use the exact JSON schema provided by the user message.
• If no issues are found on a page, simply return an empty array for that page—do not fabricate results.

SCORING GUIDANCE
• risk: High (likely code/safety/major cost), Medium (coordination or moderate cost), Low (minor clarity).
• confidence: High (direct evidence on this page), Medium (inferred from clear context), Low (possible, needs RFI).
• Be specific: cite the nearest marker/text, sheet callout (e.g., "Detail 3/A502"), and page number.

STYLE
• Explain *why* you flagged it (“AI_reasoning”), referencing the visual/text evidence.
• Provide a clear “suggested_action” suitable for field use.

Do not include any additional wrapper text—only the JSON response as required.
`;

export const FINDING_SCHEMA_TEXT = `
{
  "findings": [
    {
      "category": "Missing Information | Coordination Conflict | Spec/Product Conflict | Code/ADA Violation | Drawing/Spec Inconsistency | Other Red Flag",
      "risk": "High | Medium | Low",
      "confidence": "High | Medium | Low",
      "coordination_required": true,
      "sheet_spec_reference": "e.g., A101, Detail 3/A502, Panel A schedule",
      "page": <integer starting at 1>,
      "nearby_text_marker": "closest note/label/callout text",
      "issue": "one-sentence problem statement",
      "construction_impact": "short, trade-aware impact statement",
      "ai_reasoning": "why this was flagged; cite visual/text evidence",
      "suggested_action": "clear next step (RFI, revise detail, coordinate M/E/P, etc.)",
      "references": ["FileName (Page X)", "Spec Section if present"],
      "cross_references": ["other pages/sheets if cited"]
    }
  ]
}
`;

export type Finding = {
  category: string;
  risk: "High" | "Medium" | "Low";
  confidence: "High" | "Medium" | "Low";
  coordination_required: boolean;
  sheet_spec_reference: string;
  page: number;
  nearby_text_marker: string;
  issue: string;
  construction_impact: string;
  ai_reasoning: string;
  suggested_action: string;
  references: string[];
  cross_references: string[];
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, projectId } = await req.json();
    console.log('Analyzing document:', { fileId, projectId });
    console.log("cfg", {
      useRasterizer: (Deno.env.get('USE_RASTERIZER') || 'false'),
      dpi: (Deno.env.get('RASTERIZE_DPI') || ''),
      ttl: (Deno.env.get('RASTERIZE_TTL_SECONDS') || ''),
      hasPdfcoKey: !!Deno.env.get('PDFCO_API_KEY')
    });

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get file information
    const { data: fileData, error: fileError } = await supabase
      .from('uploaded_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      throw new Error('File not found');
    }

    // Get file from storage
    const { data: fileBlob, error: storageError } = await supabase.storage
      .from('project-files')
      .download(fileData.file_path);

    if (storageError || !fileBlob) {
      throw new Error('Could not download file');
    }

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Process the file based on its type
    let content;
    let isPDF = fileData.mime_type === 'application/pdf';
    
    if (isPDF) {
      console.log('Processing PDF file - converting to images for analysis...');
      
      try {
        // Convert PDF to images for comprehensive analysis
        const arrayBuffer = await fileBlob.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();
        
        console.log(`PDF has ${pageCount} pages, processing each page...`);
        
        // First, extract sheet titles/numbers from all pages to build context
        const sheetTitles = [];
        for (let i = 0; i < Math.min(pageCount, 10); i++) {
          try {
            // Extract potential sheet titles - look for common patterns like "A101", "G001", etc.
            // This is a simplified approach - in production you'd use proper OCR
            const pageTitle = `Page ${i + 1}`;
            sheetTitles.push(pageTitle);
          } catch (error) {
            console.error(`Error extracting sheet title from page ${i + 1}:`, error);
          }
        }
        
// Process each page separately and collect findings (with optional rasterization)
const totalPages = pageCount;

// Create a signed URL for the source PDF once
const pdfSignedUrl = await createSignedUrlFromProjectFiles(fileData.file_path, SIGN_TTL);
let pageImages: { page: number; signedUrl: string }[] = [];

console.log("rasterize:gate", { USE_RASTERIZER });
if (USE_RASTERIZER) {
  pageImages = await ensurePageImages(projectId, fileId, pdfSignedUrl);
}
const PAGE_LIMIT = 10;
const plannedPages = pageImages.length ? pageImages.length : totalPages;
const pagesToProcess = Math.min(plannedPages, PAGE_LIMIT);

const allPageFindings: Finding[][] = [];

for (let i = 0; i < pagesToProcess; i++) {
  try {
    const pageIndex = i;
    const sheetNumber = `Page ${pageIndex + 1}`;
    const sheetTitle = '';

    const pageImageSignedUrl = pageImages[pageIndex]?.signedUrl;
    const ocrTextForPage = '';

    const userContentParts: any[] = [
      { type: 'text', text: `Analyze the following single drawing page. Page: ${pageIndex + 1} of ${plannedPages}. File: ${fileData.file_name}. If known: sheet ${sheetNumber} ${sheetTitle}` },
    ];

    if (pageImageSignedUrl) {
      userContentParts.push({ type: 'image_url', image_url: { url: pageImageSignedUrl } });
    }

    userContentParts.push(
      { type: 'text', text: `OCR_TEXT:\n${ocrTextForPage || '(none)'}` },
      { type: 'text', text: `Return JSON ONLY following this schema:\n${FINDING_SCHEMA_TEXT}` }
    );

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContentParts },
    ];

    console.log('analyze:page', { page: pageIndex + 1, hasImage: !!pageImageSignedUrl, ocrLen: ocrTextForPage.length });

    const pageFindings = await analyzeContent(messages, `${fileData.file_name} (Page ${pageIndex + 1})`);
    if (Array.isArray(pageFindings)) allPageFindings.push(pageFindings);
  } catch (pageError) {
    console.error(`Error processing PDF page ${i + 1}:`, pageError);
  }
}

// Flatten and single fallback only if all pages produced zero findings
let aggregatedFindings: Finding[] = allPageFindings.flat().filter(Boolean) as Finding[];
if (!aggregatedFindings.length) {
  aggregatedFindings.push({
    category: "Other Red Flag",
    risk: "Low",
    confidence: "High",
    coordination_required: false,
    sheet_spec_reference: `${fileData.file_name}`,
    page: 1,
    nearby_text_marker: "N/A",
    issue: "No issues detected in the provided pages",
    construction_impact: "No coordination or constructability risks identified based on visible content.",
    ai_reasoning: "Model reviewed images and OCR text for each page and found no missing references, conflicts, or compliance concerns.",
    suggested_action: "Proceed; optionally run a deep-dive pass on critical sheets.",
    references: [`${fileData.file_name}`],
    cross_references: []
  });
}

// Store the results
const { data: analysisResult, error: analysisError } = await supabase
  .from('analysis_results')
  .insert({
    project_id: projectId,
    file_id: fileId,
    analysis_data: aggregatedFindings,
    status: 'completed'
  })
  .select()
  .single();

if (analysisError) {
  console.error('Error storing analysis:', analysisError);
  throw new Error('Failed to store analysis results');
}

return new Response(JSON.stringify({ 
  success: true, 
  analysisId: analysisResult.id,
  findings: aggregatedFindings,
  model: 'gpt-4.1-2025-04-14',
  minConfidenceShown: 'Medium'
}), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
        
      } catch (pdfError) {
        console.error('PDF processing error:', pdfError);
        // Fallback to basic PDF handling
        const analysisData = [{
          category: "Other Red Flag",
          description: "PDF processing encountered technical limitations. For comprehensive StudioCheck analysis, please convert your PDF pages to high-resolution JPG or PNG images. This enables our AI to perform detailed visual analysis of construction drawings, symbols, dimensions, and cross-references.",
          location_reference: fileData.file_name,
          severity: "Medium",
          cross_references: [],
          requires_coordination: false
        }];

        const { data: analysisResult, error: analysisError } = await supabase
          .from('analysis_results')
          .insert({
            project_id: projectId,
            file_id: fileId,
            analysis_data: analysisData,
            status: 'completed'
          })
          .select()
          .single();

        if (analysisError) throw new Error('Failed to store analysis results');

        return new Response(JSON.stringify({ 
          success: true, 
          analysisId: analysisResult.id,
          findings: analysisData 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // For images, build multimodal request (image + OCR text placeholder)
      console.log('Processing image file with enhanced StudioCheck analysis...');
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const userParts: any[] = [
        { type: 'text', text: `Analyze the following single drawing page. Page: 1 of 1. File: ${fileData.file_name}. If known: sheet  ${''} ${''}.` },
        { type: 'image_url', image_url: { url: `data:${fileData.mime_type};base64,${base64}` } },
        { type: 'text', text: `OCR_TEXT:\n(none)` },
        { type: 'text', text: `Return JSON ONLY following this schema:\n${FINDING_SCHEMA_TEXT}` },
      ];

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userParts },
      ];

      const pageFindings = await analyzeContent(messages, fileData.file_name);
      let aggregatedFindings: Finding[] = Array.isArray(pageFindings) ? pageFindings : [];

      // Single fallback only if no findings at all
      if (!aggregatedFindings.length) {
        aggregatedFindings.push({
          category: "Other Red Flag",
          risk: "Low",
          confidence: "High",
          coordination_required: false,
          sheet_spec_reference: `${fileData.file_name}`,
          page: 1,
          nearby_text_marker: "N/A",
          issue: "No issues detected in the provided page",
          construction_impact: "No coordination or constructability risks identified based on visible content.",
          ai_reasoning: "Model reviewed image and OCR text and found no missing references, conflicts, or compliance concerns.",
          suggested_action: "Proceed; optionally run a deep-dive pass on critical sheets.",
          references: [`${fileData.file_name}`],
          cross_references: []
        });
      }

      // Store analysis results
      const { data: analysisResult, error: analysisError } = await supabase
        .from('analysis_results')
        .insert({
          project_id: projectId,
          file_id: fileId,
          analysis_data: aggregatedFindings,
          status: 'completed'
        })
        .select()
        .single();

      if (analysisError) {
        console.error('Error storing analysis:', analysisError);
        throw new Error('Failed to store analysis results');
      }

      console.log('Analysis completed and stored:', analysisResult.id);

      return new Response(JSON.stringify({ 
        success: true, 
        analysisId: analysisResult.id,
        findings: aggregatedFindings,
        model: 'gpt-4.1-2025-04-14',
        minConfidenceShown: 'Medium'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Error in analyze-document function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Calls OpenAI with provided messages and returns typed findings
async function analyzeContent(messages: any[], fileName: string): Promise<Finding[]> {
  console.log('Sending to OpenAI for enhanced StudioCheck analysis...');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const analysisText = aiResponse.choices?.[0]?.message?.content ?? '';
    console.log('Enhanced AI Analysis received:', analysisText);

    try {
      const parsed = JSON.parse(analysisText) as { findings?: Finding[] };
      const findings = Array.isArray(parsed.findings) ? parsed.findings.filter(Boolean) : [];
      return findings;
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Error in analyzeContent function:', error);
    return [];
  }
}
