DROP POLICY IF EXISTS "Authenticated users can view destruction orders" ON public.destruction_orders;
CREATE POLICY "Authorized roles can view destruction orders" ON public.destruction_orders FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse']::app_role[]));
DROP POLICY IF EXISTS "Authenticated users can view destruction items" ON public.destruction_order_items;
CREATE POLICY "Authorized roles can view destruction items" ON public.destruction_order_items FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse']::app_role[])
 OR EXISTS (SELECT 1 FROM public.destruction_orders d WHERE d.id = destruction_order_id AND d.created_by = auth.uid()));