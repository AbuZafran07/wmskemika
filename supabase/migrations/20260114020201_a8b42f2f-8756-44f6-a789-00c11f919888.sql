-- Add finance role to stock_in_headers SELECT policy
DROP POLICY IF EXISTS "Admin and warehouse can manage stock in headers" ON public.stock_in_headers;
CREATE POLICY "Admin, warehouse, and finance can view stock in headers"
ON public.stock_in_headers
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'finance', 'purchasing']::app_role[])
);

CREATE POLICY "Admin and warehouse can insert stock in headers"
ON public.stock_in_headers
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

CREATE POLICY "Admin and warehouse can update stock in headers"
ON public.stock_in_headers
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- Add finance role to stock_in_items SELECT policy
DROP POLICY IF EXISTS "Admin and warehouse can manage stock in items" ON public.stock_in_items;
CREATE POLICY "Admin, warehouse, and finance can view stock in items"
ON public.stock_in_items
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'finance', 'purchasing']::app_role[])
);

CREATE POLICY "Admin and warehouse can insert stock in items"
ON public.stock_in_items
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

CREATE POLICY "Admin and warehouse can update stock in items"
ON public.stock_in_items
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- Add finance role to stock_out_headers SELECT policy
DROP POLICY IF EXISTS "Admin and warehouse can manage stock out headers" ON public.stock_out_headers;
CREATE POLICY "Admin, warehouse, finance, and sales can view stock out headers"
ON public.stock_out_headers
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'finance', 'sales', 'purchasing']::app_role[])
);

CREATE POLICY "Admin and warehouse can insert stock out headers"
ON public.stock_out_headers
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

CREATE POLICY "Admin and warehouse can update stock out headers"
ON public.stock_out_headers
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- Add finance role to stock_out_items SELECT policy
DROP POLICY IF EXISTS "Admin and warehouse can manage stock out items" ON public.stock_out_items;
CREATE POLICY "Admin, warehouse, finance, and sales can view stock out items"
ON public.stock_out_items
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'finance', 'sales', 'purchasing']::app_role[])
);

CREATE POLICY "Admin and warehouse can insert stock out items"
ON public.stock_out_items
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

CREATE POLICY "Admin and warehouse can update stock out items"
ON public.stock_out_items
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- Update stock_transactions SELECT policy to include finance
DROP POLICY IF EXISTS "Authenticated users can view stock transactions" ON public.stock_transactions;
DROP POLICY IF EXISTS "Admin users can view stock transactions" ON public.stock_transactions;
CREATE POLICY "Authorized users can view stock transactions"
ON public.stock_transactions
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'finance', 'purchasing', 'sales']::app_role[])
);

-- Update categories policy to allow finance to manage
DROP POLICY IF EXISTS "Authorized users can manage categories" ON public.categories;
CREATE POLICY "Admin, finance, and purchasing can manage categories"
ON public.categories
FOR ALL
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'finance', 'purchasing']::app_role[])
);

-- Update units policy to allow finance to manage
DROP POLICY IF EXISTS "Authorized users can manage units" ON public.units;
CREATE POLICY "Admin, finance, and purchasing can manage units"
ON public.units
FOR ALL
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'finance', 'purchasing']::app_role[])
);

-- Update suppliers policy to allow finance to manage
DROP POLICY IF EXISTS "Authorized users can manage suppliers" ON public.suppliers;
CREATE POLICY "Admin, finance, and purchasing can manage suppliers"
ON public.suppliers
FOR ALL
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'finance', 'purchasing']::app_role[])
);

-- Update products policy to allow finance to manage
DROP POLICY IF EXISTS "Authorized users can manage products" ON public.products;
CREATE POLICY "Admin, finance, and purchasing can manage products"
ON public.products
FOR ALL
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'finance', 'purchasing']::app_role[])
);