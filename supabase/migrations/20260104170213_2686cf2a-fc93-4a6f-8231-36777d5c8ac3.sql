-- Add extraction_source column to analysis_sheet_index_v2
ALTER TABLE public.analysis_sheet_index_v2 
ADD COLUMN IF NOT EXISTS extraction_source text DEFAULT 'unknown';

-- Add comment for the column
COMMENT ON COLUMN public.analysis_sheet_index_v2.extraction_source IS 'Source of extraction: vector_text, vision_titleblock, or unknown';