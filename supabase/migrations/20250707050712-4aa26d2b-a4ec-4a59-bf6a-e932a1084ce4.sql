-- Add RLS policy to allow users to delete files from their projects
CREATE POLICY "Users can delete files from their projects" 
ON uploaded_files 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM projects 
  WHERE projects.id = uploaded_files.project_id 
  AND projects.user_id = auth.uid()
));