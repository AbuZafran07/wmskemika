CREATE OR REPLACE FUNCTION public.trg_guard_plan_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow warehouse to update PO status when saving Stock In (partially_received/received)
  IF TG_OP = 'UPDATE' THEN
    PERFORM public.guard_role_write(ARRAY['super_admin','admin','purchasing','warehouse']::app_role[]);
  ELSE
    PERFORM public.guard_role_write(ARRAY['super_admin','admin','purchasing']::app_role[]);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;