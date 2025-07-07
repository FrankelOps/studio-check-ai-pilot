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
    const { projectId, designLogId, forceRegenerate = false } = await req.json();
    console.log('Generate embeddings request:', { projectId, designLogId, forceRegenerate });

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // If designLogId is provided, process only that entry
    // If projectId is provided, process all entries in the project
    // If forceRegenerate is true, regenerate embeddings even if they exist

    let designLogsQuery = supabase
      .from('design_logs')
      .select('id, summary, rationale, type, project_id');

    if (designLogId) {
      designLogsQuery = designLogsQuery.eq('id', designLogId);
    } else if (projectId) {
      designLogsQuery = designLogsQuery.eq('project_id', projectId);
    } else {
      // Process all design logs if no specific filter
      designLogsQuery = designLogsQuery.limit(100); // Process in batches
    }

    const { data: designLogs, error: fetchError } = await designLogsQuery;

    if (fetchError) {
      throw new Error(`Failed to fetch design logs: ${fetchError.message}`);
    }

    if (!designLogs || designLogs.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No design logs found to process',
        processed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let processed = 0;
    let skipped = 0;
    const batchSize = 10; // Process in batches to avoid rate limits

    for (let i = 0; i < designLogs.length; i += batchSize) {
      const batch = designLogs.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (log) => {
        try {
          // Check if embeddings already exist
          if (!forceRegenerate) {
            const { data: existing } = await supabase
              .from('transcript_embeddings')
              .select('id')
              .eq('design_log_id', log.id)
              .limit(1);

            if (existing && existing.length > 0) {
              skipped++;
              return;
            }
          }

          // Generate embeddings for summary
          await generateAndStoreEmbedding(supabase, log.id, log.summary, 'summary');
          
          // Generate embeddings for rationale if it exists
          if (log.rationale && log.rationale.trim()) {
            await generateAndStoreEmbedding(supabase, log.id, log.rationale, 'rationale');
          }

          processed++;
          console.log(`Processed embeddings for design log ${log.id}`);

        } catch (error) {
          console.error(`Error processing design log ${log.id}:`, error);
        }
      }));

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < designLogs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Embedding generation complete: ${processed} processed, ${skipped} skipped`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed,
      skipped,
      total: designLogs.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-embeddings function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateAndStoreEmbedding(
  supabase: any, 
  designLogId: string, 
  content: string, 
  contentType: string
) {
  // Generate embedding using OpenAI
  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: content,
    }),
  });

  if (!embeddingResponse.ok) {
    throw new Error(`Failed to generate embedding: ${embeddingResponse.status}`);
  }

  const embeddingData = await embeddingResponse.json();
  const embedding = embeddingData.data[0].embedding;

  // Store embedding in database
  const { error: insertError } = await supabase
    .from('transcript_embeddings')
    .upsert({
      design_log_id: designLogId,
      content_text: content,
      content_type: contentType,
      embedding: embedding
    }, {
      onConflict: 'design_log_id,content_type'
    });

  if (insertError) {
    throw new Error(`Failed to store embedding: ${insertError.message}`);
  }
}