-- Sheet Index v2.5 (retry): crop strategy + attempt count + extraction_source includes fail_crop

ALTER TABLE public.analysis_sheet_index_v2
  ADD COLUMN IF NOT EXISTS crop_strategy TEXT;

ALTER TABLE public.analysis_sheet_index_v2
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER;

ALTER TABLE public.analysis_sheet_index_v2
  ALTER COLUMN crop_strategy SET DEFAULT 'unknown';

ALTER TABLE public.analysis_sheet_index_v2
  ALTER COLUMN attempt_count SET DEFAULT 0;

UPDATE public.analysis_sheet_index_v2
SET crop_strategy = COALESCE(crop_strategy, 'unknown'),
    attempt_count = COALESCE(attempt_count, 0);

-- Replace extraction_source constraint safely
ALTER TABLE public.analysis_sheet_index_v2
  DROP CONSTRAINT IF EXISTS analysis_sheet_index_v2_extraction_source_check;

ALTER TABLE public.analysis_sheet_index_v2
  ADD CONSTRAINT analysis_sheet_index_v2_extraction_source_check
  CHECK (extraction_source IN ('vector_text','vision_titleblock','template_fields','unknown','fail_crop'));
