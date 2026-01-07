-- Add defense-in-depth by replacing has_any_role calls with explicit auth.uid() IS NOT NULL checks
-- This provides additional protection if the authenticated role constraint is misconfigured

-- Drop and recreate SELECT policies with explicit auth.uid() IS NOT NULL checks

-- 1. categories
DROP POLICY IF EXISTS "Authorized users can view categories" ON categories;
CREATE POLICY "Authorized users can view categories" ON categories
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales']::app_role[])
);

-- 2. units
DROP POLICY IF EXISTS "Authorized users can view units" ON units;
CREATE POLICY "Authorized users can view units" ON units
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales']::app_role[])
);

-- 3. suppliers
DROP POLICY IF EXISTS "Authorized users can view suppliers" ON suppliers;
CREATE POLICY "Authorized users can view suppliers" ON suppliers
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing']::app_role[])
);

-- 4. products
DROP POLICY IF EXISTS "Authorized users can view products" ON products;
CREATE POLICY "Authorized users can view products" ON products
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales', 'finance']::app_role[])
);

-- 5. customers
DROP POLICY IF EXISTS "Authorized users can view customers" ON customers;
CREATE POLICY "Authorized users can view customers" ON customers
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'finance']::app_role[])
);

-- 6. inventory_batches
DROP POLICY IF EXISTS "Authorized users can view inventory" ON inventory_batches;
CREATE POLICY "Authorized users can view inventory" ON inventory_batches
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'purchasing', 'sales']::app_role[])
);

-- 7. plan_order_headers
DROP POLICY IF EXISTS "Authorized users can view plan orders" ON plan_order_headers;
CREATE POLICY "Authorized users can view plan orders" ON plan_order_headers
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse']::app_role[])
);

-- 8. plan_order_items
DROP POLICY IF EXISTS "Authorized users can view plan order items" ON plan_order_items;
CREATE POLICY "Authorized users can view plan order items" ON plan_order_items
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse']::app_role[])
);

-- 9. sales_order_headers
DROP POLICY IF EXISTS "Authorized users can view sales orders" ON sales_order_headers;
CREATE POLICY "Authorized users can view sales orders" ON sales_order_headers
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'warehouse', 'finance']::app_role[])
);

-- 10. sales_order_items
DROP POLICY IF EXISTS "Authorized users can view sales order items" ON sales_order_items;
CREATE POLICY "Authorized users can view sales order items" ON sales_order_items
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'warehouse', 'finance']::app_role[])
);

-- 11. stock_transactions
DROP POLICY IF EXISTS "Authorized users can view transactions" ON stock_transactions;
CREATE POLICY "Authorized users can view transactions" ON stock_transactions
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- 12. stock_adjustments
DROP POLICY IF EXISTS "Authorized users can view adjustments" ON stock_adjustments;
CREATE POLICY "Authorized users can view adjustments" ON stock_adjustments
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- 13. stock_adjustment_items
DROP POLICY IF EXISTS "Authorized users can view adjustment items" ON stock_adjustment_items;
CREATE POLICY "Authorized users can view adjustment items" ON stock_adjustment_items
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- 14. attachments
DROP POLICY IF EXISTS "Authorized users can view attachments" ON attachments;
CREATE POLICY "Authorized users can view attachments" ON attachments
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales', 'finance']::app_role[])
);

-- 15. stock_in_headers
DROP POLICY IF EXISTS "Authorized users can view stock in" ON stock_in_headers;
CREATE POLICY "Authorized users can view stock in" ON stock_in_headers
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'purchasing']::app_role[])
);

-- 16. stock_in_items
DROP POLICY IF EXISTS "Authorized users can view stock in items" ON stock_in_items;
CREATE POLICY "Authorized users can view stock in items" ON stock_in_items
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'purchasing']::app_role[])
);

-- 17. stock_out_headers
DROP POLICY IF EXISTS "Authorized users can view stock out" ON stock_out_headers;
CREATE POLICY "Authorized users can view stock out" ON stock_out_headers
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'sales']::app_role[])
);

-- 18. stock_out_items
DROP POLICY IF EXISTS "Authorized users can view stock out items" ON stock_out_items;
CREATE POLICY "Authorized users can view stock out items" ON stock_out_items
FOR SELECT USING (
  auth.uid() IS NOT NULL AND
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'sales']::app_role[])
);