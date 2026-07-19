
CREATE OR REPLACE FUNCTION public.recompute_sales_order_totals(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross numeric := 0;
  v_disc numeric := 0;
  v_ship numeric := 0;
  v_order_type text;
  v_sp numeric := 0;
  v_dpp numeric := 0;
  v_dpp_p numeric := 0;
  v_tax numeric := 0;
  v_grand numeric := 0;
BEGIN
  SELECT COALESCE(discount,0), COALESCE(shipping_cost,0), order_type
    INTO v_disc, v_ship, v_order_type
  FROM public.sales_order_headers WHERE id = _order_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(COALESCE(ordered_qty,0) * COALESCE(unit_price,0)), 0)
    INTO v_gross
  FROM public.sales_order_items WHERE sales_order_id = _order_id;

  IF v_order_type = 'calibration' THEN
    SELECT COALESCE(SUM(COALESCE(sp.qty_used,0) * COALESCE(sp.unit_price,0)), 0)
      INTO v_sp
    FROM public.calibration_spare_parts sp
    JOIN public.sales_order_items i ON i.id = sp.instrument_id
    WHERE i.sales_order_id = _order_id;
  END IF;

  -- Sparepart masuk ke DPP (kena pajak juga)
  v_dpp := (v_gross + v_sp) - v_disc;
  v_dpp_p := ROUND(v_dpp * 11 / 12);
  v_tax := ROUND(v_dpp_p * 12 / 100);
  v_grand := v_dpp + v_tax + v_ship;

  UPDATE public.sales_order_headers
     SET total_amount = v_dpp,
         grand_total = v_grand
   WHERE id = _order_id;
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.sales_order_headers LOOP
    PERFORM public.recompute_sales_order_totals(r.id);
  END LOOP;
END $$;
