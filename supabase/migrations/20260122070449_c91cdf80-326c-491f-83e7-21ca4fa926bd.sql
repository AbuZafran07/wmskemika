-- Fix 1: user_roles - Add auth.uid() IS NOT NULL check to "Users can view their own roles" policy
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Fix 2: audit_logs - Add explicit auth.uid() IS NOT NULL check to SELECT policies
DROP POLICY IF EXISTS "Admins can view non-financial audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view non-financial audit logs"
ON public.audit_logs
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'admin'::app_role) 
  AND (module <> ALL (ARRAY['user-management'::text, 'settings'::text]))
);

DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Super admins can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 3: suppliers - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Admin, finance, and purchasing can manage suppliers" ON public.suppliers;
CREATE POLICY "Admin, finance, and purchasing can manage suppliers"
ON public.suppliers
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role]));

-- Fix 4: categories - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Admin, finance, and purchasing can manage categories" ON public.categories;
CREATE POLICY "Admin, finance, and purchasing can manage categories"
ON public.categories
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role]));

-- Fix 5: units - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Admin, finance, and purchasing can manage units" ON public.units;
CREATE POLICY "Admin, finance, and purchasing can manage units"
ON public.units
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role]));

-- Fix 6: products - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Admin, finance, and purchasing can manage products" ON public.products;
CREATE POLICY "Admin, finance, and purchasing can manage products"
ON public.products
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role]));

-- Fix 7: inventory_batches - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage inventory" ON public.inventory_batches;
CREATE POLICY "Authorized users can manage inventory"
ON public.inventory_batches
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]));

-- Fix 8: plan_order_headers - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage plan orders" ON public.plan_order_headers;
CREATE POLICY "Authorized users can manage plan orders"
ON public.plan_order_headers
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role]));

-- Fix 9: plan_order_items - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage plan order items" ON public.plan_order_items;
CREATE POLICY "Authorized users can manage plan order items"
ON public.plan_order_items
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role]));

-- Fix 10: sales_order_headers - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage sales orders" ON public.sales_order_headers;
CREATE POLICY "Authorized users can manage sales orders"
ON public.sales_order_headers
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role]));

-- Fix 11: sales_order_items - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage sales order items" ON public.sales_order_items;
CREATE POLICY "Authorized users can manage sales order items"
ON public.sales_order_items
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role]));

-- Fix 12: stock_adjustments - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage adjustments" ON public.stock_adjustments;
CREATE POLICY "Authorized users can manage adjustments"
ON public.stock_adjustments
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]));

-- Fix 13: stock_adjustment_items - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage adjustment items" ON public.stock_adjustment_items;
CREATE POLICY "Authorized users can manage adjustment items"
ON public.stock_adjustment_items
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]));

-- Fix 14: stock_in_headers - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage stock in" ON public.stock_in_headers;
CREATE POLICY "Authorized users can manage stock in"
ON public.stock_in_headers
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]));

-- Fix 15: stock_in_items - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage stock in items" ON public.stock_in_items;
CREATE POLICY "Authorized users can manage stock in items"
ON public.stock_in_items
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]));

-- Fix 16: stock_out_headers - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage stock out" ON public.stock_out_headers;
CREATE POLICY "Authorized users can manage stock out"
ON public.stock_out_headers
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]));

-- Fix 17: stock_out_items - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Authorized users can manage stock out items" ON public.stock_out_items;
CREATE POLICY "Authorized users can manage stock out items"
ON public.stock_out_items
FOR ALL
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role]));

-- Fix 18: settings - Add auth.uid() IS NOT NULL check to policies
DROP POLICY IF EXISTS "Only super_admin can manage settings" ON public.settings;
CREATE POLICY "Only super_admin can manage settings"
ON public.settings
FOR ALL
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Admin roles can view settings" ON public.settings;
CREATE POLICY "Admin roles can view settings"
ON public.settings
FOR SELECT
USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role]));

-- Fix 19: user_roles - Add auth.uid() IS NOT NULL check to ALL policy
DROP POLICY IF EXISTS "Only super_admin can manage roles" ON public.user_roles;
CREATE POLICY "Only super_admin can manage roles"
ON public.user_roles
FOR ALL
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role));

-- Fix 20: profiles_chat_view - Enable RLS and add policy (this is a VIEW, but we need to ensure security)
-- Note: Views inherit RLS from underlying tables, but we can add explicit SECURITY INVOKER

-- Fix 21: chat_reactions - Add auth.uid() IS NOT NULL check to DELETE policy
DROP POLICY IF EXISTS "Users can remove their own reactions" ON public.chat_reactions;
CREATE POLICY "Users can remove their own reactions"
ON public.chat_reactions
FOR DELETE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);