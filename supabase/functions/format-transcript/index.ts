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

    // Helper function to convert seconds to MM:SS format
    const formatTimestamp = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    let prompt;

    if (speakerSegments && speakerSegments.length > 0) {
      // Pre-process speaker segments to add formatted timestamps and merge consecutive segments
      const processedSegments = [];
      let currentSpeaker = null;
      let currentBlock = null;

      speakerSegments.forEach((segment, index) => {
        const speaker = segment.speaker || `Speaker ${String.fromCharCode(65 + (index % 26))}`;
        const startTime = parseFloat(segment.start_time) || 0;
        const formattedTime = formatTimestamp(startTime);
        
        // Merge consecutive segments from same speaker
        if (currentSpeaker === speaker && currentBlock) {
          // Append text to current block
          currentBlock.text += ' ' + (segment.text || '').trim();
        } else {
          // Save previous block if exists
          if (currentBlock) {
            processedSegments.push(currentBlock);
          }
          
          // Start new block
          currentBlock = {
            speaker: speaker,
            start_time: startTime,
            formatted_time: formattedTime,
            text: (segment.text || '').trim()
          };
          currentSpeaker = speaker;
        }
      });

      // Add the last block
      if (currentBlock) {
        processedSegments.push(currentBlock);
      }

      prompt = `You are a transcript formatting assistant with expertise in speaker diarization and conversation flow analysis. Your job is to transform preprocessed speaker segments into a clean, readable format with intelligent speaker attribution corrections.

CRITICAL FORMATTING RULES:

1. Format each speaker block EXACTLY as:
   [Speaker Name, MM:SS]:
   Complete sentences with proper punctuation...

2. SPEAKER ATTRIBUTION INTELLIGENCE:
   - Analyze the conversation flow and context clues for speaker accuracy
   - Use contextual clues to fix obvious misattributions:
     * "Thanks, Jeff" means the PREVIOUS speaker was NOT Jeff
     * "Jeff, what do you think?" means the NEXT speaker is likely Jeff
     * References like "As I mentioned..." indicate same speaker continuing
   - If you detect a clear speaker name in the conversation, use that instead of generic labels
   - Maintain speaker consistency throughout (if someone is "Jeff" once, keep them as "Jeff")

3. TIMESTAMP REQUIREMENTS:
   - Use the formatted_time provided for each segment
   - Every speaker block MUST start with [Speaker Name, MM:SS]:
   - Do NOT modify the timestamps - use them exactly as provided

4. TEXT FORMATTING:
   - Add proper punctuation: periods, commas, capitalization
   - Break long responses into readable paragraphs within the same speaker block
   - Preserve original phrasing - do not summarize or reword
   - Remove only excessive filler words ("um, um, um" → "um")

5. SPEAKER BLOCK SEPARATION:
   - Insert blank line between different speakers
   - Group related thoughts from same speaker together

Preprocessed Speaker Segments:
${JSON.stringify(processedSegments, null, 2)}

EXAMPLE OUTPUT FORMAT:
[Jeff, 01:12]:
We're considering doing terrazzo on level one. We just need to confirm timing with the contractor. 

Based on what Katherine mentioned earlier, this could work well with our schedule.

[Katherine, 02:45]:
That sounds good. Let's also check if the wall signage is still in scope for this phase.

Apply intelligent speaker attribution correction and format according to these exact specifications. Use the provided formatted timestamps and improve speaker names based on context clues.`;
    } else {
      // Enhanced inference when segments aren't available
      prompt = `You are a transcript formatting assistant specializing in speaker diarization from unstructured text. The transcript below has no speaker labels - your job is to create a structured, readable conversation format with intelligent speaker detection.

FORMATTING REQUIREMENTS:

1. FORMAT: Each speaker block must follow:
   [Speaker Name, MM:SS]:
   Complete sentences with punctuation...

2. SPEAKER DETECTION STRATEGY:
   - Analyze speech patterns, vocabulary, and conversational flow
   - Look for clear speaker transitions: pauses, topic shifts, questions/answers
   - Use contextual clues to identify speakers:
     * Direct address: "Thanks, Jeff" → previous speaker wasn't Jeff
     * Questions directed at someone: "Katherine, what's your take?" → next speaker likely Katherine
     * Self-references: "As I mentioned..." → same speaker continuing
   
3. SPEAKER NAMING:
   - If names are identifiable from context, use them: [Jeff], [Katherine]
   - If unclear but distinct speakers, use: [Speaker A], [Speaker B], etc.
   - Only use [Unknown] when absolutely necessary

4. TIMESTAMP INFERENCE:
   - Add approximate timestamps every 30-60 seconds: [2:30], [4:15], etc.
   - Base timing on natural conversation breaks and topic shifts

5. TEXT FORMATTING:
   - Add punctuation and fix run-on sentences
   - Break into paragraphs for readability within speaker blocks
   - Preserve original phrasing - do not summarize
   - Remove excessive filler words but keep meaningful speech patterns

6. CONVERSATION FLOW:
   - Ensure logical speaker transitions
   - Group related thoughts from same person
   - Insert blank lines between different speakers

Raw Transcript:
${transcriptText}

EXAMPLE OUTPUT:
[Speaker A, 00:00:15]:
We need to finalize the lobby design. The current layout has some accessibility concerns that we should address.

[Jeff, 00:01:30]:
I agree. Thanks for bringing that up. We could adjust the entrance ramp to meet ADA requirements without losing too much space.

[Katherine, 00:02:45]:
That works for me. Let's make sure we coordinate with the structural team on any changes.

Create a well-structured dialogue with intelligent speaker attribution and proper formatting.`;
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
          { role: 'system', content: 'You are an expert transcript formatting assistant specializing in speaker attribution and conversation analysis. Focus on creating accurate, readable transcripts with intelligent speaker detection and proper formatting.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Lower temperature for more consistent formatting
        max_tokens: 4000, // Increased for longer transcripts
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    let formattedTranscript = data.choices[0].message.content;

    // Optional: Apply additional validation and cleanup
    if (formattedTranscript) {
      // Ensure proper formatting consistency
      formattedTranscript = formattedTranscript
        .replace(/\[([^,\]]+)\s*,\s*([^\]]+)\]\s*:\s*/g, '[$1, $2]:\n') // Standardize speaker format
        .replace(/\n{3,}/g, '\n\n') // Limit to max 2 line breaks
        .trim();
    }

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