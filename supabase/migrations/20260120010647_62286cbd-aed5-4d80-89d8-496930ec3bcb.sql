-- Allow all authenticated users to view basic profile info for chat functionality
-- This enables showing sender names in global chat for all users

-- Create a new policy that allows all authenticated users to view profiles
-- This is needed because chat displays sender names from other users
CREATE POLICY "Authenticated users can view profiles for chat"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer']::app_role[])
);