-- Fix PUBLIC_USER_DATA: profiles table - ensure unauthenticated users cannot access
-- Drop existing SELECT policies and recreate with explicit auth.uid() IS NOT NULL check

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Recreate policies with explicit authentication check
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role]));

-- Fix EXPOSED_SENSITIVE_DATA: customers table - ensure unauthenticated users cannot access
-- Drop existing SELECT policy and recreate with explicit auth.uid() IS NOT NULL check

DROP POLICY IF EXISTS "Authorized users can view customers" ON public.customers;

-- Recreate policy with explicit authentication check (defense-in-depth)
CREATE POLICY "Authorized users can view customers" 
ON public.customers 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'finance'::app_role]));