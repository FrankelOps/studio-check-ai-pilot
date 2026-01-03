-- ============================================================
-- STUDIOCHECK RLS SECURITY HARDENING MIGRATION
-- Ensures authenticated users cannot access other users' data
-- ============================================================

-- ============================================================
-- 1. UPDATE HELPER FUNCTION WITH search_path SET
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_project_actor(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    LEFT JOIN public.project_members pm
      ON pm.project_id = p.id AND pm.user_id = auth.uid()
    WHERE p.id = pid
      AND (p.user_id = auth.uid() OR pm.user_id IS NOT NULL)
  );
$$;

-- Wrapper function for consistency
CREATE OR REPLACE FUNCTION public.is_project_owner_or_member(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_project_actor(project_uuid);
$$;

-- Helper to get project_id from job_id (for job-related tables)
CREATE OR REPLACE FUNCTION public.get_project_id_from_job(job_uuid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM public.analysis_jobs WHERE id = job_uuid;
$$;

-- ============================================================
-- 2. ANALYSIS_JOBS - Enable RLS and Create Policies
-- ============================================================

ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: Only project owners/members can view their jobs
CREATE POLICY "analysis_jobs_select_policy"
ON public.analysis_jobs
FOR SELECT
TO authenticated
USING (public.is_project_actor(project_id));

-- INSERT: Only project owners/members can create jobs
CREATE POLICY "analysis_jobs_insert_policy"
ON public.analysis_jobs
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_actor(project_id));

-- UPDATE: Only project owners/members can update their jobs
CREATE POLICY "analysis_jobs_update_policy"
ON public.analysis_jobs
FOR UPDATE
TO authenticated
USING (public.is_project_actor(project_id));

-- DELETE: Only project owners/members can delete their jobs
CREATE POLICY "analysis_jobs_delete_policy"
ON public.analysis_jobs
FOR DELETE
TO authenticated
USING (public.is_project_actor(project_id));

-- ============================================================
-- 3. ANALYSIS_PAGE_RESULTS - Enable RLS and Create Policies
-- ============================================================

ALTER TABLE public.analysis_page_results ENABLE ROW LEVEL SECURITY;

-- SELECT: Only if user has access to the job's project
CREATE POLICY "analysis_page_results_select_policy"
ON public.analysis_page_results
FOR SELECT
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- INSERT: Only if user has access to the job's project
CREATE POLICY "analysis_page_results_insert_policy"
ON public.analysis_page_results
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- UPDATE: Only if user has access to the job's project
CREATE POLICY "analysis_page_results_update_policy"
ON public.analysis_page_results
FOR UPDATE
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- DELETE: Only if user has access to the job's project
CREATE POLICY "analysis_page_results_delete_policy"
ON public.analysis_page_results
FOR DELETE
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- ============================================================
-- 4. ANALYSIS_PAGE_TASKS - Enable RLS and Create Policies
-- ============================================================

ALTER TABLE public.analysis_page_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: Only if user has access to the job's project
CREATE POLICY "analysis_page_tasks_select_policy"
ON public.analysis_page_tasks
FOR SELECT
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- INSERT: Only if user has access to the job's project
CREATE POLICY "analysis_page_tasks_insert_policy"
ON public.analysis_page_tasks
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- UPDATE: Only if user has access to the job's project
CREATE POLICY "analysis_page_tasks_update_policy"
ON public.analysis_page_tasks
FOR UPDATE
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- DELETE: Only if user has access to the job's project
CREATE POLICY "analysis_page_tasks_delete_policy"
ON public.analysis_page_tasks
FOR DELETE
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- ============================================================
-- 5. PAGE_ASSETS - Enable RLS and Create Policies
-- ============================================================

ALTER TABLE public.page_assets ENABLE ROW LEVEL SECURITY;

-- SELECT: Only if user has access to the job's project
CREATE POLICY "page_assets_select_policy"
ON public.page_assets
FOR SELECT
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- INSERT: Only if user has access to the job's project
CREATE POLICY "page_assets_insert_policy"
ON public.page_assets
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- UPDATE: Only if user has access to the job's project
CREATE POLICY "page_assets_update_policy"
ON public.page_assets
FOR UPDATE
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- DELETE: Only if user has access to the job's project
CREATE POLICY "page_assets_delete_policy"
ON public.page_assets
FOR DELETE
TO authenticated
USING (public.is_project_actor(public.get_project_id_from_job(job_id)));

-- ============================================================
-- 6. PARSER_COVERAGE_LOGS - Enable RLS and Create Policies
-- ============================================================

ALTER TABLE public.parser_coverage_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: Only if user has access to the project
CREATE POLICY "parser_coverage_logs_select_policy"
ON public.parser_coverage_logs
FOR SELECT
TO authenticated
USING (project_id IS NULL OR public.is_project_actor(project_id));

-- INSERT: Only if user has access to the project
CREATE POLICY "parser_coverage_logs_insert_policy"
ON public.parser_coverage_logs
FOR INSERT
TO authenticated
WITH CHECK (project_id IS NULL OR public.is_project_actor(project_id));

-- DELETE: Only if user has access to the project
CREATE POLICY "parser_coverage_logs_delete_policy"
ON public.parser_coverage_logs
FOR DELETE
TO authenticated
USING (project_id IS NULL OR public.is_project_actor(project_id));

-- ============================================================
-- 7. CHECK_EXECUTION_LOGS - Enable RLS and Add Missing Policies
-- ============================================================

ALTER TABLE public.check_execution_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view logs for their projects or their own user_id
CREATE POLICY "check_execution_logs_select_policy"
ON public.check_execution_logs
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR (project_id IS NOT NULL AND public.is_project_actor(project_id))
);

