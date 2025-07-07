-- Create design_logs table for storing extracted decisions, requirements, and questions
CREATE TABLE public.design_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  file_id UUID,
  type TEXT NOT NULL CHECK (type IN ('Owner Requirement', 'Design Decision', 'Open Question')),
  date DATE,
  meeting_event TEXT,
  summary TEXT NOT NULL,
  rationale TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.design_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for design_logs
CREATE POLICY "Users can view design logs from their projects" 
ON public.design_logs 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM projects 
  WHERE projects.id = design_logs.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can insert design logs to their projects" 
ON public.design_logs 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM projects 
  WHERE projects.id = design_logs.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update design logs from their projects" 
ON public.design_logs 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM projects 
  WHERE projects.id = design_logs.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can delete design logs from their projects" 
ON public.design_logs 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM projects 
  WHERE projects.id = design_logs.project_id 
  AND projects.user_id = auth.uid()
));

-- Add foreign key relationships
ALTER TABLE public.design_logs 
ADD CONSTRAINT design_logs_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.design_logs 
ADD CONSTRAINT design_logs_file_id_fkey 
FOREIGN KEY (file_id) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_design_logs_updated_at
  BEFORE UPDATE ON public.design_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_design_logs_project_id ON public.design_logs(project_id);
CREATE INDEX idx_design_logs_type ON public.design_logs(type);
CREATE INDEX idx_design_logs_date ON public.design_logs(date);
CREATE INDEX idx_design_logs_status ON public.design_logs(status);
CREATE INDEX idx_design_logs_tags ON public.design_logs USING GIN(tags);