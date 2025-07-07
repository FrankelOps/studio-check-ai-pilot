-- Update RLS policies for meeting_minutes to allow project members
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create meeting minutes in their projects" ON public.meeting_minutes;
DROP POLICY IF EXISTS "Users can update meeting minutes in their projects" ON public.meeting_minutes;
DROP POLICY IF EXISTS "Users can delete meeting minutes from their projects" ON public.meeting_minutes;

-- Create new policies that allow both project owners and members
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