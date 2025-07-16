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

    let prompt;

    if (speakerSegments && speakerSegments.length > 0) {
      // Use speaker segments when available
      prompt = `You are a transcript formatting assistant. Your job is to transform raw meeting transcripts into a clean, readable format for human viewers using the provided speaker segment data.

Follow these formatting rules exactly:

1. Format each block as:
   [Speaker Name, Start Timestamp]:
   Text spoken by that speaker...

2. Use speaker names and timestamps from speaker_segments data.

3. Group each speaker's contribution as its own block. If a speaker speaks more than once, show each block separately in order.

4. Break long responses into readable paragraphs as needed.

5. Add punctuation to make the transcript readable: complete sentences, capitalization, periods, commas, etc.

6. Preserve original phrasing — do not summarize or reword. Keep filler words only if they provide tone or context.

7. Insert a blank line between each speaker block for visual clarity.

8. Apply contextual intelligence to fix obvious speaker misattributions:
   - If someone says "Thanks, Jeff" or "Jeff, what do you think?", the previous speaker was likely NOT Jeff
   - Use conversational context clues to refine speaker attribution
   - When speaker IDs seem inconsistent, use content analysis to group similar voices/speaking patterns

Speaker Segments Data: ${JSON.stringify(speakerSegments)}

Please format this transcript according to the rules above, applying intelligent speaker attribution refinement.`;
    } else {
      // Infer speaker turns when segments aren't available
      prompt = `You are a transcript formatting assistant. The transcript below is raw and unstructured, with no speaker labels. Your job is to reformat it into a readable, conversation-style transcript.

Instructions:

- Break the text into clear speaker turns based on context switches, pauses, and conversational flow
- Format each turn like:
  [Speaker]:
  Full sentence(s)...

- If speaker names can be identified from context (e.g., "Jeff said", "Katherine mentioned"), use those names: [Jeff], [Katherine]
- If speaker names cannot be reliably extracted, use [Speaker] or [Unknown]
- Add paragraph breaks between speakers
- Add punctuation and fix run-on sentences, but do not change the original phrasing or summarize
- Remove excessive filler words (e.g., repeated "yeah, yeah, yeah") but preserve meaningful speech patterns
- Add approximate timestamps every 2-3 minutes if possible using format [2:30] at natural breaks

Raw Transcript:
${transcriptText}

Please format this transcript into a clear dialogue structure with speaker turns.`;
    }

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