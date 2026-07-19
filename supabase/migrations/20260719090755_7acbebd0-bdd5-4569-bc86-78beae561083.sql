-- Enforce sales_pulse_reference_number wajib untuk SEMUA Sales Order (reguler + kalibrasi)
CREATE OR REPLACE FUNCTION public.enforce_sales_pulse_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sales_pulse_reference_number IS NULL
     OR btrim(NEW.sales_pulse_reference_number) = '' THEN
    RAISE EXCEPTION 'Nomor Referensi SalesPulse wajib diisi sebelum menyimpan Sales Order'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sales_pulse_reference ON public.sales_order_headers;
CREATE TRIGGER trg_enforce_sales_pulse_reference
BEFORE INSERT OR UPDATE OF sales_pulse_reference_number, status
ON public.sales_order_headers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_sales_pulse_reference();