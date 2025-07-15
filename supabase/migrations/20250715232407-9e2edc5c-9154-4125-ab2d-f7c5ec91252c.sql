-- Drop and recreate the search_transcript_embeddings function to fix parameter naming
DROP FUNCTION IF EXISTS public.search_transcript_embeddings(vector, double precision, integer, uuid);

CREATE OR REPLACE FUNCTION public.search_transcript_embeddings(query_embedding vector, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 10, project_id_param uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, design_log_id uuid, content_text text, content_type text, similarity double precision, type text, date date, meeting_event text, summary text, rationale text, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    te.id,
    te.design_log_id,
    te.content_text,
    te.content_type,
    1 - (te.embedding <=> query_embedding) AS similarity,
    dl.type,
    dl.date,
    dl.meeting_event,
    dl.summary,
    dl.rationale,
    te.created_at
  FROM transcript_embeddings te
  JOIN design_logs dl ON dl.id = te.design_log_id
  WHERE (project_id_param IS NULL OR dl.project_id = project_id_param)
    AND 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;