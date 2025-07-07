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
    console.log('DesignLog AI Chat request:', { question, projectId });

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all design log entries for the project to provide context
    const { data: designLogData, error: designLogError } = await supabase
      .from('design_logs')
      .select(`
        id,
        type,
        date,
        meeting_event,
        summary,
        rationale,
        status,
        tags,
        created_at,
        uploaded_files!inner(file_name)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (designLogError) {
      console.error('Error fetching design log data:', designLogError);
      throw new Error('Failed to fetch design log context');
    }

    // Prepare context from design log entries
    let designLogContext = '';
    if (designLogData && designLogData.length > 0) {
      designLogContext = designLogData.map((entry: any) => {
        return `
Type: ${entry.type}
Date: ${entry.date || 'Not specified'}
Meeting/Event: ${entry.meeting_event || 'Not specified'}
Summary: ${entry.summary}
Rationale: ${entry.rationale || 'None provided'}
Status: ${entry.status}
Tags: ${entry.tags ? entry.tags.join(', ') : 'None'}
Source File: ${entry.uploaded_files.file_name}
Created: ${new Date(entry.created_at).toLocaleDateString()}
`;
      }).join('\n---\n');
    }

    const systemPrompt = `You are StudioCheck DesignLog AI Assistant, an expert in architecture and construction design decision tracking.

CONTEXT - Design Log Entries for this project:
${designLogContext}

Your role:
- Answer questions about design decisions, owner requirements, and open questions
- Explain the rationale behind design choices
- Help track decision history and context
- Provide insights on project requirements and constraints
- Reference specific log entries when answering questions

Guidelines:
- Always reference specific design log entries when answering
- Distinguish between Owner Requirements, Design Decisions, and Open Questions
- Provide context from meeting notes and rationale when available
- Use professional, clear language appropriate for architects and design teams
- If a question can't be answered from the available design log data, say so clearly
- Focus on helping maintain design continuity and decision traceability

Types of entries in the log:
- Owner Requirement: Client-stated preferences, requests, or constraints
- Design Decision: Choices made by the design team with rationale
- Open Question: Unresolved issues requiring follow-up or decisions`;

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

    console.log('DesignLog AI Chat response generated successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      answer: answer
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-designlog function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});