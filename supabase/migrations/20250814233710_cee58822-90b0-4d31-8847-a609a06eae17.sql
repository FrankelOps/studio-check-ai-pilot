-- Enable function for UUIDs (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Job master
CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  file_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|processing|complete|failed|canceled|partial
  total_pages int NOT NULL DEFAULT 0,
  processed_pages int NOT NULL DEFAULT 0,
  pass int NOT NULL DEFAULT 1, -- 1=triage, 2=deep
  model text DEFAULT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz DEFAULT NULL,
  error text DEFAULT NULL
);

-- 2) Per-page work items (tasks)
CREATE TABLE IF NOT EXISTS public.analysis_page_tasks (
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  page int NOT NULL,
  state text NOT NULL DEFAULT 'queued', -- queued|processing|done|error
  retries int NOT NULL DEFAULT 0,
  last_error text DEFAULT NULL,
  locked_by text DEFAULT NULL,
  locked_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (job_id, page)
);

-- 3) Per-page results (ALWAYS store an array of findings)
CREATE TABLE IF NOT EXISTS public.analysis_page_results (
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  page int NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text DEFAULT NULL,
  duration_ms int DEFAULT NULL,
  status text NOT NULL DEFAULT 'done', -- done|empty|error
  error text DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (job_id, page)
);

-- 4) Cached assets per page (image + OCR)
CREATE TABLE IF NOT EXISTS public.page_assets (
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  page int NOT NULL,
  image_url text DEFAULT NULL,
  ocr_url text DEFAULT NULL,
  dpi int DEFAULT NULL,
  width int DEFAULT NULL,
  height int DEFAULT NULL,
  hash text DEFAULT NULL,
  expires_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (job_id, page)
);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tasks_updated_at'
  ) THEN
    CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON public.analysis_page_tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assets_updated_at'
  ) THEN
    CREATE TRIGGER trg_assets_updated_at
    BEFORE UPDATE ON public.page_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON public.analysis_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON public.analysis_page_tasks(job_id, state, page);
CREATE INDEX IF NOT EXISTS idx_results_job ON public.analysis_page_results(job_id, page);

-- RLS off for service role access (keep simple; we can harden later)
ALTER TABLE public.analysis_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_page_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_page_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_assets DISABLE ROW LEVEL SECURITY;

-- Ensure a private storage bucket 'studiocheck-pages' exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('studiocheck-pages', 'studiocheck-pages', false)
ON CONFLICT (id) DO NOTHING;