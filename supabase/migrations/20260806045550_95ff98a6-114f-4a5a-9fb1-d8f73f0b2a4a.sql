CREATE OR REPLACE FUNCTION public.enforce_sales_pulse_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sales_pulse_reference_number IS NULL
       OR btrim(NEW.sales_pulse_reference_number) = '' THEN
      RAISE EXCEPTION 'Nomor Referensi SalesPulse wajib diisi sebelum menyimpan Sales Order'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only enforce when the reference itself is being changed.
  -- Legacy orders created before this rule keep working (status changes allowed).
  IF NEW.sales_pulse_reference_number IS DISTINCT FROM OLD.sales_pulse_reference_number
     AND (NEW.sales_pulse_reference_number IS NULL
          OR btrim(NEW.sales_pulse_reference_number) = '') THEN
    RAISE EXCEPTION 'Nomor Referensi SalesPulse tidak boleh dikosongkan'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.sales_pulse_reference_number IS NOT NULL
     AND btrim(OLD.sales_pulse_reference_number) <> ''
     AND (NEW.sales_pulse_reference_number IS NULL
          OR btrim(NEW.sales_pulse_reference_number) = '') THEN
    RAISE EXCEPTION 'Nomor Referensi SalesPulse tidak boleh dikosongkan'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;