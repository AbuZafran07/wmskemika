CREATE OR REPLACE FUNCTION public.verify_certificate(p_number text, p_token text)
RETURNS TABLE(
  status text, certificate_number text, certificate_issued_at timestamptz,
  expires_at timestamptz, instrument_name text, brand_model text,
  serial_number text, measurement_range text, calibration_method text,
  sales_order_number text, spk_number text, customer_name text,
  revoked_at timestamptz, revoked_reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_row record;
  v_expires timestamptz;
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
  WHERE soi.certificate_number = trim(p_number)
    AND soi.certificate_number IS NOT NULL
    AND (
      v_full = false
      OR (soi.certificate_verify_token IS NOT NULL AND soi.certificate_verify_token = p_token)
    )
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