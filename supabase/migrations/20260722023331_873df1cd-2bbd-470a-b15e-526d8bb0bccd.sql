
-- PO Tracker: allow viewer to read
DROP POLICY IF EXISTS "po_tracker_card_labels read" ON public.po_tracker_card_labels;
CREATE POLICY "po_tracker_card_labels read" ON public.po_tracker_card_labels
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'purchasing'::app_role,'warehouse'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "po_tracker_checklists read" ON public.po_tracker_checklists;
CREATE POLICY "po_tracker_checklists read" ON public.po_tracker_checklists
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'purchasing'::app_role,'warehouse'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "po_tracker_comments read" ON public.po_tracker_comments;
CREATE POLICY "po_tracker_comments read" ON public.po_tracker_comments
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'purchasing'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "po_tracker_labels read" ON public.po_tracker_labels;
CREATE POLICY "po_tracker_labels read" ON public.po_tracker_labels
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'purchasing'::app_role,'warehouse'::app_role,'finance'::app_role,'viewer'::app_role]));

-- Calibration: allow viewer to read
DROP POLICY IF EXISTS "calibration_items read" ON public.calibration_items;
CREATE POLICY "calibration_items read" ON public.calibration_items
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'sales'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "calibration_tracker_checklists read" ON public.calibration_tracker_checklists;
CREATE POLICY "calibration_tracker_checklists read" ON public.calibration_tracker_checklists
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'sales'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "calibration_tracker_comments read" ON public.calibration_tracker_comments;
CREATE POLICY "calibration_tracker_comments read" ON public.calibration_tracker_comments
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'sales'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "cal_labels_read" ON public.calibration_labels;
CREATE POLICY "cal_labels_read" ON public.calibration_labels
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'sales'::app_role,'warehouse'::app_role,'purchasing'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "cal_card_labels_read" ON public.calibration_card_labels;
CREATE POLICY "cal_card_labels_read" ON public.calibration_card_labels
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'sales'::app_role,'warehouse'::app_role,'purchasing'::app_role,'finance'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS "calspare_select_roles" ON public.calibration_spare_parts;
CREATE POLICY "calspare_select_roles" ON public.calibration_spare_parts
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'sales'::app_role,'purchasing'::app_role,'finance'::app_role,'viewer'::app_role]));
