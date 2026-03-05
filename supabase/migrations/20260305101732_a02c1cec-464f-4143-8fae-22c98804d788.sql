
-- Update sales_order_headers SELECT policy to include viewer and purchasing
DROP POLICY IF EXISTS "Authorized users can view sales orders" ON public.sales_order_headers;
CREATE POLICY "Authorized users can view sales orders"
  ON public.sales_order_headers FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','finance','purchasing','viewer']::app_role[])
  );

-- Update sales_order_items SELECT policy to include viewer and purchasing
DROP POLICY IF EXISTS "Authorized users can view sales order items" ON public.sales_order_items;
CREATE POLICY "Authorized users can view sales order items"
  ON public.sales_order_items FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','finance','purchasing','viewer']::app_role[])
  );

-- Update customers SELECT policy to include viewer
DROP POLICY IF EXISTS "Authorized users can view customers" ON public.customers;
CREATE POLICY "Authorized users can view customers"
  ON public.customers FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','finance','warehouse','purchasing','viewer']::app_role[])
  );

-- Update products SELECT policy to include viewer
DROP POLICY IF EXISTS "Authorized users can view products" ON public.products;
CREATE POLICY "Authorized users can view products"
  ON public.products FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','sales','finance','viewer']::app_role[])
  );
