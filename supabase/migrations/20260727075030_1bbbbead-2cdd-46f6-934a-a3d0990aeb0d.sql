
-- 1. Add revoke columns to sales_order_items
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS certificate_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS certificate_revoked_reason text,
  ADD COLUMN IF NOT EXISTS certificate_revoked_by uuid;

-- 2. Scan/verification log table
CREATE TABLE IF NOT EXISTS public.certificate_verification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_number text NOT NULL,
  result text NOT NULL, -- valid | revoked | not_found
  ip_address text,
  user_agent text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_verify_logs_number ON public.certificate_verification_logs (certificate_number);
CREATE INDEX IF NOT EXISTS idx_cert_verify_logs_scanned ON public.certificate_verification_logs (scanned_at DESC);

GRANT SELECT ON public.certificate_verification_logs TO authenticated;
GRANT ALL ON public.certificate_verification_logs TO service_role;

ALTER TABLE public.certificate_verification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cert_verify_logs_admin_read" ON public.certificate_verification_logs;
CREATE POLICY "cert_verify_logs_admin_read"
ON public.certificate_verification_logs
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role]));

-- 3. Recreate verify_certificate to include revoke status + log scan
DROP FUNCTION IF EXISTS public.verify_certificate(text);

CREATE OR REPLACE FUNCTION public.verify_certificate(p_number text)
RETURNS TABLE (
  status text,
  certificate_number text,
  certificate_issued_at timestamptz,
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
  v_result text;
  v_row record;
BEGIN
  SELECT
    soi.certificate_number,
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

  IF v_row.certificate_number IS NULL THEN
    v_result := 'not_found';
  ELSIF v_row.certificate_revoked_at IS NOT NULL THEN
    v_result := 'revoked';
  ELSE
    v_result := 'valid';
  END IF;

  INSERT INTO public.certificate_verification_logs (certificate_number, result)
  VALUES (p_number, v_result);

  IF v_result = 'not_found' THEN
    RETURN QUERY SELECT v_result, p_number, NULL::timestamptz, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text;
  ELSE
    RETURN QUERY SELECT
      v_result,
      v_row.certificate_number,
      v_row.certificate_issued_at,
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
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

-- 4. Revoke RPC
CREATE OR REPLACE FUNCTION public.revoke_certificate(p_item_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['super_admin'::app_role,'admin'::app_role,'finance'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient privileges');
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alasan revoke minimal 10 karakter');
  END IF;

  SELECT id, certificate_number, certificate_revoked_at, sales_order_id
  INTO v_row
  FROM public.sales_order_items
  WHERE id = p_item_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item tidak ditemukan');
  END IF;

  IF v_row.certificate_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sertifikat belum terbit');
  END IF;

  IF v_row.certificate_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sertifikat sudah di-revoke');
  END IF;

  UPDATE public.sales_order_items
  SET certificate_revoked_at = now(),
      certificate_revoked_reason = btrim(p_reason),
      certificate_revoked_by = v_uid,
      updated_at = now()
  WHERE id = p_item_id;

  v_email := public.get_user_email(v_uid);

  INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_uid, v_email, 'REVOKE', 'Calibration Certificate', 'sales_order_items', p_item_id,
    v_row.certificate_number,
    jsonb_build_object('reason', btrim(p_reason), 'revoked_at', now()));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_certificate(uuid, text) TO authenticated;
