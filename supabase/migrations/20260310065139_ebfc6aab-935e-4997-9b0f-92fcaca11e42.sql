
-- Add viewer role to stock_out_headers SELECT policy
DROP POLICY IF EXISTS "Admin, warehouse, finance, and sales can view stock out headers" ON public.stock_out_headers;
CREATE POLICY "Admin, warehouse, finance, and sales can view stock out headers"
  ON public.stock_out_headers FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'finance'::app_role, 'sales'::app_role, 'purchasing'::app_role, 'viewer'::app_role])
  );

-- Add viewer role to stock_out_items SELECT policy
DROP POLICY IF EXISTS "Admin, warehouse, finance, and sales can view stock out items" ON public.stock_out_items;
CREATE POLICY "Admin, warehouse, finance, and sales can view stock out items"
  ON public.stock_out_items FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'finance'::app_role, 'sales'::app_role, 'purchasing'::app_role, 'viewer'::app_role])
  );

-- Add viewer role to inventory_batches SELECT policy (needed for batch join in stock out details)
DROP POLICY IF EXISTS "Authorized users can view inventory" ON public.inventory_batches;
CREATE POLICY "Authorized users can view inventory"
  ON public.inventory_batches FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'purchasing'::app_role, 'sales'::app_role, 'finance'::app_role, 'viewer'::app_role])
  );
