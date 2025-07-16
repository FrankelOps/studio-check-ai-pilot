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
    "text": "That works, as long as we do not lose any parking."
  }
]'::jsonb
WHERE transcript_text IS NOT NULL 
AND LENGTH(TRIM(transcript_text)) > 0
AND id = (
  SELECT id FROM public.meeting_minutes 
  WHERE transcript_text IS NOT NULL 
  AND LENGTH(TRIM(transcript_text)) > 0 
  LIMIT 1
);