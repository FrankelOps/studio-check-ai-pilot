import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { designLogId, fileId, projectId, type = 'design_log' } = await req.json();
    
    if (!designLogId && !fileId) {
      throw new Error('Missing design log ID or file ID');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let text = '';
    let targetTable = 'design_logs';
    let targetId = designLogId;

    if (type === 'meeting_minutes' && fileId) {
      // Handle meeting minutes regeneration
      targetTable = 'meeting_minutes';
      
      // Get the meeting minutes entry
      const { data: meetingMinute, error: minuteError } = await supabaseClient
        .from('meeting_minutes')
        .select('*, uploaded_files(*)')
        .eq('file_id', fileId)
        .eq('project_id', projectId)
        .single();

      if (minuteError) throw minuteError;
      
      targetId = meetingMinute.id;
      
      // Try to get the original transcript text
      if (meetingMinute.transcript_text) {
        text = meetingMinute.transcript_text;
      } else if (meetingMinute.uploaded_files) {
        try {
          const { data: fileContent, error: downloadError } = await supabaseClient.storage
            .from('project-files')
            .download(meetingMinute.uploaded_files.file_path);

          if (!downloadError) {
            text = await fileContent.text();
          }
        } catch (error) {
          console.warn('Could not download original file:', error);
        }
      }
    } else {
      // Handle design log regeneration (original logic)
      const { data: designLog, error: designLogError } = await supabaseClient
        .from('design_logs')
        .select('*, uploaded_files(*)')
        .eq('id', designLogId)
        .single();

      if (designLogError) throw designLogError;

      // Try to get the original transcript text
      if (designLog.uploaded_files) {
        try {
          const { data: fileContent, error: downloadError } = await supabaseClient.storage
            .from('project-files')
            .download(designLog.uploaded_files.file_path);

          if (!downloadError) {
            text = await fileContent.text();
          }
        } catch (error) {
          console.warn('Could not download original file:', error);
        }
      }

      // If we don't have transcript text, use existing summary as fallback
      if (!text && designLog.summary) {
        text = `${designLog.summary}${designLog.rationale ? '\n\n' + designLog.rationale : ''}`;
      }
    }

    if (!text) {
      throw new Error('No transcript or summary text available for regeneration');
    }

    // Generate key insights summary using OpenAI
    const summaryAnalysis = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: `You are an AI meeting assistant for an architecture and construction project team.

Your task is to extract a clear, human-readable outline of the key insights from the meeting transcript below.

Focus on capturing:
- Topics discussed
- Observations and feedback shared
- Informal or exploratory discussions
- Background context (e.g. rationale, constraints)
- Owner or stakeholder concerns
- Important themes that may not be decisions or tasks

Format your output as a clean, bulleted summary. Do not include action items, questions, or final decisions — those are handled separately.

Use natural phrasing and keep each bullet concise. If possible, include timestamps at the start of each bullet (e.g., "00:12 — Discussed lobby layout options").`
          },
          {
            role: 'user',
            content: `Extract key insights from this architectural meeting content:

CONTENT:
${text}

Provide a bulleted summary of key discussion points and insights.`
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      }),
    });

    if (!summaryAnalysis.ok) {
      throw new Error(`OpenAI API error: ${summaryAnalysis.statusText}`);
    }

    const summaryResult = await summaryAnalysis.json();
    const summaryOutline = summaryResult.choices[0].message.content;

    // Update the appropriate table with the new summary
    const { data: updatedEntry, error: updateError } = await supabaseClient
      .from(targetTable)
      .update({ summary_outline: summaryOutline })
      .eq('id', targetId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`Successfully regenerated summary for ${targetTable} ${targetId}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary_outline: summaryOutline,
        entry: updatedEntry
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in regenerate-summary function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});