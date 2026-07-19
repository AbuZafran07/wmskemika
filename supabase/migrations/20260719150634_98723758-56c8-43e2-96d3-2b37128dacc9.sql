
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

  v_dpp := v_gross - v_disc;
  v_dpp_p := ROUND(v_dpp * 11 / 12);
  v_tax := ROUND(v_dpp_p * 12 / 100);
  v_grand := v_dpp + v_tax + v_ship + v_sp;

  UPDATE public.sales_order_headers
     SET total_amount = v_dpp,
         grand_total = v_grand
   WHERE id = _order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_so_totals_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_sales_order_totals(OLD.sales_order_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_sales_order_totals(NEW.sales_order_id);
    IF TG_OP = 'UPDATE' AND NEW.sales_order_id <> OLD.sales_order_id THEN
      PERFORM public.recompute_sales_order_totals(OLD.sales_order_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_so_items_recompute ON public.sales_order_items;
CREATE TRIGGER trg_so_items_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_so_totals_from_items();

CREATE OR REPLACE FUNCTION public.trg_recompute_so_totals_from_spareparts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_old_order_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT sales_order_id INTO v_order_id FROM public.sales_order_items WHERE id = OLD.instrument_id;
    IF v_order_id IS NOT NULL THEN
      PERFORM public.recompute_sales_order_totals(v_order_id);
    END IF;
    RETURN OLD;
  ELSE
    SELECT sales_order_id INTO v_order_id FROM public.sales_order_items WHERE id = NEW.instrument_id;
    IF v_order_id IS NOT NULL THEN
      PERFORM public.recompute_sales_order_totals(v_order_id);
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.instrument_id <> OLD.instrument_id THEN
      SELECT sales_order_id INTO v_old_order_id FROM public.sales_order_items WHERE id = OLD.instrument_id;
      IF v_old_order_id IS NOT NULL AND v_old_order_id <> v_order_id THEN
        PERFORM public.recompute_sales_order_totals(v_old_order_id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sp_recompute ON public.calibration_spare_parts;
CREATE TRIGGER trg_sp_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.calibration_spare_parts
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_so_totals_from_spareparts();

CREATE OR REPLACE FUNCTION public.trg_recompute_so_totals_from_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.discount,0) IS DISTINCT FROM COALESCE(OLD.discount,0)
     OR COALESCE(NEW.shipping_cost,0) IS DISTINCT FROM COALESCE(OLD.shipping_cost,0)
     OR COALESCE(NEW.order_type,'') IS DISTINCT FROM COALESCE(OLD.order_type,'') THEN
    PERFORM public.recompute_sales_order_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_so_header_recompute ON public.sales_order_headers;
CREATE TRIGGER trg_so_header_recompute
AFTER UPDATE OF discount, shipping_cost, order_type ON public.sales_order_headers
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_so_totals_from_header();

-- Backfill all existing sales orders
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.sales_order_headers LOOP
    PERFORM public.recompute_sales_order_totals(r.id);
  END LOOP;
END $$;
