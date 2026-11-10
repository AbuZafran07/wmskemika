CREATE OR REPLACE FUNCTION public.recompute_sales_order_totals(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
 v_gross numeric := 0; v_disc numeric := 0; v_ship numeric := 0;
 v_order_type text; v_sp numeric := 0; v_dpp numeric := 0;
 v_dpp_p numeric := 0; v_tax numeric := 0; v_grand numeric := 0; v_tax_rate numeric := 0;
BEGIN
 IF _order_id IS NULL THEN RAISE EXCEPTION 'Sales Order wajib diisi'; END IF;
 SELECT COALESCE(discount,0), COALESCE(shipping_cost,0), order_type, COALESCE(tax_rate,0)
 INTO v_disc,v_ship,v_order_type,v_tax_rate FROM public.sales_order_headers WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT COALESCE(SUM(COALESCE(ordered_qty,0)*COALESCE(unit_price,0)),0)
 INTO v_gross FROM public.sales_order_items WHERE sales_order_id=_order_id;
 IF v_order_type='calibration' THEN
  SELECT COALESCE(SUM(COALESCE(sp.qty_used,0)*COALESCE(sp.unit_price,0)),0) INTO v_sp
  FROM public.calibration_spare_parts sp JOIN public.sales_order_items i ON i.id=sp.instrument_id WHERE i.sales_order_id=_order_id;
 END IF;
 v_dpp := (v_gross+v_sp)-v_disc;
 IF v_tax_rate > 0 THEN v_dpp_p := ROUND(v_dpp*11/12); v_tax := ROUND(v_dpp_p*12/100); END IF;
 v_grand := v_dpp+v_tax+v_ship;
 UPDATE public.sales_order_headers SET total_amount=v_dpp,grand_total=v_grand WHERE id=_order_id;
END; $$;
CREATE OR REPLACE FUNCTION public.trg_recompute_so_totals_from_header()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
 IF COALESCE(NEW.discount,0) IS DISTINCT FROM COALESCE(OLD.discount,0)
 OR COALESCE(NEW.shipping_cost,0) IS DISTINCT FROM COALESCE(OLD.shipping_cost,0)
 OR COALESCE(NEW.order_type,'') IS DISTINCT FROM COALESCE(OLD.order_type,'')
 OR COALESCE(NEW.tax_rate,0) IS DISTINCT FROM COALESCE(OLD.tax_rate,0) THEN
 PERFORM public.recompute_sales_order_totals(NEW.id);
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_so_header_recompute ON public.sales_order_headers;
CREATE TRIGGER trg_so_header_recompute AFTER UPDATE OF discount,shipping_cost,order_type,tax_rate ON public.sales_order_headers FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_so_totals_from_header();
CREATE OR REPLACE FUNCTION public.trg_pi_tax_snapshot_from_so()
RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE v_source_tax numeric;
BEGIN
 SELECT COALESCE(tax_rate,0) INTO v_source_tax FROM public.sales_order_headers WHERE id=NEW.sales_order_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order tidak ditemukan atau tidak dapat diakses'; END IF;
 NEW.tax_rate := CASE WHEN v_source_tax > 0 THEN 12 ELSE 0 END;
 NEW.tax_amount := CASE WHEN v_source_tax > 0 THEN ROUND(ROUND(NEW.subtotal*11/12)*12/100) ELSE 0 END;
 NEW.grand_total := ROUND(NEW.subtotal+NEW.tax_amount+COALESCE(NEW.shipping_cost,0)+COALESCE(NEW.other_costs,0)+COALESCE(NEW.materai_amount,0));
 RETURN NEW;
END; $$;
CREATE TRIGGER trg_pi_tax_snapshot_from_so BEFORE INSERT ON public.proforma_invoices FOR EACH ROW EXECUTE FUNCTION public.trg_pi_tax_snapshot_from_so();