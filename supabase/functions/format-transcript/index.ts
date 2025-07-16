import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const { speakerSegments, transcriptText } = await req.json();

    // Create the prompt for GPT-4 to format the transcript
    const prompt = `You are a transcript formatting assistant. Your job is to transform raw meeting transcripts into a clean, readable format for human viewers.

Follow these formatting rules exactly:

1. Format each block as:
   [Speaker Name, Start Timestamp]:
   Text spoken by that speaker...

2. Use speaker names and timestamps from speaker_segments data when available.

3. Group each speaker's contribution as its own block. If a speaker speaks more than once, show each block separately in order.

4. Break long responses into readable paragraphs as needed.

5. Add punctuation to make the transcript readable: complete sentences, capitalization, periods, commas, etc.

6. Preserve original phrasing — do not summarize or reword. Keep filler words only if they provide tone or context.

7. Insert a blank line between each speaker block for visual clarity.

Input data:
${speakerSegments ? `Speaker Segments: ${JSON.stringify(speakerSegments)}` : `Raw Transcript: ${transcriptText}`}

Please format this transcript according to the rules above.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a transcript formatting assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const formattedTranscript = data.choices[0].message.content;

    return new Response(JSON.stringify({ formattedTranscript }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in format-transcript function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});