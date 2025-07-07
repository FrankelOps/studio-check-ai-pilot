-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create transcript_embeddings table for semantic search
CREATE TABLE public.transcript_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  design_log_id UUID NOT NULL,
  content_text TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'transcript', -- 'transcript', 'summary', 'rationale'
  embedding vector(1536), -- OpenAI text-embedding-3-small dimensions
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  FOREIGN KEY (design_log_id) REFERENCES public.design_logs(id) ON DELETE CASCADE
);

-- Enable Row Level Security
ALTER TABLE public.transcript_embeddings ENABLE ROW LEVEL SECURITY;

-- Create policies for transcript_embeddings
CREATE POLICY "Users can view embeddings from their projects" 
ON public.transcript_embeddings 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM design_logs dl
  JOIN projects p ON p.id = dl.project_id
  WHERE dl.id = transcript_embeddings.design_log_id 
  AND (p.user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM project_members pm 
    WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
  ))
));

-- Create index for faster similarity search
CREATE INDEX transcript_embeddings_embedding_idx ON public.transcript_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index for faster lookups
CREATE INDEX transcript_embeddings_design_log_id_idx ON public.transcript_embeddings(design_log_id);
CREATE INDEX transcript_embeddings_content_type_idx ON public.transcript_embeddings(content_type);

-- Add trigger for updated_at
CREATE TRIGGER update_transcript_embeddings_updated_at
BEFORE UPDATE ON public.transcript_embeddings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();