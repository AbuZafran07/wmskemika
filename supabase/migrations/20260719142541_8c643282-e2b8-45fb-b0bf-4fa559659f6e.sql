
DROP POLICY IF EXISTS cal_labels_manage_super ON public.calibration_labels;
CREATE POLICY cal_labels_manage ON public.calibration_labels FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'sales'::app_role,'warehouse'::app_role,'purchasing'::app_role,'finance'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'sales'::app_role,'warehouse'::app_role,'purchasing'::app_role,'finance'::app_role]));
