-- Fix RLS policies for finance role access to inventory_batches, categories, and units

-- 1. Drop and recreate inventory_batches SELECT policy with finance role
DROP POLICY IF EXISTS "Authorized users can view inventory" ON inventory_batches;
CREATE POLICY "Authorized users can view inventory" 
ON inventory_batches 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) 
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'purchasing'::app_role, 'sales'::app_role, 'finance'::app_role])
);

-- 2. Drop and recreate categories SELECT policy with finance role
DROP POLICY IF EXISTS "Authorized users can view categories" ON categories;
CREATE POLICY "Authorized users can view categories" 
ON categories 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) 
  AND (deleted_at IS NULL) 
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'finance'::app_role])
);

-- 3. Drop and recreate units SELECT policy with finance role
DROP POLICY IF EXISTS "Authorized users can view units" ON units;
CREATE POLICY "Authorized users can view units" 
ON units 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) 
  AND (deleted_at IS NULL) 
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'finance'::app_role])
);