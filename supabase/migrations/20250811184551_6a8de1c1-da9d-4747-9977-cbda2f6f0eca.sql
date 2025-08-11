-- Backfill legacy array to object shape for specified project
UPDATE public.analysis_results ar
SET analysis_data = jsonb_build_object(
  'findings', ar.analysis_data,
  'model', 'gpt-4.1-2025-04-14',
  'minConfidenceShown', 'Medium'
)
WHERE ar.project_id = 'add9fff8-3dbe-4f46-8944-104058df82d7'
  AND jsonb_typeof(ar.analysis_data) = 'array';