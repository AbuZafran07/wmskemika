-- Fix MISSING_RLS: Add role-based read restrictions to tables
-- This replaces overly permissive SELECT policies with role-specific ones

-- 1. PRODUCTS - Allow purchasing, warehouse, sales, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
CREATE POLICY "Authorized users can view products" 
ON public.products FOR SELECT 
USING (
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales', 'finance']::app_role[])
);

-- 2. SUPPLIERS - Allow purchasing, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
CREATE POLICY "Authorized users can view suppliers" 
ON public.suppliers FOR SELECT 
USING (
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing']::app_role[])
);

-- 3. CATEGORIES - Allow purchasing, warehouse, sales, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;
CREATE POLICY "Authorized users can view categories" 
ON public.categories FOR SELECT 
USING (
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales']::app_role[])
);

-- 4. UNITS - Allow purchasing, warehouse, sales, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view units" ON public.units;
CREATE POLICY "Authorized users can view units" 
ON public.units FOR SELECT 
USING (
  deleted_at IS NULL AND 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales']::app_role[])
);

-- 5. INVENTORY_BATCHES - Allow warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON public.inventory_batches;
CREATE POLICY "Authorized users can view inventory" 
ON public.inventory_batches FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'purchasing', 'sales']::app_role[])
);

-- 6. PLAN_ORDER_HEADERS - Allow purchasing, warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view plan orders" ON public.plan_order_headers;
CREATE POLICY "Authorized users can view plan orders" 
ON public.plan_order_headers FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse']::app_role[])
);

-- 7. PLAN_ORDER_ITEMS - Allow purchasing, warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view plan order items" ON public.plan_order_items;
CREATE POLICY "Authorized users can view plan order items" 
ON public.plan_order_items FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse']::app_role[])
);

-- 8. SALES_ORDER_HEADERS - Allow sales, warehouse, finance, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view sales orders" ON public.sales_order_headers;
CREATE POLICY "Authorized users can view sales orders" 
ON public.sales_order_headers FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'warehouse', 'finance']::app_role[])
);

-- 9. SALES_ORDER_ITEMS - Allow sales, warehouse, finance, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view sales order items" ON public.sales_order_items;
CREATE POLICY "Authorized users can view sales order items" 
ON public.sales_order_items FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'warehouse', 'finance']::app_role[])
);

-- 10. STOCK_TRANSACTIONS - Allow warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON public.stock_transactions;
CREATE POLICY "Authorized users can view transactions" 
ON public.stock_transactions FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- 11. STOCK_ADJUSTMENTS - Allow warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view adjustments" ON public.stock_adjustments;
CREATE POLICY "Authorized users can view adjustments" 
ON public.stock_adjustments FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- 12. STOCK_ADJUSTMENT_ITEMS - Allow warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view adjustment items" ON public.stock_adjustment_items;
CREATE POLICY "Authorized users can view adjustment items" 
ON public.stock_adjustment_items FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[])
);

-- 13. STOCK_IN_HEADERS - Allow warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view stock in" ON public.stock_in_headers;
CREATE POLICY "Authorized users can view stock in" 
ON public.stock_in_headers FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'purchasing']::app_role[])
);

-- 14. STOCK_IN_ITEMS - Allow warehouse, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view stock in items" ON public.stock_in_items;
CREATE POLICY "Authorized users can view stock in items" 
ON public.stock_in_items FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'purchasing']::app_role[])
);

-- 15. STOCK_OUT_HEADERS - Allow warehouse, sales, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view stock out" ON public.stock_out_headers;
CREATE POLICY "Authorized users can view stock out" 
ON public.stock_out_headers FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'sales']::app_role[])
);

-- 16. STOCK_OUT_ITEMS - Allow warehouse, sales, admin, super_admin to view
DROP POLICY IF EXISTS "Authenticated users can view stock out items" ON public.stock_out_items;
CREATE POLICY "Authorized users can view stock out items" 
ON public.stock_out_items FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse', 'sales']::app_role[])
);

-- 17. ATTACHMENTS - Allow role-based access based on module
DROP POLICY IF EXISTS "Authenticated users can view attachments" ON public.attachments;
CREATE POLICY "Authorized users can view attachments" 
ON public.attachments FOR SELECT 
USING (
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales', 'finance']::app_role[])
);

-- 18. SETTINGS - Already restricted to super_admin for management, but SELECT is open
-- Keep settings viewable by all authenticated users since it contains app configuration
-- (already has proper policy: "Authenticated users can view settings")

-- Note: profiles, customers, user_roles, and audit_logs already have proper role-based policies