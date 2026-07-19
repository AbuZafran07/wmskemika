
CREATE TABLE IF NOT EXISTS public.calibration_spare_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.sales_order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  qty_used numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  notes text,
  issued_stock_out_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calspare_instrument ON public.calibration_spare_parts(instrument_id);
CREATE INDEX IF NOT EXISTS idx_calspare_product ON public.calibration_spare_parts(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_spare_parts TO authenticated;
GRANT ALL ON public.calibration_spare_parts TO service_role;

ALTER TABLE public.calibration_spare_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calspare_select_roles" ON public.calibration_spare_parts FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales','purchasing','finance']::app_role[]));
CREATE POLICY "calspare_insert_roles" ON public.calibration_spare_parts FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales']::app_role[]));
CREATE POLICY "calspare_update_roles" ON public.calibration_spare_parts FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse','sales']::app_role[]));
CREATE POLICY "calspare_delete_roles" ON public.calibration_spare_parts FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','warehouse']::app_role[]));

CREATE TRIGGER trg_calspare_updated_at BEFORE UPDATE ON public.calibration_spare_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
