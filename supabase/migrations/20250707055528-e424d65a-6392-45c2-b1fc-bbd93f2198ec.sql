-- Create action items table
CREATE TABLE public.action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES design_logs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES auth.users(id),
  assigned_to_name TEXT,
  due_date DATE,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')) DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for action items
CREATE POLICY "Users can view action items from their projects or member projects" 
ON public.action_items FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = action_items.project_id 
    AND projects.user_id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_members.project_id = action_items.project_id 
    AND project_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create action items in their projects" 
ON public.action_items FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = action_items.project_id 
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update action items in their projects" 
ON public.action_items FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = action_items.project_id 
    AND projects.user_id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_members.project_id = action_items.project_id 
    AND project_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete action items from their projects" 
ON public.action_items FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = action_items.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_action_items_updated_at
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();