CREATE OR REPLACE FUNCTION public.issue_calibration_spk(p_so_id uuid)
RETURNS TABLE(spk_number text, spk_issued_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_ok boolean;
  v_existing_number text;
  v_existing_at timestamptz;
  v_new_number text;
  v_seq int;
  v_date_prefix text;
  v_issued_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT public.has_any_role(auth.uid(),
    ARRAY['super_admin','admin','sales','warehouse']::app_role[])
    INTO v_role_ok;
  IF NOT v_role_ok THEN
    RAISE EXCEPTION 'Not authorized: required role missing';
  END IF;

  SELECT h.spk_number, h.spk_issued_at
    INTO v_existing_number, v_existing_at
  FROM public.sales_order_headers h
  WHERE h.id = p_so_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found';
  END IF;

  IF v_existing_number IS NOT NULL AND length(v_existing_number) > 0 THEN
    spk_number := v_existing_number;
    spk_issued_at := COALESCE(v_existing_at, v_issued_at);
    RETURN NEXT;
    RETURN;
  END IF;

  v_date_prefix := to_char(v_issued_at, 'YYYYMMDD');

  -- Qualify with alias to avoid ambiguity with the OUT parameter of the same name
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(h.spk_number, '^SPK/' || v_date_prefix || '\.', ''), '')::int
  ), 0) + 1
    INTO v_seq
  FROM public.sales_order_headers h
  WHERE h.spk_number LIKE 'SPK/' || v_date_prefix || '.%';

  v_new_number := 'SPK/' || v_date_prefix || '.' || lpad(v_seq::text, 2, '0');

  UPDATE public.sales_order_headers
     SET spk_number = v_new_number,
         spk_issued_at = v_issued_at,
         calibration_status = 'spk_issued',
         customer_po_number = COALESCE(customer_po_number, v_new_number)
   WHERE id = p_so_id;

  spk_number := v_new_number;
  spk_issued_at := v_issued_at;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_calibration_spk(uuid) TO authenticated;