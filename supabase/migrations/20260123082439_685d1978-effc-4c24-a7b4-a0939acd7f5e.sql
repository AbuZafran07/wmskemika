-- Fix 1: profiles table - Remove the overly permissive "Admins can view all profiles" policy
-- and replace with a more restrictive policy that only exposes non-sensitive data
-- The profiles_chat_view already handles safe profile access for chat functionality

-- Drop the existing admin view policy that exposes emails
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create a new policy for admin viewing that only allows super_admin full access
-- Regular admins should use the profiles_chat_view for non-sensitive data
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_role(auth.uid(), 'super_admin'::app_role)
);

-- Fix 2: suppliers table - Remove finance role from SELECT policy
-- Finance doesn't need access to supplier contact details (NPWP, phone, email, contact_person)
-- Only purchasing and admin roles legitimately need supplier data

-- Drop the existing view policy
DROP POLICY IF EXISTS "Authorized users can view suppliers" ON public.suppliers;

-- Create new restrictive SELECT policy without finance role
CREATE POLICY "Authorized users can view suppliers"
ON public.suppliers
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND deleted_at IS NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role])
);