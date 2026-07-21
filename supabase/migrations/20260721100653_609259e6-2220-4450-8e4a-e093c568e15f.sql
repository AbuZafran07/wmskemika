CREATE OR REPLACE FUNCTION public.trg_guard_stock_out_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_order_type text;
  v_remaining bigint;
BEGIN
  SELECT status, COALESCE(order_type, 'regular')
    INTO v_status, v_order_type
  FROM public.sales_order_headers
  WHERE id = NEW.sales_order_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Sales Order tidak ditemukan.' USING ERRCODE = 'P0001';
  END IF;

  IF v_status IN ('draft','cancelled','rejected','revision_requested','pending_approval') THEN
    RAISE EXCEPTION 'Tidak dapat membuat Stock Out: status SO "%" tidak mengizinkan pengiriman.', v_status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_order_type = 'calibration' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(GREATEST(soi.ordered_qty - COALESCE(soi.qty_delivered, 0), 0)), 0)
    INTO v_remaining
  FROM public.sales_order_items soi
  WHERE soi.sales_order_id = NEW.sales_order_id;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'SO ini sudah fully delivered. Stock Out baru ditolak untuk mencegah duplikasi.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;