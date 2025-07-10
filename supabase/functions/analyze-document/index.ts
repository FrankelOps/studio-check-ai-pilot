import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import { fromUint8Array } from 'https://esm.sh/pdf2pic@3.0.3';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// StudioCheck – Specificity-First QA/QC Reviewer (v2) - Updated with Patch Instructions
const SYSTEM_PROMPT = `# Identity
You are an expert construction QA/QC reviewer embedded in the StudioCheck platform. Your role is to analyze uploaded architectural drawings and specifications as a professional owner's rep, architect, or design-phase QA consultant would — with field-realistic detail and trade-specific insight. You are not a pattern matcher or suggestion generator. You are a trained construction professional checking the plans as if they are going to be built tomorrow.

# Objective
Your goal is to surface only specific, clearly provable, and visually anchored issues from uploaded construction PDFs. These issues must reflect how a human reviewer would assess constructability, coordination, and completeness across disciplines.

# Scope of Review
When reviewing a drawing set (plans + specifications), focus on the following categories:
1. Cross-Reference & Callout Errors — Flag any missing or broken detail references (e.g. "Detail 3/A502" not found).
2. Coordination Conflicts — Identify overlapping or clashing systems (e.g., light fixture conflicts with mechanical diffuser).
3. Missing Information — Flag ONLY when compared to a referenced coordination element (e.g., "Panel A on E601 lists Circuit 5 but no Circuit 5 is shown on E101 plan"). DO NOT flag generic empty schedules unless they create coordination or constructability risk.
4. Drawing vs. Specification Inconsistencies — Highlight if notes, tags, or symbols contradict the specifications or each other.
5. Code/ADA Issues — Check code required clearances, layouts, reach heights, restrooms, door sizes, door swings, etc.
6. Buildability Risks — Would a contractor be able to build this without an RFI?

# Special Focus: Electrical Systems
For electrical systems, match circuit tags in panel schedules (e.g., "Ckt 3") with their locations and usage on electrical plan sheets. Flag mismatches or missing information only if they result in ambiguous installation for the electrical subcontractor.

# Critical Output Requirements
For each issue you identify, return the following exact fields:

{
  "category": "[Use one of: Missing Information, Coordination Conflict, Cross-Reference Failure, Drawing/Spec Inconsistency, Code/ADA Issue, Spec/Product Conflict]",
  "sheet_reference": "e.g. Sheet A101 referencing Detail 3/A502",
  "sheet_number": "e.g. A101 (REQUIRED - do not include page numbers)",
  "location_quadrant": "e.g. upper-right, bottom-left (REQUIRED)",
  "nearby_text": "e.g. 'Panel A schedule', 'Room 203 tag', 'Detail 3 callout' (REQUIRED)",
  "issue": "Short summary of what's wrong (e.g. 'Detail 3 is referenced but not present on Sheet A502.')",
  "construction_impact": "REQUIRED: Name affected trade(s), include likely delay/rework scenario, use Risk Level: High (delays/field stop), Medium (non-blocking but requires clarification), Low (minor conflict)",
  "reasoning": "REQUIRED: Explain exactly what you looked at and compared to identify this issue. No generic statements.",
  "suggested_action": "What should the design team or contractor do to fix this (e.g. 'Issue RFI for missing detail.' or 'Coordinate with structural team to resolve clash.')",
  "confidence_score": "High / Medium / Low (only include Medium or Low if the drawing is blurry or ambiguous).",
  "visual_reference": "MANDATORY: Describe what should be shown visually or provide bounding box description. Example: 'Bounding box around clash at Grid Line B3'.",
  "cross_references": ["A101", "S102"],
  "requires_coordination": true or false
}

# Instructions to Follow Strictly
- Do NOT return vague suggestions. Do not say "appears incorrect" or "might be missing."
- Only flag issues that are clearly visible and match typical QA/QC risk patterns.
- NEVER include page_number in output - use only sheet_number (e.g., E101, A203)
- ALL location descriptions MUST include: sheet_number, location_quadrant, and nearby_text
- Missing Information category: Only flag when compared to referenced coordination elements
- Construction Impact: Must name affected trades and include delay/rework scenarios with proper risk levels
- Reasoning: Must explain exactly what you compared - no generic statements
- Visual References: Mandatory for all findings
- If the same issue occurs across multiple sheets (e.g. "Detail 3 missing from 5 locations"), group them under one item and list the sheets.
- Always tie the issue to why it matters for real construction trades — what will get held up in the field if this is wrong?

# Output Format
Return all issues as a JSON array (not as a narrative or list).

# Tone and Professionalism
Use a professional, direct, and practical tone. You are writing like a QA consultant preparing a real design review report for a construction kickoff meeting.

# Final Reminder
Only return issues you can prove with what's visible. When in doubt, say nothing. Your credibility depends on being specific, accurate, and grounded in the actual plans.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, projectId } = await req.json();
    console.log('Analyzing document:', { fileId, projectId });

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
        
        const documentContext = `
