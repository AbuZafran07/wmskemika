CREATE OR REPLACE FUNCTION public.trg_pi_tax_snapshot_from_so()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_source_tax numeric; v_type text;
BEGIN
 SELECT COALESCE(tax_rate,0), order_type INTO v_source_tax, v_type FROM public.sales_order_headers WHERE id=NEW.sales_order_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sales Order tidak ditemukan atau tidak dapat diakses'; END IF;
 IF v_type='calibration' THEN v_source_tax := 11; END IF;
 NEW.tax_rate := CASE WHEN v_source_tax > 0 THEN 12 ELSE 0 END;
 NEW.tax_amount := CASE WHEN v_source_tax > 0 THEN ROUND(ROUND(NEW.subtotal*11/12)*12/100) ELSE 0 END;
 NEW.grand_total := ROUND(NEW.subtotal+NEW.tax_amount+COALESCE(NEW.shipping_cost,0)+COALESCE(NEW.other_costs,0)+COALESCE(NEW.materai_amount,0));
 RETURN NEW;
END; $$;