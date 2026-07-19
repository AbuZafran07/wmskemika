
-- Calibration labels
CREATE TABLE IF NOT EXISTS public.calibration_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_labels TO authenticated;
GRANT ALL ON public.calibration_labels TO service_role;
ALTER TABLE public.calibration_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_labels_read" ON public.calibration_labels FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','purchasing','finance']::app_role[]));

CREATE POLICY "cal_labels_manage_super" ON public.calibration_labels FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Card labels: link sales_order_headers (calibration) <-> calibration_labels
CREATE TABLE IF NOT EXISTS public.calibration_card_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.calibration_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(sales_order_id, label_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calibration_card_labels TO authenticated;
GRANT ALL ON public.calibration_card_labels TO service_role;
ALTER TABLE public.calibration_card_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_card_labels_read" ON public.calibration_card_labels FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','purchasing','finance']::app_role[]));

CREATE POLICY "cal_card_labels_write" ON public.calibration_card_labels FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','purchasing','finance']::app_role[]));

CREATE POLICY "cal_card_labels_delete" ON public.calibration_card_labels FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse','purchasing','finance']::app_role[]));
