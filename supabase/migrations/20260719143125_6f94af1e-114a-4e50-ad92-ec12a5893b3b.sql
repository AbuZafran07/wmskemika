
DROP POLICY IF EXISTS cal_labels_manage ON public.calibration_labels;
CREATE POLICY cal_labels_insert ON public.calibration_labels FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY cal_labels_update ON public.calibration_labels FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY cal_labels_delete ON public.calibration_labels FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
