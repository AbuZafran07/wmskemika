
-- 1) Dedup table for daily expiry reminders
CREATE TABLE IF NOT EXISTS public.certificate_expiry_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.sales_order_items(id) ON DELETE CASCADE,
  threshold_days integer NOT NULL,
  sent_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, threshold_days, sent_date)
);

GRANT SELECT ON public.certificate_expiry_notifications TO authenticated;
GRANT ALL ON public.certificate_expiry_notifications TO service_role;

ALTER TABLE public.certificate_expiry_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cert_expiry_notif_admin_read"
  ON public.certificate_expiry_notifications
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role]));

-- 2) Rebuild verify_certificate to include expires_at + expired status
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_expires timestamptz;
  v_status text;
BEGIN
  IF p_number IS NULL OR length(trim(p_number)) = 0 THEN
    RETURN;
  END IF;

  SELECT i.id, i.certificate_number AS cn, i.certificate_issued_at,
         i.instrument_name, i.instrument_brand_model, i.instrument_serial_number,
         i.measurement_range, i.calibration_method,
         i.certificate_revoked_at, i.certificate_revoked_reason,
         h.sales_order_number, h.spk_number,
         c.name AS customer_name
    INTO v_item
    FROM public.sales_order_items i
    JOIN public.sales_order_headers h ON h.id = i.sales_order_id
    LEFT JOIN public.customers c ON c.id = h.customer_id
   WHERE i.certificate_number = p_number
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_expires := v_item.certificate_issued_at + interval '1 year';

  IF v_item.certificate_revoked_at IS NOT NULL THEN
    v_status := 'revoked';
  ELSIF v_item.certificate_issued_at IS NOT NULL AND now() > v_expires THEN
    v_status := 'expired';
  ELSE
    v_status := 'valid';
  END IF;

  RETURN QUERY SELECT
    v_status,
    v_item.cn,
    v_item.certificate_issued_at,
    v_expires,
    v_item.instrument_name,
    v_item.instrument_brand_model,
    v_item.instrument_serial_number,
    v_item.measurement_range,
    v_item.calibration_method,
    v_item.sales_order_number,
    v_item.spk_number,
    v_item.customer_name,
    v_item.certificate_revoked_at,
    v_item.certificate_revoked_reason;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;
