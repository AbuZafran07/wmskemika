-- Expand write policies to include finance
DROP POLICY IF EXISTS "calibration_tracker_checklists insert" ON public.calibration_tracker_checklists;
DROP POLICY IF EXISTS "calibration_tracker_checklists update" ON public.calibration_tracker_checklists;

CREATE POLICY "calibration_tracker_checklists insert"
  ON public.calibration_tracker_checklists FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'finance'::app_role]));

CREATE POLICY "calibration_tracker_checklists update"
  ON public.calibration_tracker_checklists FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'finance'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'warehouse'::app_role, 'finance'::app_role]));

-- Trigger enforces finance-only keys server-side
CREATE OR REPLACE FUNCTION public.enforce_calibration_checklist_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NEW.checklist_key IN ('payment_verified','certificate_released','instrument_delivered') THEN
    IF NOT has_any_role(v_uid, ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role]) THEN
      RAISE EXCEPTION 'Not authorized: only Finance / Admin / Super Admin can toggle % checklist', NEW.checklist_key
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_calibration_checklist_role ON public.calibration_tracker_checklists;
CREATE TRIGGER trg_enforce_calibration_checklist_role
  BEFORE INSERT OR UPDATE ON public.calibration_tracker_checklists
  FOR EACH ROW EXECUTE FUNCTION public.enforce_calibration_checklist_role();