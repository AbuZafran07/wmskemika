DROP POLICY IF EXISTS cal_doc_logs_select_authenticated ON public.calibration_document_logs;
CREATE POLICY cal_doc_logs_select_roles ON public.calibration_document_logs
FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'sales'::app_role,'finance'::app_role,'viewer'::app_role]));