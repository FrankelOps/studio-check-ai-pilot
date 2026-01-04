-- ============================================================
-- SHEET INDEX v2.3: Title Block Template Calibration
-- ============================================================

-- 1) Create title block templates table for calibration data
CREATE TABLE IF NOT EXISTS public.analysis_titleblock_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  discipline text NOT NULL,
  template jsonb NOT NULL DEFAULT '{}',
  calibration_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, discipline)
);

-- 2) Enable RLS
ALTER TABLE public.analysis_titleblock_templates ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies (same pattern as other analysis tables)
CREATE POLICY "titleblock_templates_select_policy"
  ON public.analysis_titleblock_templates
  FOR SELECT
  USING (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

CREATE POLICY "titleblock_templates_insert_policy"
  ON public.analysis_titleblock_templates
  FOR INSERT
  WITH CHECK (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

CREATE POLICY "titleblock_templates_update_policy"
  ON public.analysis_titleblock_templates
  FOR UPDATE
  USING (project_id IS NOT NULL AND is_project_owner_or_member(project_id))
  WITH CHECK (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

-- No delete policy (per spec)

-- 4) Update extraction_source check constraint to include 'template_fields'
-- First drop existing if any, then add new one
ALTER TABLE public.analysis_sheet_index_v2 
  DROP CONSTRAINT IF EXISTS analysis_sheet_index_v2_extraction_source_check;

ALTER TABLE public.analysis_sheet_index_v2
  ADD CONSTRAINT analysis_sheet_index_v2_extraction_source_check
  CHECK (extraction_source IN ('vector_text', 'vision_titleblock', 'template_fields', 'unknown'));

-- 5) Ensure extraction_source has proper default
ALTER TABLE public.analysis_sheet_index_v2
  ALTER COLUMN extraction_source SET DEFAULT 'unknown';

-- 6) Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_titleblock_templates_job_discipline 
  ON public.analysis_titleblock_templates(job_id, discipline);