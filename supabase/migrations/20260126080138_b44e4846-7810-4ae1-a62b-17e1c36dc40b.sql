-- Fix validate_uuid_exists function to eliminate dynamic SQL injection risk
-- Replace format() + EXECUTE with explicit CASE statement for each allowed table

CREATE OR REPLACE FUNCTION public.validate_uuid_exists(table_name text, uuid_val uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  exists_check boolean := false;
BEGIN
  IF uuid_val IS NULL THEN
    RETURN false;
  END IF;
  
  -- Use explicit CASE statement instead of dynamic SQL to prevent any SQL injection risk
  CASE table_name
    WHEN 'products' THEN
      SELECT EXISTS(SELECT 1 FROM public.products WHERE id = uuid_val) INTO exists_check;
    WHEN 'suppliers' THEN
      SELECT EXISTS(SELECT 1 FROM public.suppliers WHERE id = uuid_val) INTO exists_check;
    WHEN 'customers' THEN
      SELECT EXISTS(SELECT 1 FROM public.customers WHERE id = uuid_val) INTO exists_check;
    WHEN 'inventory_batches' THEN
      SELECT EXISTS(SELECT 1 FROM public.inventory_batches WHERE id = uuid_val) INTO exists_check;
    WHEN 'plan_order_headers' THEN
      SELECT EXISTS(SELECT 1 FROM public.plan_order_headers WHERE id = uuid_val) INTO exists_check;
    WHEN 'sales_order_headers' THEN
      SELECT EXISTS(SELECT 1 FROM public.sales_order_headers WHERE id = uuid_val) INTO exists_check;
    WHEN 'plan_order_items' THEN
      SELECT EXISTS(SELECT 1 FROM public.plan_order_items WHERE id = uuid_val) INTO exists_check;
    WHEN 'sales_order_items' THEN
      SELECT EXISTS(SELECT 1 FROM public.sales_order_items WHERE id = uuid_val) INTO exists_check;
    ELSE
      -- Unknown table - return false for security
      RETURN false;
  END CASE;
  
  RETURN exists_check;
END;
$function$;