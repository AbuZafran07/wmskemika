CREATE OR REPLACE FUNCTION public.is_calibration_checker(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _user_id = ANY(public.get_calibration_checklist_users());
$$;

GRANT EXECUTE ON FUNCTION public.is_calibration_checker(uuid) TO authenticated;

DROP POLICY IF EXISTS "calibration_tracker_checklists insert" ON public.calibration_tracker_checklists;
CREATE POLICY "calibration_tracker_checklists insert"
ON public.calibration_tracker_checklists FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'finance'::app_role])
  OR public.is_calibration_checker(auth.uid())
);

DROP POLICY IF EXISTS "calibration_tracker_checklists update" ON public.calibration_tracker_checklists;
CREATE POLICY "calibration_tracker_checklists update"
ON public.calibration_tracker_checklists FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'finance'::app_role])
  OR public.is_calibration_checker(auth.uid())
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'warehouse'::app_role,'finance'::app_role])
  OR public.is_calibration_checker(auth.uid())
);