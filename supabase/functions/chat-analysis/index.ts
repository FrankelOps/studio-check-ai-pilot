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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, projectId } = await req.json();
    console.log('AI Chat request:', { question, projectId });

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all analysis results for the project to provide context
    const { data: analysisData, error: analysisError } = await supabase
      .from('analysis_results')
      .select(`
        id,
        analysis_data,
        created_at,
        uploaded_files!inner(file_name)
      `)
      .eq('project_id', projectId);

    if (analysisError) {
      console.error('Error fetching analysis data:', analysisError);
      throw new Error('Failed to fetch analysis context');
    }

    // Prepare context from analysis results
    let analysisContext = '';
    if (analysisData && analysisData.length > 0) {
      analysisContext = analysisData.map((result: any) => {
        const findings = Array.isArray(result.analysis_data) ? result.analysis_data : [];
        return `
File: ${result.uploaded_files.file_name}
Analysis Date: ${new Date(result.created_at).toLocaleDateString()}
Findings: ${JSON.stringify(findings, null, 2)}
`;
      }).join('\n---\n');
    }

    const systemPrompt = `You are StudioCheck AI Assistant, a construction QA/QC expert helping users understand their analysis results.

CONTEXT - Analysis Results for this project:
${analysisContext}

Your role:
- Answer questions about the analysis findings
- Explain construction impacts and risks
- Provide guidance on suggested actions
- Help clarify technical issues
- Be specific and reference actual findings when relevant

Guidelines:
- Always reference specific findings when answering
- Provide actionable construction advice
- Use professional, clear language
- If a question can't be answered from the available data, say so clearly
- Focus on helping prevent RFIs, change orders, and construction delays`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o",
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: question
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const answer = aiResponse.choices[0].message.content;

    console.log('AI Chat response generated successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      answer: answer
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-analysis function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});