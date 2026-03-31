
-- Drop the old restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view attachments for accessible records" ON public.attachments;

-- Create a simple policy: all authenticated users can view attachments
CREATE POLICY "All authenticated users can view attachments"
  ON public.attachments
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
