-- A) SUPABASE MIGRATION - Harden Stage 0 RLS policies

-- 1) Add UPDATE policy for analysis_preflight_reports so upsert is permitted
CREATE POLICY "preflight_reports_update_policy"
ON public.analysis_preflight_reports
FOR UPDATE
USING (
  project_id IS NOT NULL
  AND is_project_owner_or_member(project_id)
  AND created_by = auth.uid()
)
WITH CHECK (
  project_id IS NOT NULL
  AND is_project_owner_or_member(project_id)
  AND created_by = auth.uid()
);

-- 2) Drop DELETE policy on analysis_sheet_index_v2 (we will not delete rows client-side anymore)
DROP POLICY IF EXISTS "sheet_index_v2_delete_policy" ON public.analysis_sheet_index_v2;