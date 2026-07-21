
CREATE OR REPLACE FUNCTION public.trg_guard_stock_out_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Block if SO in a non-deliverable state
  IF v_status IN ('draft','cancelled','rejected','revision_requested','pending_approval') THEN
    RAISE EXCEPTION 'Tidak dapat membuat Stock Out: status SO "%" tidak mengizinkan pengiriman.', v_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Skip qty check for calibration SO (no delivery quantities)
  IF v_order_type = 'calibration' THEN
    RETURN NEW;
  END IF;

  -- Compute remaining qty across all items (only count active stock outs)
  SELECT COALESCE(SUM(GREATEST(soi.quantity - COALESCE(soi.qty_delivered, 0), 0)), 0)
    INTO v_remaining
  FROM public.sales_order_items soi
  WHERE soi.sales_order_header_id = NEW.sales_order_id;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'SO ini sudah fully delivered. Stock Out baru ditolak untuk mencegah duplikasi.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_stock_out_duplicate ON public.stock_out_headers;
CREATE TRIGGER guard_stock_out_duplicate
BEFORE INSERT ON public.stock_out_headers
FOR EACH ROW
EXECUTE FUNCTION public.trg_guard_stock_out_duplicate();