-- INSERT: Users can create logs for their projects or themselves
CREATE POLICY "check_execution_logs_insert_policy"
ON public.check_execution_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  OR (project_id IS NOT NULL AND public.is_project_actor(project_id))
);

-- ============================================================
-- 8. ANALYSIS_RESULTS - Add Missing Write Policies
-- ============================================================

-- INSERT: Allow inserting analysis results for own projects
CREATE POLICY "analysis_results_insert_policy"
ON public.analysis_results
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_actor(project_id));

-- UPDATE: Allow updating analysis results for own projects
CREATE POLICY "analysis_results_update_policy"
ON public.analysis_results
FOR UPDATE
TO authenticated
USING (public.is_project_actor(project_id));

-- DELETE: Allow deleting analysis results for own projects
CREATE POLICY "analysis_results_delete_policy"
ON public.analysis_results
FOR DELETE
TO authenticated
USING (public.is_project_actor(project_id));

-- ============================================================
-- 9. NOTIFICATIONS - Add Missing INSERT/DELETE Policies
-- ============================================================

-- INSERT: System can create notifications for any user (service role)
-- But authenticated users can only insert for themselves
CREATE POLICY "notifications_insert_policy"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- DELETE: Users can delete their own notifications
CREATE POLICY "notifications_delete_policy"
ON public.notifications
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- 10. TRANSCRIPT_EMBEDDINGS - Add Missing Write Policies
-- ============================================================

-- INSERT: Allow inserting embeddings for design logs in own projects
CREATE POLICY "transcript_embeddings_insert_policy"
ON public.transcript_embeddings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.design_logs dl
    JOIN public.projects p ON p.id = dl.project_id
    WHERE dl.id = transcript_embeddings.design_log_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
  )
);

-- UPDATE: Allow updating embeddings for design logs in own projects
CREATE POLICY "transcript_embeddings_update_policy"
ON public.transcript_embeddings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.design_logs dl
    JOIN public.projects p ON p.id = dl.project_id
    WHERE dl.id = transcript_embeddings.design_log_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
  )
);

-- DELETE: Allow deleting embeddings for design logs in own projects
CREATE POLICY "transcript_embeddings_delete_policy"
ON public.transcript_embeddings
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.design_logs dl
    JOIN public.projects p ON p.id = dl.project_id
    WHERE dl.id = transcript_embeddings.design_log_id
      AND (p.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
  )
);

-- ============================================================
-- 11. STORAGE POLICIES - Secure Storage Buckets
-- ============================================================

-- First, ensure buckets are not public (project-files is already private)
-- Add RLS policies for storage.objects

-- Policy: Users can upload to project-files if they have project access
-- Path convention: {project_id}/{file_name}
CREATE POLICY "project_files_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND public.is_project_actor((storage.foldername(name))[1]::uuid)
);

-- Policy: Users can view files from project-files if they have project access
CREATE POLICY "project_files_select_policy"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.is_project_actor((storage.foldername(name))[1]::uuid)
);

-- Policy: Users can update files in project-files if they have project access
CREATE POLICY "project_files_update_policy"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.is_project_actor((storage.foldername(name))[1]::uuid)
);

-- Policy: Users can delete files from project-files if they have project access
CREATE POLICY "project_files_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.is_project_actor((storage.foldername(name))[1]::uuid)
);

-- Policies for studiocheck-pages bucket (analysis page images)
-- Path convention: {job_id}/{page_number}.png
-- We need to check job access through the job's project

CREATE POLICY "studiocheck_pages_insert_policy"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'studiocheck-pages'
  AND public.is_project_actor(public.get_project_id_from_job((storage.foldername(name))[1]::uuid))
);

CREATE POLICY "studiocheck_pages_select_policy"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'studiocheck-pages'
  AND public.is_project_actor(public.get_project_id_from_job((storage.foldername(name))[1]::uuid))
);

CREATE POLICY "studiocheck_pages_update_policy"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'studiocheck-pages'
  AND public.is_project_actor(public.get_project_id_from_job((storage.foldername(name))[1]::uuid))
);

CREATE POLICY "studiocheck_pages_delete_policy"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'studiocheck-pages'
  AND public.is_project_actor(public.get_project_id_from_job((storage.foldername(name))[1]::uuid))
);