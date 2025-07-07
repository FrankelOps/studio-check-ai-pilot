-- Create user roles enum and tables
CREATE TYPE public.user_role AS ENUM ('architect', 'owner', 'admin');

-- Create profiles table for user information and roles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  role user_role DEFAULT 'architect',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- RLS policies for profiles
CREATE POLICY "Users can view all profiles" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Create decision feedback table (combined comments/approvals)
CREATE TABLE public.decision_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES design_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('comment', 'approval')),
  content TEXT,
  status TEXT CHECK (status IN ('approved', 'rejected', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on decision feedback
ALTER TABLE public.decision_feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies for decision feedback
CREATE POLICY "Users can view feedback from their projects" 
ON public.decision_feedback FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM design_logs dl
  JOIN projects p ON p.id = dl.project_id
  WHERE dl.id = decision_feedback.decision_id 
  AND p.user_id = auth.uid()
));

CREATE POLICY "Users can create feedback on their project decisions" 
ON public.decision_feedback FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM design_logs dl
  JOIN projects p ON p.id = dl.project_id
  WHERE dl.id = decision_feedback.decision_id 
  AND p.user_id = auth.uid()
));

CREATE POLICY "Users can update their own feedback" 
ON public.decision_feedback FOR UPDATE 
USING (auth.uid() = user_id);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('decision_feedback', 'action_item', 'system')),
  related_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications" 
ON public.notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" 
ON public.notifications FOR UPDATE 
USING (auth.uid() = user_id);

-- Create project members table for collaboration
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role DEFAULT 'owner',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Enable RLS on project members
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for project members
CREATE POLICY "Project owners can manage members" 
ON public.project_members FOR ALL 
USING (EXISTS (
  SELECT 1 FROM projects 
  WHERE projects.id = project_members.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Members can view their project memberships" 
ON public.project_members FOR SELECT 
USING (auth.uid() = user_id);

-- Update design_logs policies to include project members
DROP POLICY IF EXISTS "Users can view design logs from their projects" ON design_logs;
CREATE POLICY "Users can view design logs from their projects or member projects" 
ON public.design_logs FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = design_logs.project_id 
    AND projects.user_id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 FROM project_members 
    WHERE project_members.project_id = design_logs.project_id 
    AND project_members.user_id = auth.uid()
  )
);

-- Create trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_decision_feedback_updated_at
  BEFORE UPDATE ON public.decision_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();