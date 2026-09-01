CREATE OR REPLACE FUNCTION public.verify_certificate(p_number text, p_token text)
 RETURNS TABLE(status text, certificate_number text, certificate_issued_at timestamp with time zone, expires_at timestamp with time zone, instrument_name text, brand_model text, serial_number text, measurement_range text, calibration_method text, sales_order_number text, spk_number text, customer_name text, revoked_at timestamp with time zone, revoked_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_expires timestamptz;
  v_issued timestamptz;
  v_base timestamptz;
  v_status text;
  v_full boolean;
BEGIN
  IF p_number IS NULL OR length(trim(p_number)) < 6 THEN
    RETURN;
  END IF;

  v_full := p_token IS NOT NULL AND length(trim(p_token)) >= 8;

  SELECT
    soi.certificate_number AS cn,
    soi.certificate_issued_at,
    soi.calibration_date,
    COALESCE(soi.certificate_validity_months, 12) AS validity_months,
    soi.instrument_name,
    soi.instrument_brand_model,
    soi.instrument_serial_number,
    soi.measurement_range,
    soi.calibration_method,
    soh.sales_order_number,
    soh.spk_number,
    c.name AS customer_name,
    soi.certificate_revoked_at,
    soi.certificate_revoked_reason,
    (
      SELECT ctc.checked_at
      FROM public.calibration_tracker_checklists ctc
      WHERE ctc.sales_order_id = soi.sales_order_id
        AND ctc.checklist_key = 'calibration_completed'
        AND ctc.is_checked
        AND ctc.checked_at IS NOT NULL
      ORDER BY ctc.checked_at DESC
      LIMIT 1
    ) AS completed_at
  INTO v_row
  FROM public.sales_order_items soi
  JOIN public.sales_order_headers soh ON soh.id = soi.sales_order_id
  LEFT JOIN public.customers c ON c.id = soh.customer_id
  WHERE soi.certificate_number = trim(p_number)
    AND (NOT v_full OR soi.certificate_verify_token IS NULL OR soi.certificate_verify_token = trim(p_token))
  LIMIT 1;

  IF v_row IS NULL THEN
    INSERT INTO public.certificate_verification_logs (certificate_number, result)
    VALUES (p_number, 'not_found');
    RETURN QUERY SELECT 'not_found'::text, trim(p_number),
      NULL::timestamptz, NULL::timestamptz, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  -- Issue date shown on the printed certificate = when calibration was completed
  v_issued := COALESCE(v_row.completed_at, v_row.certificate_issued_at);
  -- Validity is counted from the manual calibration date when provided
  v_base := COALESCE(v_row.calibration_date::timestamptz, v_issued);
  v_expires := v_base + make_interval(months => v_row.validity_months);

  IF v_row.certificate_revoked_at IS NOT NULL THEN
    v_status := 'revoked';
  ELSIF v_expires IS NOT NULL AND now() > v_expires THEN
    v_status := 'expired';
  ELSE
    v_status := 'valid';
  END IF;

  INSERT INTO public.certificate_verification_logs (certificate_number, result)
  VALUES (p_number, v_status);

  RETURN QUERY SELECT
    v_status,
    v_row.cn,
    v_issued,
    v_expires,
    v_row.instrument_name,
    CASE WHEN v_full THEN v_row.instrument_brand_model ELSE NULL END,
    CASE WHEN v_full THEN v_row.instrument_serial_number ELSE NULL END,
    CASE WHEN v_full THEN v_row.measurement_range ELSE NULL END,
    CASE WHEN v_full THEN v_row.calibration_method ELSE NULL END,
    CASE WHEN v_full THEN v_row.sales_order_number ELSE NULL END,
    CASE WHEN v_full THEN v_row.spk_number ELSE NULL END,
    CASE WHEN v_full THEN v_row.customer_name ELSE NULL END,
    v_row.certificate_revoked_at,
    CASE WHEN v_full THEN v_row.certificate_revoked_reason ELSE NULL END;
END;
$function$;