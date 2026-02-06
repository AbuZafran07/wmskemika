-- Drop existing SELECT policy for suppliers and create new one that includes all authorized roles
DROP POLICY IF EXISTS "Authorized users can view suppliers" ON public.suppliers;

-- Create new policy that allows all authenticated roles to view suppliers (except for sensitive contact info which is handled elsewhere)
CREATE POLICY "Authorized users can view suppliers"
ON public.suppliers FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND deleted_at IS NULL
  AND has_any_role(auth.uid(), ARRAY[
    'super_admin'::app_role, 
    'admin'::app_role, 
    'finance'::app_role,
    'purchasing'::app_role,
    'warehouse'::app_role,
    'sales'::app_role,
    'viewer'::app_role
  ])
);