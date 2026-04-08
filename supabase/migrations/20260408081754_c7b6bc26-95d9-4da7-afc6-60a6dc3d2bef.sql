
DROP POLICY IF EXISTS "Authorized users can view adjustments" ON public.stock_adjustments;
CREATE POLICY "Authorized users can view adjustments"
ON public.stock_adjustments
FOR SELECT
TO public
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'finance'::app_role])
);

DROP POLICY IF EXISTS "Authorized users can view adjustment items" ON public.stock_adjustment_items;
CREATE POLICY "Authorized users can view adjustment items"
ON public.stock_adjustment_items
FOR SELECT
TO public
USING (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'finance'::app_role])
);
