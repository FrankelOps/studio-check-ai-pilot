-- ============================================================
-- STAGE 0: PREFLIGHT REPORTS + SHEET INDEX V2 TABLES
-- ============================================================

-- 1) analysis_preflight_reports: stores preflight readiness status
CREATE TABLE public.analysis_preflight_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  job_id uuid NOT NULL UNIQUE REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PASS', 'PASS_WITH_LIMITATIONS', 'FAIL')),
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analysis_preflight_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analysis_preflight_reports
CREATE POLICY "preflight_reports_select_policy"
  ON public.analysis_preflight_reports
  FOR SELECT
  USING (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

CREATE POLICY "preflight_reports_insert_policy"
  ON public.analysis_preflight_reports
  FOR INSERT
  WITH CHECK (
    project_id IS NOT NULL 
    AND is_project_owner_or_member(project_id) 
    AND created_by = auth.uid()
  );

-- No UPDATE/DELETE allowed for immutability

-- 2) analysis_sheet_index_v2: stores sheet index entries
CREATE TABLE public.analysis_sheet_index_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  source_index int NOT NULL,
  sheet_number text,
  sheet_title text,
  discipline text,
  sheet_kind text CHECK (sheet_kind IN ('plan', 'rcp', 'schedule', 'detail', 'legend', 'general', 'unknown')),
  confidence numeric NOT NULL DEFAULT 0,
  title_block_asset_path text,
  sheet_render_asset_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, source_index)
);

-- Enable RLS
ALTER TABLE public.analysis_sheet_index_v2 ENABLE ROW LEVEL SECURITY;

-- RLS Policies for analysis_sheet_index_v2
CREATE POLICY "sheet_index_v2_select_policy"
  ON public.analysis_sheet_index_v2
  FOR SELECT
  USING (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

CREATE POLICY "sheet_index_v2_insert_policy"
  ON public.analysis_sheet_index_v2
  FOR INSERT
  WITH CHECK (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

-- Allow upsert/replace for idempotency during processing
CREATE POLICY "sheet_index_v2_update_policy"
  ON public.analysis_sheet_index_v2
  FOR UPDATE
  USING (project_id IS NOT NULL AND is_project_owner_or_member(project_id))
  WITH CHECK (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

CREATE POLICY "sheet_index_v2_delete_policy"
  ON public.analysis_sheet_index_v2
  FOR DELETE
  USING (project_id IS NOT NULL AND is_project_owner_or_member(project_id));

-- Create indexes for faster lookups
CREATE INDEX idx_preflight_reports_job_id ON public.analysis_preflight_reports(job_id);
CREATE INDEX idx_preflight_reports_project_id ON public.analysis_preflight_reports(project_id);
CREATE INDEX idx_sheet_index_v2_job_id ON public.analysis_sheet_index_v2(job_id);
CREATE INDEX idx_sheet_index_v2_project_id ON public.analysis_sheet_index_v2(project_id);