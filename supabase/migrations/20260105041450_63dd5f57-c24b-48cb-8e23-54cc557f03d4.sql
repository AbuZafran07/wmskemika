-- Drop existing overly permissive customers SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;

-- Create new role-restricted SELECT policy for customers
CREATE POLICY "Authorized users can view customers" 
ON public.customers FOR SELECT 
USING (
  deleted_at IS NULL AND
  public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'finance']::app_role[])
);