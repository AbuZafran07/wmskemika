CREATE OR REPLACE FUNCTION public.trg_guard_sales_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.guard_role_write(ARRAY['super_admin','admin','sales','finance','warehouse']::app_role[]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;