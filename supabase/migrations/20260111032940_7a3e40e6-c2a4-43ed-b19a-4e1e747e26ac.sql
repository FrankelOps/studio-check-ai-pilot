-- ============================================================
-- P1 ARCHITECTURAL COMPLETENESS: NEW TABLES
-- Creates 5 new tables for extraction facts and issue storage
-- ============================================================

-- 1) analysis_issues_v1 - Dedicated IssueObjectV1 storage
CREATE TABLE public.analysis_issues_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  pattern_id text NOT NULL,
  pattern_version text NOT NULL,
  issue_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add constraint to prevent forbidden page fields in issue_json
-- Note: We enforce this in code as well; this is a safety net
COMMENT ON TABLE public.analysis_issues_v1 IS 'Dedicated storage for IssueObjectV1 records. issue_json must not contain page/page_number fields at any depth.';

-- Enable RLS
ALTER TABLE public.analysis_issues_v1 ENABLE ROW LEVEL SECURITY;

-- RLS policies for analysis_issues_v1
CREATE POLICY "Users can view issues for their projects"
  ON public.analysis_issues_v1
  FOR SELECT
  USING (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE POLICY "Users can insert issues for their projects"
  ON public.analysis_issues_v1
  FOR INSERT
  WITH CHECK (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE POLICY "Users can update issues for their projects"
  ON public.analysis_issues_v1
  FOR UPDATE
  USING (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

-- No DELETE policy - issues should be archived, not deleted

-- Indexes
CREATE INDEX idx_analysis_issues_v1_job ON public.analysis_issues_v1(job_id);
CREATE INDEX idx_analysis_issues_v1_pattern ON public.analysis_issues_v1(job_id, pattern_id);


-- 2) analysis_references_v1 - Extracted reference callouts (plans → targets)
CREATE TABLE public.analysis_references_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  source_index integer NOT NULL,
  calling_sheet_number text NOT NULL,
  ref_type text NOT NULL CHECK (ref_type IN ('detail', 'section', 'elevation')),
  ref_id text NOT NULL,
  target_sheet_number text NOT NULL,
  bbox jsonb NOT NULL,
  snippet_text text NOT NULL,
  extraction_source text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_asset_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_references_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view references for their projects"
  ON public.analysis_references_v1
  FOR SELECT
  USING (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE POLICY "Users can insert references for their projects"
  ON public.analysis_references_v1
  FOR INSERT
  WITH CHECK (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE INDEX idx_references_job_target ON public.analysis_references_v1(job_id, target_sheet_number);
CREATE INDEX idx_references_job_calling ON public.analysis_references_v1(job_id, calling_sheet_number);


-- 3) analysis_target_labels_v1 - Labels present on target sheets
CREATE TABLE public.analysis_target_labels_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  source_index integer NOT NULL,
  target_sheet_number text NOT NULL,
  label_type text NOT NULL CHECK (label_type IN ('detail', 'section', 'elevation')),
  label_id text NOT NULL,
  bbox jsonb NOT NULL,
  snippet_text text NOT NULL,
  extraction_source text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_asset_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_target_labels_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view target labels for their projects"
  ON public.analysis_target_labels_v1
  FOR SELECT
  USING (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE POLICY "Users can insert target labels for their projects"
  ON public.analysis_target_labels_v1
  FOR INSERT
  WITH CHECK (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE INDEX idx_target_labels_job_sheet ON public.analysis_target_labels_v1(job_id, target_sheet_number, label_type);


-- 4) analysis_door_schedule_items_v1 - Door IDs from schedules
CREATE TABLE public.analysis_door_schedule_items_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  source_index integer NOT NULL,
  schedule_sheet_number text NOT NULL,
  door_id text NOT NULL,
  row_bbox jsonb NOT NULL,
  snippet_text text NOT NULL,
  extraction_source text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_asset_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_door_schedule_items_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view door schedule items for their projects"
  ON public.analysis_door_schedule_items_v1
  FOR SELECT
  USING (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE POLICY "Users can insert door schedule items for their projects"
  ON public.analysis_door_schedule_items_v1
  FOR INSERT
  WITH CHECK (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE INDEX idx_door_schedule_job_door ON public.analysis_door_schedule_items_v1(job_id, door_id);


-- 5) analysis_door_tags_v1 - Door tags from plans/elevations
CREATE TABLE public.analysis_door_tags_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  source_index integer NOT NULL,
  sheet_number text NOT NULL,
  door_id text NOT NULL,
  bbox jsonb NOT NULL,
  snippet_text text NOT NULL,
  extraction_source text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_asset_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_door_tags_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view door tags for their projects"
  ON public.analysis_door_tags_v1
  FOR SELECT
  USING (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE POLICY "Users can insert door tags for their projects"
  ON public.analysis_door_tags_v1
  FOR INSERT
  WITH CHECK (project_id IS NOT NULL AND public.is_project_owner_or_member(project_id));

CREATE INDEX idx_door_tags_job_door ON public.analysis_door_tags_v1(job_id, door_id);
CREATE INDEX idx_door_tags_job_sheet ON public.analysis_door_tags_v1(job_id, sheet_number);