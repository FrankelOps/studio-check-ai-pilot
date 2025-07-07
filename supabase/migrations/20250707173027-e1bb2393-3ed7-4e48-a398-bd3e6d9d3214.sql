-- Create function for semantic similarity search
CREATE OR REPLACE FUNCTION search_transcript_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  design_log_id uuid,
  content_text text,
  content_type text,
  similarity float,
  type text,
  date date,
  meeting_event text,
  summary text,
  rationale text,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
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
  WHERE (project_id IS NULL OR dl.project_id = search_transcript_embeddings.project_id)
    AND 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;