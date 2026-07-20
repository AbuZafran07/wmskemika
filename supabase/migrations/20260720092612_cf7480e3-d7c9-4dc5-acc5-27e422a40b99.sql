
CREATE OR REPLACE FUNCTION public.sync_calibration_receipt_status(
  p_so_id uuid,
  p_received boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role) OR
    public.has_role(v_uid, 'admin'::app_role) OR
    public.has_role(v_uid, 'warehouse'::app_role) OR
    public.has_role(v_uid, 'purchasing'::app_role) OR
    public.has_role(v_uid, 'sales'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT calibration_status INTO v_current
  FROM public.sales_order_headers WHERE id = p_so_id;

  IF p_received THEN
    UPDATE public.sales_order_headers
      SET calibration_received_at = now(),
          calibration_status = CASE
            WHEN v_current IS NULL OR v_current IN ('draft','pending_receipt','rejected','cancelled')
              THEN 'received' ELSE v_current END
      WHERE id = p_so_id;
  ELSE
    UPDATE public.sales_order_headers
      SET calibration_received_at = NULL,
          calibration_status = CASE WHEN v_current = 'received' THEN 'pending_receipt' ELSE v_current END
      WHERE id = p_so_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_calibration_receipt_status(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_calibration_spk_confirmed(
  p_so_id uuid,
  p_confirmed boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role) OR
    public.has_role(v_uid, 'admin'::app_role) OR
    public.has_role(v_uid, 'warehouse'::app_role) OR
    public.has_role(v_uid, 'purchasing'::app_role) OR
    public.has_role(v_uid, 'sales'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.sales_order_headers
    SET spk_confirmed_at = CASE WHEN p_confirmed THEN now() ELSE NULL END
    WHERE id = p_so_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_calibration_spk_confirmed(uuid, boolean) TO authenticated;
