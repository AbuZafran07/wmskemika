DROP POLICY IF EXISTS "Relevant roles can view delivery requests" ON public.delivery_requests;
CREATE POLICY "Relevant roles can view delivery requests" ON public.delivery_requests FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','purchasing','finance','viewer']::app_role[]));

DROP POLICY IF EXISTS read_comments ON public.delivery_comments;
CREATE POLICY read_comments ON public.delivery_comments FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','purchasing','finance','viewer']::app_role[]));

DROP POLICY IF EXISTS read_checklists ON public.delivery_checklists;
CREATE POLICY read_checklists ON public.delivery_checklists FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','purchasing','finance','viewer']::app_role[]));