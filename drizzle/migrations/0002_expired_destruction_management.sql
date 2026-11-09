CREATE TABLE public.expired_extend_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.inventory_batches(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  old_expired_date DATE NOT NULL,
  new_expired_date DATE NOT NULL,
  reason TEXT NOT NULL,
  extended_by UUID NOT NULL,
  extended_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT ON public.expired_extend_logs TO authenticated;
GRANT ALL ON public.expired_extend_logs TO service_role;
ALTER TABLE public.expired_extend_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authorized users can view extend logs" ON public.expired_extend_logs FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing']::app_role[]));

CREATE TABLE public.destruction_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bap_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  destruction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  rejected_reason TEXT,
  created_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE public.destruction_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destruction_order_id UUID NOT NULL REFERENCES public.destruction_orders(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.inventory_batches(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty_to_destroy INTEGER NOT NULL CHECK (qty_to_destroy > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT ON public.destruction_orders TO authenticated;
GRANT SELECT, INSERT ON public.destruction_order_items TO authenticated;
GRANT ALL ON public.destruction_orders TO service_role;
GRANT ALL ON public.destruction_order_items TO service_role;
ALTER TABLE public.destruction_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destruction_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view destruction orders" ON public.destruction_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can create destruction orders" ON public.destruction_orders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'pending' AND public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing']::app_role[]));
CREATE POLICY "Authenticated users can view destruction items" ON public.destruction_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can create destruction items" ON public.destruction_order_items FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing']::app_role[])
    AND EXISTS (SELECT 1 FROM public.destruction_orders d WHERE d.id = destruction_order_id AND d.status = 'pending'));

CREATE OR REPLACE FUNCTION public.generate_bap_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix TEXT := 'BAP/' || TO_CHAR(NOW(), 'YYYY') || '/' || TO_CHAR(NOW(), 'MM') || '/'; v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count FROM public.destruction_orders WHERE bap_number LIKE v_prefix || '%';
  RETURN v_prefix || LPAD(v_count::TEXT, 3, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.trg_guard_destruction_item_qty()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_on_hand INTEGER; v_pending INTEGER;
BEGIN
  SELECT qty_on_hand INTO v_on_hand FROM public.inventory_batches WHERE id = NEW.batch_id FOR UPDATE;
  IF v_on_hand IS NULL THEN RAISE EXCEPTION 'Batch tidak ditemukan'; END IF;
  SELECT COALESCE(SUM(doi.qty_to_destroy),0) INTO v_pending
  FROM public.destruction_order_items doi JOIN public.destruction_orders d ON d.id = doi.destruction_order_id
  WHERE doi.batch_id = NEW.batch_id AND d.status = 'pending' AND doi.id <> NEW.id;
  IF NEW.qty_to_destroy + v_pending > v_on_hand THEN
    RAISE EXCEPTION 'Qty pemusnahan melebihi stok tersedia (stok %, sudah diajukan di BAP pending %)', v_on_hand, v_pending;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_destruction_item_qty BEFORE INSERT OR UPDATE OF qty_to_destroy, batch_id
ON public.destruction_order_items FOR EACH ROW EXECUTE FUNCTION public.trg_guard_destruction_item_qty();

CREATE OR REPLACE FUNCTION public.approve_destruction_order(p_destruction_order_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item RECORD; v_user_id UUID := auth.uid(); v_on_hand INTEGER;
BEGIN
  IF NOT public.has_any_role(v_user_id, ARRAY['super_admin','admin']::app_role[]) THEN
    RAISE EXCEPTION 'Hanya admin/direktur yang bisa approve pemusnahan';
  END IF;
  UPDATE public.destruction_orders SET status='approved', approved_by=v_user_id, approved_at=NOW(), updated_at=NOW()
  WHERE id = p_destruction_order_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'BAP tidak ditemukan atau sudah diproses'; END IF;
  FOR v_item IN SELECT batch_id, product_id, qty_to_destroy FROM public.destruction_order_items WHERE destruction_order_id = p_destruction_order_id LOOP
    SELECT qty_on_hand INTO v_on_hand FROM public.inventory_batches WHERE id = v_item.batch_id FOR UPDATE;
    IF v_on_hand IS NULL OR v_on_hand < v_item.qty_to_destroy THEN
      RAISE EXCEPTION 'Stok batch tidak cukup untuk dimusnahkan (tersedia %, diminta %)', COALESCE(v_on_hand,0), v_item.qty_to_destroy;
    END IF;
    UPDATE public.inventory_batches SET qty_on_hand = qty_on_hand - v_item.qty_to_destroy, updated_at = NOW() WHERE id = v_item.batch_id;
    INSERT INTO public.stock_transactions (product_id, batch_id, transaction_type, quantity, reference_type, reference_id, created_by)
    VALUES (v_item.product_id, v_item.batch_id, 'adjustment', -v_item.qty_to_destroy, 'destruction_order', p_destruction_order_id, v_user_id);
  END LOOP;
  INSERT INTO public.audit_logs (user_id, action, module, ref_table, ref_id, new_data)
  SELECT v_user_id, 'APPROVE_DESTRUCTION', 'Stock Adjustment', 'destruction_orders', p_destruction_order_id,
    jsonb_build_object('bap_number', bap_number, 'status', 'approved')
  FROM public.destruction_orders WHERE id = p_destruction_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_destruction_order(p_destruction_order_id UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]) THEN
    RAISE EXCEPTION 'Hanya admin/direktur yang bisa reject pemusnahan';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Alasan penolakan wajib diisi'; END IF;
  UPDATE public.destruction_orders SET status='rejected', rejected_reason=p_reason, updated_at=NOW()
  WHERE id = p_destruction_order_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'BAP tidak ditemukan atau sudah diproses'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.extend_batch_expiry(p_batch_id UUID, p_new_expired_date DATE, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id UUID := auth.uid(); v_old DATE; v_product UUID;
BEGIN
  IF NOT public.has_any_role(v_user_id, ARRAY['super_admin','admin','finance','purchasing']::app_role[]) THEN
    RAISE EXCEPTION 'Tidak memiliki izin untuk memperpanjang tanggal expired';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Alasan perpanjangan wajib diisi'; END IF;
  IF p_new_expired_date <= CURRENT_DATE THEN RAISE EXCEPTION 'Tanggal expired baru harus setelah hari ini'; END IF;
  SELECT expired_date, product_id INTO v_old, v_product FROM public.inventory_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Batch tidak ditemukan'; END IF;
  UPDATE public.inventory_batches SET expired_date = p_new_expired_date, updated_at = NOW() WHERE id = p_batch_id;
  INSERT INTO public.expired_extend_logs (batch_id, product_id, old_expired_date, new_expired_date, reason, extended_by)
  VALUES (p_batch_id, v_product, COALESCE(v_old, CURRENT_DATE), p_new_expired_date, p_reason, v_user_id);
END; $$;