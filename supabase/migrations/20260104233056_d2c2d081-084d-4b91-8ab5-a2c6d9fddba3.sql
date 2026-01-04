-- Add crop evidence columns to analysis_sheet_index_v2
ALTER TABLE public.analysis_sheet_index_v2 
ADD COLUMN IF NOT EXISTS crop_asset_path text,
ADD COLUMN IF NOT EXISTS crop_valid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS crop_reason text DEFAULT '';