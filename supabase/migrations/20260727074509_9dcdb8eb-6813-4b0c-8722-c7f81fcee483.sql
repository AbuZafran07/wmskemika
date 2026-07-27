
CREATE OR REPLACE FUNCTION public.verify_certificate(p_number text)
RETURNS TABLE (
  certificate_number text,
  certificate_issued_at timestamptz,
  instrument_name text,
  brand_model text,
  serial_number text,
  measurement_range text,
  calibration_method text,
  sales_order_number text,
  spk_number text,
  customer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    c.name AS customer_name
  FROM public.sales_order_items soi
  JOIN public.sales_order_headers soh ON soh.id = soi.sales_order_id
  LEFT JOIN public.customers c ON c.id = soh.customer_id
  WHERE soi.certificate_number = p_number
    AND soi.item_type = 'calibration'
    AND soi.certificate_number IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;
