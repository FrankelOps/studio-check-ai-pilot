-- =====================================================
-- RLS HARDENING MIGRATION - FOLLOW-UP
-- Fixes: NULL bypass in parser_coverage_logs, missing WITH CHECK,
--        check_execution_logs INSERT tightening
-- =====================================================

-- 1) parser_coverage_logs: Remove NULL bypass from legacy policies
-- =====================================================

DROP POLICY IF EXISTS "parser_coverage_logs_delete_policy" ON public.parser_coverage_logs;
CREATE POLICY "parser_coverage_logs_delete_policy"
ON public.parser_coverage_logs FOR DELETE TO authenticated
USING (project_id IS NOT NULL AND is_project_actor(project_id));

DROP POLICY IF EXISTS "parser_coverage_logs_insert_policy" ON public.parser_coverage_logs;
CREATE POLICY "parser_coverage_logs_insert_policy"
ON public.parser_coverage_logs FOR INSERT TO authenticated
WITH CHECK (project_id IS NOT NULL AND is_project_actor(project_id));

DROP POLICY IF EXISTS "parser_coverage_logs_select_policy" ON public.parser_coverage_logs;
CREATE POLICY "parser_coverage_logs_select_policy"
ON public.parser_coverage_logs FOR SELECT TO authenticated
USING (project_id IS NOT NULL AND is_project_actor(project_id));

-- 2) Add WITH CHECK to UPDATE policies
-- =====================================================

-- analysis_jobs
DROP POLICY IF EXISTS "analysis_jobs_update_policy" ON public.analysis_jobs;
CREATE POLICY "analysis_jobs_update_policy"
ON public.analysis_jobs FOR UPDATE TO authenticated
USING (is_project_actor(project_id))
WITH CHECK (is_project_actor(project_id));

-- analysis_page_results
DROP POLICY IF EXISTS "analysis_page_results_update_policy" ON public.analysis_page_results;
CREATE POLICY "analysis_page_results_update_policy"
ON public.analysis_page_results FOR UPDATE TO authenticated
USING (is_project_actor(get_project_id_from_job(job_id)))
WITH CHECK (is_project_actor(get_project_id_from_job(job_id)));

-- analysis_page_tasks
DROP POLICY IF EXISTS "analysis_page_tasks_update_policy" ON public.analysis_page_tasks;
CREATE POLICY "analysis_page_tasks_update_policy"
ON public.analysis_page_tasks FOR UPDATE TO authenticated
USING (is_project_actor(get_project_id_from_job(job_id)))
WITH CHECK (is_project_actor(get_project_id_from_job(job_id)));

-- page_assets
DROP POLICY IF EXISTS "page_assets_update_policy" ON public.page_assets;
CREATE POLICY "page_assets_update_policy"
ON public.page_assets FOR UPDATE TO authenticated
USING (is_project_actor(get_project_id_from_job(job_id)))
WITH CHECK (is_project_actor(get_project_id_from_job(job_id)));

-- analysis_results
DROP POLICY IF EXISTS "analysis_results_update_policy" ON public.analysis_results;
CREATE POLICY "analysis_results_update_policy"
ON public.analysis_results FOR UPDATE TO authenticated
USING (is_project_actor(project_id))
WITH CHECK (is_project_actor(project_id));

-- 3) check_execution_logs: Tighten INSERT to require user_id = auth.uid() ALWAYS
-- =====================================================

DROP POLICY IF EXISTS "check_execution_logs_insert_policy" ON public.check_execution_logs;
CREATE POLICY "check_execution_logs_insert_policy"
ON public.check_execution_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (project_id IS NULL OR is_project_actor(project_id))
);

-- Also tighten the other INSERT policy
DROP POLICY IF EXISTS "Users can insert check logs for their projects" ON public.check_execution_logs;
CREATE POLICY "Users can insert check logs for their projects"
ON public.check_execution_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND project_id IS NOT NULL 
  AND is_project_actor(project_id)
);

-- Tighten SELECT to require user_id match OR project actor
DROP POLICY IF EXISTS "check_execution_logs_select_policy" ON public.check_execution_logs;
CREATE POLICY "check_execution_logs_select_policy"
ON public.check_execution_logs FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (project_id IS NOT NULL AND is_project_actor(project_id))
);