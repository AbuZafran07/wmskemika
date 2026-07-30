ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS certificate_verify_token text;

UPDATE public.sales_order_items
SET certificate_verify_token = encode(gen_random_bytes(12), 'hex')
WHERE certificate_number IS NOT NULL AND certificate_verify_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_order_items_verify_token_idx
  ON public.sales_order_items (certificate_verify_token)
  WHERE certificate_verify_token IS NOT NULL;

DROP FUNCTION IF EXISTS public.verify_certificate(text);

CREATE OR REPLACE FUNCTION public.verify_certificate(p_number text, p_token text)
 RETURNS TABLE(status text, certificate_number text, certificate_issued_at timestamp with time zone, expires_at timestamp with time zone, instrument_name text, brand_model text, serial_number text, measurement_range text, calibration_method text, sales_order_number text, spk_number text, customer_name text, revoked_at timestamp with time zone, revoked_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_expires timestamptz;
  v_status text;
BEGIN
  IF p_number IS NULL OR length(trim(p_number)) = 0
     OR p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RETURN;
  END IF;

  SELECT
    soi.certificate_number AS cn,
    soi.certificate_issued_at,
    soi.instrument_name,
    soi.instrument_brand_model,
    soi.instrument_serial_number,
    soi.measurement_range,
    soi.calibration_method,
    soh.sales_order_number,
    soh.spk_number,
    c.name AS customer_name,
    soi.certificate_revoked_at,
    soi.certificate_revoked_reason
  INTO v_row
  FROM public.sales_order_items soi
  JOIN public.sales_order_headers soh ON soh.id = soi.sales_order_id
  LEFT JOIN public.customers c ON c.id = soh.customer_id
  WHERE soi.certificate_number = p_number
    AND soi.certificate_verify_token IS NOT NULL
    AND soi.certificate_verify_token = p_token
  LIMIT 1;

  IF v_row.cn IS NULL THEN
    v_status := 'not_found';
    INSERT INTO public.certificate_verification_logs (certificate_number, result)
    VALUES (p_number, v_status);
    RETURN QUERY SELECT v_status, p_number,
      NULL::timestamptz, NULL::timestamptz,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::text,
      NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  v_expires := v_row.certificate_issued_at + interval '1 year';

  IF v_row.certificate_revoked_at IS NOT NULL THEN
    v_status := 'revoked';
  ELSIF v_row.certificate_issued_at IS NOT NULL AND now() > v_expires THEN
    v_status := 'expired';
  ELSE
    v_status := 'valid';
  END IF;

  INSERT INTO public.certificate_verification_logs (certificate_number, result)
  VALUES (p_number, v_status);

  RETURN QUERY SELECT
    v_status,
    v_row.cn,
    v_row.certificate_issued_at,
    v_expires,
    v_row.instrument_name,
    v_row.instrument_brand_model,
    v_row.instrument_serial_number,
    v_row.measurement_range,
    v_row.calibration_method,
    v_row.sales_order_number,
    v_row.spk_number,
    v_row.customer_name,
    v_row.certificate_revoked_at,
    v_row.certificate_revoked_reason;
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_calibration_certificates(p_so_id uuid)
 RETURNS TABLE(item_id uuid, certificate_number text, certificate_issued_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_order record;
  v_item record;
  v_prefix text := 'LAB-SK-' || to_char(now(), 'YYYYMMDD') || '.';
  v_sequence integer;
  v_number text;
  v_issued_at timestamptz;
  v_item_id uuid;
  v_required text[] := ARRAY['calibration_completed','payment_verified'];
  v_missing_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role]) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  SELECT id, sales_order_number, order_type, status
  INTO v_order
  FROM public.sales_order_headers
  WHERE id = p_so_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Sales Order kalibrasi tidak ditemukan';
  END IF;

  IF v_order.order_type <> 'calibration' THEN
    RAISE EXCEPTION 'Sales Order bukan tipe kalibrasi';
  END IF;

  SELECT count(*)
  INTO v_missing_count
  FROM unnest(v_required) AS req(checklist_key)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.calibration_tracker_checklists c
    WHERE c.sales_order_id = p_so_id
      AND c.checklist_key = req.checklist_key
      AND c.is_checked = true
  );

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Checklist Kalibrasi Selesai dan Payment Verified wajib dicentang sebelum menerbitkan sertifikat';
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(soi.certificate_number, '^.*\.', ''), '')::integer), 0) + 1
  INTO v_sequence
  FROM public.sales_order_items soi
  WHERE soi.item_type = 'calibration'
    AND soi.certificate_number LIKE v_prefix || '%';

  v_email := public.get_user_email(v_uid);

  FOR v_item IN
    SELECT soi.id, soi.certificate_number, soi.certificate_issued_at
    FROM public.sales_order_items soi
    WHERE soi.sales_order_id = p_so_id
      AND soi.item_type = 'calibration'
    ORDER BY soi.created_at ASC, soi.id ASC
  LOOP
    IF v_item.certificate_number IS NULL THEN
      LOOP
        v_number := v_prefix || lpad(v_sequence::text, 3, '0');
        v_sequence := v_sequence + 1;
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.sales_order_items existing
          WHERE existing.certificate_number = v_number
        );
      END LOOP;

      UPDATE public.sales_order_items AS soi
      SET certificate_number = v_number,
          certificate_issued_at = now(),
          certificate_verify_token = COALESCE(soi.certificate_verify_token, encode(gen_random_bytes(12), 'hex'))
      WHERE soi.id = v_item.id
      RETURNING soi.id, soi.certificate_number, soi.certificate_issued_at
      INTO v_item_id, v_number, v_issued_at;

      item_id := v_item_id;
      certificate_number := v_number;
      certificate_issued_at := v_issued_at;

      INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
      VALUES (
        v_uid,
        v_email,
        'ISSUE',
        'Calibration Certificate',
        'sales_order_items',
        v_item_id,
        v_number,
        jsonb_build_object(
          'sales_order_id', p_so_id,
          'sales_order_number', v_order.sales_order_number,
          'certificate_issued_at', v_issued_at
        )
      );

      RETURN NEXT;
    ELSE
      item_id := v_item.id;
      certificate_number := v_item.certificate_number;
      certificate_issued_at := v_item.certificate_issued_at;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_certificate(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text, text) TO anon, authenticated, service_role;