-- Harden user_roles table: Add explicit auth.uid() IS NOT NULL check
-- to prevent any unauthenticated access attempt

-- Drop existing policy that's missing auth check
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Recreate with explicit auth.uid() IS NOT NULL check
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role])
);