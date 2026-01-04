-- Add extraction_notes column for storing fallback reasons
ALTER TABLE public.analysis_sheet_index_v2 
ADD COLUMN IF NOT EXISTS extraction_notes jsonb NOT NULL DEFAULT '{}'::jsonb;