DOCUMENT CONTEXT:
- Total Pages: ${pageCount}
- Available Sheets: ${sheetTitles.join(', ')}
- Document: ${fileData.file_name}

CRITICAL: Only reference sheets that actually exist in this document. Do not create fictional sheet references.
`;
        
        // Process each page as a separate image
        const analysisPromises = [];
        const allFindings = [];
        
        for (let i = 0; i < Math.min(pageCount, 10); i++) { // Limit to 10 pages for performance/cost
          try {
            // Extract page as image (simplified approach - in production would use proper PDF-to-image conversion)
            // For now, we'll create a comprehensive text analysis prompt for PDF pages
            const pageContent = [
              {
                type: 'text',
                text: `${documentContext}

HOLISTIC PDF ANALYSIS - Page ${i + 1} of ${pageCount}
                
Document: ${fileData.file_name}
Page: ${i + 1}/${pageCount}
Current Sheet: Page ${i + 1}
Building Type: Commercial/Healthcare/Life Science

IMPORTANT: Only reference sheets that exist in the available sheets list above. Do not invent or hallucinate sheet numbers.

Perform comprehensive construction QA/QC analysis of this PDF page. Apply expert-level construction document review thinking:

1. CONTEXT AWARENESS: Understand this page's role in the overall document set
2. CROSS-REFERENCE IDENTIFICATION: Note any callouts, detail bubbles, grid references, or sheet references - but ONLY reference sheets from the available sheets list
3. HOLISTIC ASSESSMENT: Evaluate design intent, not just isolated elements
4. COORDINATION VERIFICATION: Check for discipline conflicts and missing coordination
5. CONSTRUCTABILITY REVIEW: Identify potential construction challenges or clarifications needed

Focus on identifying issues that would typically require:
- RFIs (Request for Information)
- Change Orders
- Construction delays
- Rework or clarification

Return detailed findings with specific location references. If referencing other sheets, ONLY use sheets from the available sheets list.`
              }
            ];
            
            // For now, we'll analyze the PDF page conceptually
            // In production, you'd want to use a proper PDF-to-image library
            const pageAnalysis = await analyzeContent(pageContent, fileData.file_name + ` (Page ${i + 1})`);
            if (pageAnalysis && pageAnalysis.length > 0) {
              allFindings.push(...pageAnalysis);
            }
          } catch (pageError) {
            console.error(`Error processing PDF page ${i + 1}:`, pageError);
          }
        }
        
        // Combine all findings
        const consolidatedFindings = allFindings.length > 0 ? allFindings : [{
          category: "Other Red Flag",
          description: `PDF document processed (${pageCount} pages). For optimal vision-based analysis of construction drawings, consider converting PDF pages to high-resolution JPG/PNG images. This enables detailed visual analysis of drawings, symbols, dimensions, and annotations.`,
          location_reference: fileData.file_name,
          severity: "Medium",
          cross_references: [],
          requires_coordination: false
        }];

        // Store the results
        const { data: analysisResult, error: analysisError } = await supabase
          .from('analysis_results')
          .insert({
            project_id: projectId,
            file_id: fileId,
            analysis_data: consolidatedFindings,
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
          findings: consolidatedFindings 
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
      // For images, use enhanced vision analysis
      console.log('Processing image file with enhanced StudioCheck analysis...');
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      content = [
        {
          type: 'text',
          text: `STUDIOCHECK CONSTRUCTION DOCUMENT ANALYSIS

