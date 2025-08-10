import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Architecture-specific vocabulary for better transcription
const architecturalTerms = [
  "architectural", "structural", "mechanical", "electrical", "plumbing", "HVAC",
  "foundation", "framing", "drywall", "roofing", "flooring", "ceiling",
  "beam", "column", "load-bearing", "non-load-bearing", "seismic", "code compliance",
  "ADA", "accessibility", "egress", "fire rating", "thermal bridge", "R-value",
  "U-value", "LEED", "sustainable", "energy efficient", "daylight", "ventilation",
  "MEP", "coordinations", "clash detection", "BIM", "Revit", "AutoCAD",
  "specifications", "submittals", "shop drawings", "RFI", "change order",
  "punch list", "commissioning", "substantial completion", "certificate of occupancy"
];

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio, mimeType = 'audio/webm', projectId } = await req.json();
    
    if (!audio) {
      throw new Error('No audio data provided');
    }

    const assemblyAIKey = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!assemblyAIKey) {
      throw new Error('AssemblyAI API key not configured');
    }

    console.log('Transcribing audio with AssemblyAI...');

    // Process audio in chunks to prevent memory issues
    const binaryAudio = processBase64Chunks(audio);
    
    // Step 1: Upload audio file to AssemblyAI
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'Authorization': assemblyAIKey,
        'Content-Type': 'application/octet-stream',
      },
      body: binaryAudio,
    });

    if (!uploadResponse.ok) {
      throw new Error(`AssemblyAI upload error: ${await uploadResponse.text()}`);
    }

    const { upload_url } = await uploadResponse.json();
    console.log('Audio uploaded to AssemblyAI');

    // Step 2: Submit transcription request with enhanced features
    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': assemblyAIKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: upload_url,
        speaker_labels: true, // Enable speaker diarization
        auto_highlights: true, // Extract key phrases
        sentiment_analysis: true, // Analyze sentiment
        entity_detection: true, // Detect entities
        word_boost: architecturalTerms, // Boost architectural vocabulary
        boost_param: 'high', // High boost for domain terms
        punctuate: true,
        format_text: true,
        dual_channel: false,
        webhook_url: null,
        summarization: true, // Enable summarization
        summary_model: 'informative',
        summary_type: 'bullets'
      }),
    });

    if (!transcriptResponse.ok) {
      throw new Error(`AssemblyAI transcript request error: ${await transcriptResponse.text()}`);
    }

    const transcriptData = await transcriptResponse.json();
    const transcriptId = transcriptData.id;
    console.log('Transcription request submitted:', transcriptId);

    // Step 3: Poll for completion
    let transcript = null;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max wait

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': assemblyAIKey,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`AssemblyAI status check error: ${await statusResponse.text()}`);
      }

      transcript = await statusResponse.json();
      
      if (transcript.status === 'completed') {
        break;
      } else if (transcript.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
      }
      
      attempts++;
      console.log(`Transcription in progress... (${transcript.status})`);
    }

    if (!transcript || transcript.status !== 'completed') {
      throw new Error('Transcription timeout or failed');
    }

    console.log('Transcription completed successfully with AssemblyAI');

    // Process transcript with enhanced features
    const processedTranscript = {
      success: true,
      text: transcript.text,
      summary: transcript.summary,
      chapters: transcript.chapters || [],
      utterances: transcript.utterances || [], // Speaker-labeled segments
      auto_highlights_result: transcript.auto_highlights_result || null,
      sentiment_analysis_results: transcript.sentiment_analysis_results || [],
      entities: transcript.entities || [],
      duration: transcript.audio_duration / 1000, // Convert to seconds
      confidence: transcript.confidence,
      words: transcript.words || [], // Word-level timestamps
      speakers: transcript.utterances ? 
        [...new Set(transcript.utterances.map(u => u.speaker))] : []
    };

    // Enhanced processing with GPT-4o for decision extraction and key insights
    if (transcript.text && transcript.text.length > 100) {
      try {
        // Generate decision analysis
        const enhancedAnalysis = await fetch('https://api.openai.com/v1/chat/completions', {
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
                content: `You are an expert AI for analyzing architectural project meetings. Extract and categorize information from transcripts into:

1. **Decision Points**: Specific design or technical decisions made
2. **Owner Requirements**: Requirements, preferences, or constraints stated by the owner
3. **Action Items**: Tasks assigned with responsible parties and deadlines
4. **Open Questions**: Unresolved issues requiring follow-up
5. **Key Topics**: Main subjects discussed (CSI divisions, project phases)

Include speaker information when available. Focus on actionable items and decisions that affect the project.

Return as structured JSON with categories and items.`
              },
              {
                role: 'user',
                content: `Analyze this architectural meeting transcript and extract structured information:

TRANSCRIPT:
${transcript.text}

${transcript.utterances && transcript.utterances.length > 0 ? 
  `\nSPEAKER INFORMATION:\n${transcript.utterances.map(u => 
    `Speaker ${u.speaker} (${u.start/1000}s-${u.end/1000}s): ${u.text}`
  ).join('\n')}` : ''}

Extract decisions, requirements, action items, and questions with speaker attribution when possible.`
              }
            ],
            temperature: 0.3,
            max_tokens: 2000
          }),
        });

        if (enhancedAnalysis.ok) {
          const aiResult = await enhancedAnalysis.json();
          processedTranscript.ai_analysis = aiResult.choices[0].message.content;
          console.log('Enhanced AI analysis completed');
        }

        // Generate meeting minutes summary for full transcript
        const meetingMinutesAnalysis = await fetch('https://api.openai.com/v1/chat/completions', {
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
                content: `Extract key insights from this architectural meeting transcript:

TRANSCRIPT:
${transcript.text}

${transcript.utterances && transcript.utterances.length > 0 ? 
  `\nSPEAKER INFORMATION:\n${transcript.utterances.map(u => 
    `Speaker ${u.speaker} (${Math.floor(u.start/1000/60).toString().padStart(2, '0')}:${Math.floor((u.start/1000)%60).toString().padStart(2, '0')} — ${u.text}`
  ).join('\n')}` : ''}

Provide a bulleted summary of key discussion points and insights.`
              }
            ],
            temperature: 0.3,
            max_tokens: 1500
          }),
        });

        if (meetingMinutesAnalysis.ok) {
          const minutesResult = await meetingMinutesAnalysis.json();
          processedTranscript.meeting_minutes_summary = minutesResult.choices[0].message.content;
          console.log('Meeting minutes summary generated');
        }

      } catch (aiError) {
        console.warn('AI analysis failed:', aiError);
        // Continue without AI analysis
      }
    }

    return new Response(
      JSON.stringify(processedTranscript),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Transcription error:', error);
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