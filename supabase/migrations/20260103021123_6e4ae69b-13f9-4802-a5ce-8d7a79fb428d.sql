-- =====================================================
-- RLS HARDENING MIGRATION
-- Fixes: NULL bypass, missing WITH CHECK, storage UUID validation
-- =====================================================

-- 1) Update helper functions with COALESCE wrappers
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_project_actor(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT EXISTS (
      SELECT 1
      FROM public.projects p
      LEFT JOIN public.project_members pm
        ON pm.project_id = p.id AND pm.user_id = auth.uid()
      WHERE p.id = pid
        AND (p.user_id = auth.uid() OR pm.user_id IS NOT NULL)
    )),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner_or_member(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_project_actor(project_uuid), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.get_project_id_from_job(job_uuid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM public.analysis_jobs WHERE id = job_uuid;
$$;

-- Helper to safely extract and validate UUID from storage path
CREATE OR REPLACE FUNCTION public.safe_extract_project_id(path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN (storage.foldername(path))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (storage.foldername(path))[1]::uuid
    ELSE NULL
  END;
$$;

-- 2) Fix parser_coverage_logs: Remove NULL OR bypass
-- =====================================================

DROP POLICY IF EXISTS "Users can view their project parser logs" ON public.parser_coverage_logs;
CREATE POLICY "Users can view their project parser logs"
ON public.parser_coverage_logs FOR SELECT TO authenticated
USING (project_id IS NOT NULL AND is_project_actor(project_id));

DROP POLICY IF EXISTS "Users can insert parser logs for their projects" ON public.parser_coverage_logs;
CREATE POLICY "Users can insert parser logs for their projects"
ON public.parser_coverage_logs FOR INSERT TO authenticated
WITH CHECK (project_id IS NOT NULL AND is_project_actor(project_id));

-- 3) Fix check_execution_logs: Remove NULL OR bypass
-- =====================================================

DROP POLICY IF EXISTS "Users can view their project check logs" ON public.check_execution_logs;
CREATE POLICY "Users can view their project check logs"
ON public.check_execution_logs FOR SELECT TO authenticated
USING (project_id IS NOT NULL AND is_project_actor(project_id));

DROP POLICY IF EXISTS "Users can insert check logs for their projects" ON public.check_execution_logs;
CREATE POLICY "Users can insert check logs for their projects"
ON public.check_execution_logs FOR INSERT TO authenticated
WITH CHECK (project_id IS NOT NULL AND is_project_actor(project_id));

-- 4) Fix transcript_embeddings: Add WITH CHECK to UPDATE
-- =====================================================

DROP POLICY IF EXISTS "Users can update embeddings for their design logs" ON public.transcript_embeddings;
CREATE POLICY "Users can update embeddings for their design logs"
ON public.transcript_embeddings FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM design_logs dl
    WHERE dl.id = transcript_embeddings.design_log_id
      AND is_project_actor(dl.project_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM design_logs dl
    WHERE dl.id = transcript_embeddings.design_log_id
      AND is_project_actor(dl.project_id)
  )
);

-- 5) Fix storage policies: Safe UUID extraction
-- =====================================================

-- project-files bucket
DROP POLICY IF EXISTS "Users can read project files" ON storage.objects;
CREATE POLICY "Users can read project files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);

DROP POLICY IF EXISTS "Users can upload project files" ON storage.objects;
CREATE POLICY "Users can upload project files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-files'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);

DROP POLICY IF EXISTS "Users can update project files" ON storage.objects;
CREATE POLICY "Users can update project files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
)
WITH CHECK (
  bucket_id = 'project-files'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);

DROP POLICY IF EXISTS "Users can delete project files" ON storage.objects;
CREATE POLICY "Users can delete project files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-files'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);

-- studiocheck-pages bucket
DROP POLICY IF EXISTS "Users can read studiocheck pages" ON storage.objects;
CREATE POLICY "Users can read studiocheck pages"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'studiocheck-pages'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);

DROP POLICY IF EXISTS "Users can upload studiocheck pages" ON storage.objects;
CREATE POLICY "Users can upload studiocheck pages"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'studiocheck-pages'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);

DROP POLICY IF EXISTS "Users can update studiocheck pages" ON storage.objects;
CREATE POLICY "Users can update studiocheck pages"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'studiocheck-pages'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
)
WITH CHECK (
  bucket_id = 'studiocheck-pages'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);

DROP POLICY IF EXISTS "Users can delete studiocheck pages" ON storage.objects;
CREATE POLICY "Users can delete studiocheck pages"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'studiocheck-pages'
  AND public.safe_extract_project_id(name) IS NOT NULL
  AND public.is_project_actor(public.safe_extract_project_id(name))
);