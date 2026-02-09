
-- Drop existing SELECT policy for products that filters deleted_at
DROP POLICY IF EXISTS "Authorized users can view products" ON public.products;

-- Create new SELECT policy that allows viewing ALL products (including deleted ones)
-- for maintaining transaction history integrity
CREATE POLICY "Authorized users can view products"
ON public.products
FOR SELECT
TO public
USING (
  (auth.uid() IS NOT NULL) 
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'finance'::app_role])
);

-- Note: The ALL policy for management still exists and handles INSERT/UPDATE/DELETE
-- which already doesn't filter by deleted_at
