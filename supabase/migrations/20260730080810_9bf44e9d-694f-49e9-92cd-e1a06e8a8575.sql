CREATE OR REPLACE FUNCTION public.get_calibration_checklist_users()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg((v)::uuid)
       FROM public.settings s,
            jsonb_array_elements_text(COALESCE(s.value, '[]'::jsonb)) AS v
      WHERE s.key = 'calibration_checklist_users'),
    ARRAY[]::uuid[]
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_calibration_checklist_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed uuid[];
BEGIN
  IF NEW.checklist_key IN ('payment_verified','certificate_released','instrument_delivered') THEN
    IF NOT has_any_role(v_uid, ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role]) THEN
      RAISE EXCEPTION 'Not authorized: only Finance / Admin / Super Admin can toggle % checklist', NEW.checklist_key
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.checklist_key IN ('instrument_received','spk_issued','spk_confirmed','calibration_completed') THEN
    IF NOT has_role(v_uid, 'super_admin'::app_role) THEN
      v_allowed := public.get_calibration_checklist_users();
      IF v_uid IS NULL OR NOT (v_uid = ANY(v_allowed)) THEN
        RAISE EXCEPTION 'Not authorized: akun Anda belum terdaftar sebagai petugas checklist kalibrasi'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;