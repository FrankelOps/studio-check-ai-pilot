-- Create meeting_minutes table for storing AI-generated meeting summaries
CREATE TABLE public.meeting_minutes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES uploaded_files(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  meeting_title TEXT NOT NULL,
  summary_outline TEXT NOT NULL,
  transcript_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies allowing both project owners and members
CREATE POLICY "Users can view meeting minutes from their projects or member projects" 
ON public.meeting_minutes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = meeting_minutes.project_id 
    AND (
      projects.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM project_members 
        WHERE project_members.project_id = projects.id 
        AND project_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can create meeting minutes in their projects or member projects" 
ON public.meeting_minutes 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = meeting_minutes.project_id 
    AND (
      projects.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM project_members 
        WHERE project_members.project_id = projects.id 
        AND project_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can update meeting minutes in their projects or member projects" 
ON public.meeting_minutes 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = meeting_minutes.project_id 
    AND (
      projects.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM project_members 
        WHERE project_members.project_id = projects.id 
        AND project_members.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Users can delete meeting minutes from their projects or member projects" 
ON public.meeting_minutes 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = meeting_minutes.project_id 
    AND (
      projects.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM project_members 
        WHERE project_members.project_id = projects.id 
        AND project_members.user_id = auth.uid()
      )
    )
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_meeting_minutes_updated_at
BEFORE UPDATE ON public.meeting_minutes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_meeting_minutes_project_id ON public.meeting_minutes(project_id);
CREATE INDEX idx_meeting_minutes_file_id ON public.meeting_minutes(file_id);
CREATE INDEX idx_meeting_minutes_meeting_date ON public.meeting_minutes(meeting_date);