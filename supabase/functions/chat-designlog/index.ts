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

    // Generate embedding for the user's question
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: question,
      }),
    });

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate embedding for question');
    }

    const embeddingData = await embeddingResponse.json();
    const questionEmbedding = embeddingData.data[0].embedding;

    // Search for relevant content using semantic similarity
    const { data: similarContent, error: searchError } = await supabase.rpc(
      'search_transcript_embeddings',
      {
        query_embedding: questionEmbedding,
        match_threshold: 0.7,
        match_count: 10,
        project_id_param: projectId
      }
    );

    if (searchError) {
      console.error('Error searching embeddings:', searchError);
      // Fallback to traditional approach if embeddings search fails
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
        .order('created_at', { ascending: false })
        .limit(10);

      if (designLogError) {
        throw new Error('Failed to fetch design log context');
      }

      // Prepare context from design log entries (fallback)
      const designLogContext = designLogData?.map((entry: any) => `
Type: ${entry.type}
Date: ${entry.date || 'Not specified'}
Meeting/Event: ${entry.meeting_event || 'Not specified'}
Summary: ${entry.summary}
Rationale: ${entry.rationale || 'None provided'}
Status: ${entry.status}
Tags: ${entry.tags ? entry.tags.join(', ') : 'None'}
Source File: ${entry.uploaded_files.file_name}
Created: ${new Date(entry.created_at).toLocaleDateString()}
`).join('\n---\n') || '';

      // Continue with the fallback context
      return await generateResponse(designLogContext, '', question, []);
    }

    // Get unique design_log_ids from search results to fetch full transcripts
    const designLogIds = [...new Set(similarContent?.map((item: any) => item.design_log_id) || [])];
    
    // Fetch full meeting transcripts for the matched design logs
    let fullTranscripts: any[] = [];
    if (designLogIds.length > 0) {
      const { data: meetingMinutes, error: transcriptError } = await supabase
        .from('meeting_minutes')
        .select('meeting_title, meeting_date, transcript_text, design_logs!inner(id)')
        .in('design_logs.id', designLogIds)
        .not('transcript_text', 'is', null)
        .order('meeting_date', { ascending: false });
      
      if (!transcriptError && meetingMinutes) {
        fullTranscripts = meetingMinutes;
      }
    }

    // Also try keyword search as fallback if embeddings don't return good results
    let keywordSearchResults: any[] = [];
    if (similarContent?.length === 0 || !similarContent) {
      const { data: keywordData, error: keywordError } = await supabase
        .from('meeting_minutes')
        .select('meeting_title, meeting_date, transcript_text, design_logs!inner(id, project_id)')
        .eq('design_logs.project_id', projectId)
        .textSearch('transcript_text', question.replace(/[^a-zA-Z0-9\s]/g, ''))
        .not('transcript_text', 'is', null)
        .limit(3);
      
      if (!keywordError && keywordData) {
        keywordSearchResults = keywordData;
      }
    }

    // Prepare enhanced context with both embeddings and full transcripts
    let relevantContext = '';
    let transcriptContext = '';

    if (similarContent && similarContent.length > 0) {
      relevantContext = similarContent.map((item: any) => `
Design Log Entry:
Type: ${item.type}
Date: ${item.date || 'Not specified'}
Meeting/Event: ${item.meeting_event || 'Not specified'}
Summary: ${item.summary}
Rationale: ${item.rationale || 'None provided'}
Relevant Content: ${item.content_text}
Similarity Score: ${(item.similarity * 100).toFixed(1)}%
Created: ${new Date(item.created_at).toLocaleDateString()}
`).join('\n---\n');
    }

    if (fullTranscripts.length > 0) {
      transcriptContext = fullTranscripts.map((transcript: any) => `
Full Meeting Transcript:
Meeting: ${transcript.meeting_title}
Date: ${new Date(transcript.meeting_date).toLocaleDateString()}
Transcript: ${transcript.transcript_text}
`).join('\n---\n');
    }

    if (keywordSearchResults.length > 0) {
      const keywordContext = keywordSearchResults.map((result: any) => `
Keyword Match - Meeting Transcript:
Meeting: ${result.meeting_title}
Date: ${new Date(result.meeting_date).toLocaleDateString()}
Transcript: ${result.transcript_text}
`).join('\n---\n');
      
      transcriptContext = transcriptContext ? transcriptContext + '\n---\n' + keywordContext : keywordContext;
    }

    return await generateResponse(relevantContext, transcriptContext, question, fullTranscripts);

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

// Helper function to generate OpenAI response
async function generateResponse(context: string, transcriptContext: string, userQuestion: string, fullTranscripts: any[]) {
      const systemPrompt = `You are StudioCheck DesignLog AI Assistant, an expert in architecture and construction design decision tracking.

You have access to both design log summaries and full meeting transcripts to answer questions comprehensively.

${context ? `CONTEXT - Design Log Entries:
${context}` : ''}

${transcriptContext ? `CONTEXT - Meeting Transcripts:
${transcriptContext}` : ''}

Your role:
- Answer questions about design decisions, owner requirements, and open questions
- Explain the rationale behind design choices using both summaries and transcript details
- Help track decision history and context
- Provide insights on project requirements and constraints
- Quote specific transcript excerpts when relevant to support your answers

Enhanced Guidelines:
- When transcript excerpts are available, quote relevant parts directly
- Include meeting dates and titles when referencing transcript content
- If a topic was discussed in multiple meetings, summarize how the conversation evolved
- Use the format: "From [Meeting Title] on [Date]: [quoted excerpt]"
- Distinguish between Owner Requirements, Design Decisions, and Open Questions
- Use professional, clear language appropriate for architects and design teams
- If a question can't be answered from available data, say so clearly
- Prioritize transcript content over summaries when both are available for better accuracy

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
              content: userQuestion
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

      // Extract source information for the UI
      const sources = fullTranscripts.map((transcript: any) => ({
        meeting_title: transcript.meeting_title,
        meeting_date: transcript.meeting_date,
        hasTranscript: true
      }));

      return new Response(JSON.stringify({ 
        success: true, 
        answer: answer,
        sources: sources
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
}