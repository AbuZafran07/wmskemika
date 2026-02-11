
-- Drop existing SELECT policy for customers
DROP POLICY IF EXISTS "Authorized users can view customers" ON public.customers;

-- Recreate with warehouse and purchasing roles added
CREATE POLICY "Authorized users can view customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND deleted_at IS NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'finance'::app_role, 'warehouse'::app_role, 'purchasing'::app_role])
);
