-- Update format nomor SPK Kalibrasi dari SPK/YYYYMMDD.NN menjadi LAB-SPK-YYYYMMDD.NN

CREATE OR REPLACE FUNCTION public.issue_calibration_spk(p_so_id uuid)
RETURNS TABLE(spk_number text, spk_issued_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    AND h.order_type = 'calibration'
    AND COALESCE(h.is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales Order Kalibrasi tidak ditemukan';
  END IF;

  IF v_existing_number IS NOT NULL AND length(trim(v_existing_number)) > 0 THEN
    spk_number := v_existing_number;
    spk_issued_at := COALESCE(v_existing_at, v_issued_at);
    RETURN NEXT;
    RETURN;
  END IF;

  v_date_prefix := to_char(v_issued_at, 'YYYYMMDD');

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(h.spk_number, '^LAB-SPK-' || v_date_prefix || '\.', ''), '')::int
  ), 0) + 1
    INTO v_seq
  FROM public.sales_order_headers h
  WHERE h.spk_number LIKE 'LAB-SPK-' || v_date_prefix || '.%';

  v_new_number := 'LAB-SPK-' || v_date_prefix || '.' || lpad(v_seq::text, 2, '0');

  UPDATE public.sales_order_headers h
     SET spk_number = v_new_number,
         spk_issued_at = v_issued_at,
         calibration_status = 'spk_issued'
   WHERE h.id = p_so_id;

  spk_number := v_new_number;
  spk_issued_at := v_issued_at;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.issue_calibration_spk(uuid) TO authenticated;

-- Backfill SPK numbers that were generated with the old SPK/ prefix to the new LAB-SPK- prefix
UPDATE public.sales_order_headers h
   SET spk_number = 'LAB-SPK-' || substring(h.spk_number from '^SPK/([0-9]{8})\\.') || '.' || substring(h.spk_number from '\\.([0-9]+)$')
 WHERE h.order_type = 'calibration'
   AND h.spk_number LIKE 'SPK/%';
