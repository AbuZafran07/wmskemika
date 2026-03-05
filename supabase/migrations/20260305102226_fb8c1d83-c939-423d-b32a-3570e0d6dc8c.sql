
-- Allow all authenticated users to view profiles (internal company app)
-- This is needed for comments, chat, and other collaborative features
CREATE POLICY "All authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
