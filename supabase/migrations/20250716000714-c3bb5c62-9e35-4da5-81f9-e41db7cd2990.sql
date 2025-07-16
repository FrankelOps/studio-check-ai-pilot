-- Add has_transcript boolean and speaker segments to meeting_minutes
ALTER TABLE public.meeting_minutes 
ADD COLUMN has_transcript boolean DEFAULT false,
ADD COLUMN speaker_segments jsonb;

-- Add speaker/timestamp columns to transcript_embeddings for future use
ALTER TABLE public.transcript_embeddings
ADD COLUMN speaker_name text,
ADD COLUMN start_timestamp numeric,
ADD COLUMN end_timestamp numeric;

-- Create trigger function to automatically update has_transcript
CREATE OR REPLACE FUNCTION update_has_transcript()
RETURNS TRIGGER AS $$
BEGIN
  NEW.has_transcript = (NEW.transcript_text IS NOT NULL AND LENGTH(TRIM(NEW.transcript_text)) > 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update has_transcript on insert/update
CREATE TRIGGER trigger_update_has_transcript
  BEFORE INSERT OR UPDATE ON public.meeting_minutes
  FOR EACH ROW
  EXECUTE FUNCTION update_has_transcript();

-- Update existing records to set has_transcript correctly
UPDATE public.meeting_minutes 
SET has_transcript = (transcript_text IS NOT NULL AND LENGTH(TRIM(transcript_text)) > 0);

-- Insert sample speaker segments data for testing
UPDATE public.meeting_minutes 
SET speaker_segments = '[
  {
    "speaker": "Architect",
    "start_time": "00:00:00",
    "end_time": "00:02:15",
    "text": "We decided to shift the entry ramp for better ADA compliance."
  },
  {
    "speaker": "Owner", 
    "start_time": "00:02:16",
    "end_time": "00:04:00",
    "text": "That works, as long as we don''t lose any parking."
  }
]'::jsonb
WHERE transcript_text IS NOT NULL 
AND LENGTH(TRIM(transcript_text)) > 0
LIMIT 1;