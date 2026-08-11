CREATE OR REPLACE FUNCTION public.enforce_sales_pulse_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_sample boolean := lower(btrim(coalesce(NEW.allocation_type, ''))) = 'sample';
BEGIN
  IF v_is_sample THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.sales_pulse_reference_number IS NULL
       OR btrim(NEW.sales_pulse_reference_number) = '' THEN
      RAISE EXCEPTION 'Nomor Referensi SalesPulse wajib diisi sebelum menyimpan Sales Order'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

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
$function$;