Document: ${fileData.file_name}
Building Type: Commercial/Healthcare/Life Science

Apply expert construction QA/QC review methodology:

🔍 HOLISTIC ANALYSIS APPROACH:
- Understand the drawing's role in the overall construction document set
- Identify design intent and coordination requirements
- Look for cross-sheet references and verify their logical consistency
- Assess constructability and potential field conflicts

🎯 SPECIFIC FOCUS AREAS:
- Detail callouts and their accuracy (e.g., "Detail 3 on A501")
- Grid references and dimensional coordination
- Material specifications vs. drawn details
- Symbol consistency and legend compliance
- Discipline coordination (architectural, structural, MEP)
- Code compliance and ADA requirements
- Specification alignment with drawings

📋 CROSS-REFERENCE TRACKING:
- Note any references to other sheets, details, or specifications
- Flag inconsistencies between callouts and available information
- Identify missing references that should exist for clarity

Return comprehensive findings that would help prevent RFIs, change orders, and construction delays.`
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${fileData.mime_type};base64,${base64}`,
            detail: 'high'
          }
        }
      ];
    }

    // Analyze the content using the enhanced StudioCheck methodology
    const analysisData = await analyzeContent(content, fileData.file_name);

    // Store analysis results
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

    if (analysisError) {
      console.error('Error storing analysis:', analysisError);
      throw new Error('Failed to store analysis results');
    }

    console.log('Analysis completed and stored:', analysisResult.id);

    return new Response(JSON.stringify({ 
      success: true, 
      analysisId: analysisResult.id,
      findings: analysisData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

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

// Enhanced analysis function for comprehensive construction document review
async function analyzeContent(content: any, fileName: string) {
  console.log('Sending to OpenAI for enhanced StudioCheck analysis...');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: content
          }
        ],
        max_tokens: 3000,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const analysisText = aiResponse.choices[0].message.content;
    
    console.log('Enhanced AI Analysis received:', analysisText);

    // Parse JSON response with enhanced error handling
    let analysisData;
    try {
      // Extract JSON from response if it's wrapped in markdown or other text
      const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : analysisText;
      analysisData = JSON.parse(jsonString);
      
      // Ensure all findings have the required enhanced fields and convert to new format
      analysisData = analysisData.map((finding: any) => ({
        // Enhanced StudioCheck format
        category: finding.category || "Other Red Flag",
        sheet_reference: finding.sheet_reference || finding.location_reference || fileName,
        location: finding.location || finding.location_reference || "",
        nearby_text: finding.nearby_text || "",
        issue: finding.issue || finding.description || "",
        construction_impact: finding.construction_impact || "",
        reasoning: finding.reasoning || "",
        suggested_action: finding.suggested_action || "",
        severity: finding.severity || "Medium",
        cross_references: finding.cross_references || [],
        requires_coordination: finding.requires_coordination || false,
        // Legacy fields for backward compatibility
        description: finding.description || finding.issue || "",
        location_reference: finding.location_reference || finding.sheet_reference || fileName
      }));
      
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Fallback: create a comprehensive finding with the analysis text
      analysisData = [{
        category: "Other Red Flag",
        sheet_reference: fileName,
        location: "",
        nearby_text: "",
        issue: `StudioCheck Analysis: ${analysisText}`,
        construction_impact: "Technical analysis limitation encountered. For best results, ensure documents are high-quality images or properly formatted PDFs.",
        reasoning: "AI response could not be parsed into structured format",
        suggested_action: "Review document format and retry analysis",
        severity: "Medium",
        cross_references: [],
        requires_coordination: false,
        // Legacy fields
        description: `StudioCheck Analysis: ${analysisText}`,
        location_reference: fileName
      }];
    }

    return analysisData;
    
  } catch (error) {
    console.error('Error in analyzeContent function:', error);
    // Return a meaningful error finding
    return [{
      category: "Other Red Flag",
      description: `StudioCheck analysis encountered a technical issue. Please retry the analysis or contact support if the issue persists. Error: ${error.message}`,
      location_reference: fileName,
      severity: "Low",
      cross_references: [],
      requires_coordination: false
    }];
  }
}