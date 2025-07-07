import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// StudioCheck Prompt Pack - QA/QC Construction Document Analysis
const SYSTEM_PROMPT = `You are an expert construction QA/QC reviewer working within a Lovable.ai automated agent for StudioCheck. Your task is to review the uploaded drawings and specifications for a commercial, healthcare, or life science project. Identify risks that could lead to RFIs, change orders, construction delays, or rework.

Focus your review on:
- Architectural and engineering plans
- Reflected ceiling plans (RCPs)
- Elevations
- Schedules (e.g. door, hardware, material)
- Specifications

Carefully analyze the provided documents or images. Identify and list:
1️⃣ **Missing Information** – incomplete dimensions, missing notes, absent key details.
2️⃣ **Coordination Conflicts** – plan backgrounds or layouts differ between disciplines (e.g. architectural RCP vs. MEP RCP misalignment).
3️⃣ **Spec/Product Conflicts** – material schedules or specs that don't match drawings.
4️⃣ **Code / ADA Issues** – obvious violations (clearances, egress, accessibility).
5️⃣ **Drawing/Spec Inconsistencies** – contradictions between sheets or sections.
6️⃣ **Other Red Flags** – anything likely to trigger an RFI or change order.

Reference sheet numbers, detail bubbles, and specific locations wherever possible.

Return your response as a JSON array with this exact structure:
[
  {
    "category": "Coordination Conflict",
    "description": "Architectural reflected ceiling plan on A-511 does not match mechanical RCP on M-401 — diffuser locations misaligned.",
    "location_reference": "A-511 and M-401",
    "severity": "High"
  }
]

Categories must be one of: "Missing Information", "Coordination Conflict", "Spec/Product Conflict", "Code/ADA Issue", "Drawing/Spec Inconsistency", "Other Red Flag"
Severity must be one of: "Low", "Medium", "High"`;

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
      // For now, PDFs need to be converted to images for analysis
      // Return a helpful message for PDF files
      console.log('PDF file detected - currently not supported');
      
      // Store a helpful message in the analysis results
      const analysisData = [{
        category: "Other Red Flag",
        description: "PDF analysis is currently limited. For best results, please convert your PDF pages to JPG or PNG images and upload them separately. This allows our AI to visually analyze construction drawings, plans, and specifications.",
        location_reference: fileData.file_name,
        severity: "Medium"
      }];

      // Store the result
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

      return new Response(JSON.stringify({ 
        success: true, 
        analysisId: analysisResult.id,
        findings: analysisData 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // For images, use vision model
      console.log('Processing image file...');
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      content = [
        {
          type: 'text',
          text: `Please analyze this construction document (${fileData.file_name}) for QA/QC issues. The building type is commercial/healthcare. Return findings as JSON array.`
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

    console.log('Sending to OpenAI for analysis...');

    // Call OpenAI API
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
        max_tokens: 2000,
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
    
    console.log('AI Analysis received:', analysisText);

    // Parse JSON response
    let analysisData;
    try {
      // Extract JSON from response if it's wrapped in markdown or other text
      const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
      const jsonString = jsonMatch ? jsonMatch[0] : analysisText;
      analysisData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Fallback: create a single finding with the raw text
      analysisData = [{
        category: "Other Red Flag",
        description: analysisText,
        location_reference: fileData.file_name,
        severity: "Medium"
      }];
    }

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