-- Fix profiles table: Update the ALL policy to require auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "Super admin can manage all profiles" ON public.profiles;

CREATE POLICY "Super admin can manage all profiles"
ON public.profiles
FOR ALL
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role));

-- Fix customers table: Update the ALL policy to require auth.uid() IS NOT NULL
DROP POLICY IF EXISTS "Authorized users can manage customers" ON public.customers;

CREATE POLICY "Authorized users can manage customers"
ON public.customers
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'sales'::app_role]));