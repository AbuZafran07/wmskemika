
DROP FUNCTION IF EXISTS public.verify_certificate(text);

CREATE OR REPLACE FUNCTION public.verify_certificate(p_number text)
RETURNS TABLE(
  status text,
  certificate_number text,
  certificate_issued_at timestamptz,
  expires_at timestamptz,
  instrument_name text,
  brand_model text,
  serial_number text,
  measurement_range text,
  calibration_method text,
  sales_order_number text,
  spk_number text,
  customer_name text,
  revoked_at timestamptz,
  revoked_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_expires timestamptz;
  v_status text;
BEGIN
  IF p_number IS NULL OR length(trim(p_number)) = 0 THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;
