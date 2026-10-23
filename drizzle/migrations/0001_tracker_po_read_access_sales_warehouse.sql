DROP POLICY IF EXISTS "Authorized users can view plan orders" ON public.plan_order_headers;
CREATE POLICY "Authorized users can view plan orders" ON public.plan_order_headers
  FOR SELECT USING ((auth.uid() IS NOT NULL) AND public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[]));

DROP POLICY IF EXISTS "Authorized users can view plan order items" ON public.plan_order_items;
CREATE POLICY "Authorized users can view plan order items" ON public.plan_order_items
  FOR SELECT USING ((auth.uid() IS NOT NULL) AND public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[]));

DROP POLICY IF EXISTS "Authorized users can view archived PO" ON public.po_tracker_archived;
CREATE POLICY "Authorized users can view archived PO" ON public.po_tracker_archived
  FOR SELECT USING ((auth.uid() IS NOT NULL) AND public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[]));

DROP POLICY IF EXISTS "po_tracker_card_labels read" ON public.po_tracker_card_labels;
CREATE POLICY "po_tracker_card_labels read" ON public.po_tracker_card_labels
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','finance','sales','viewer']::app_role[]));

DROP POLICY IF EXISTS "po_tracker_checklists read" ON public.po_tracker_checklists;
CREATE POLICY "po_tracker_checklists read" ON public.po_tracker_checklists
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','finance','sales','viewer']::app_role[]));

DROP POLICY IF EXISTS "po_tracker_comments read" ON public.po_tracker_comments;
CREATE POLICY "po_tracker_comments read" ON public.po_tracker_comments
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','finance','sales','viewer']::app_role[]));

DROP POLICY IF EXISTS "po_tracker_labels read" ON public.po_tracker_labels;
CREATE POLICY "po_tracker_labels read" ON public.po_tracker_labels
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','purchasing','warehouse','finance','sales','viewer']::app_role[]));