-- Fitur Manajemen Barang Expired di Stock Adjustment
-- Aditif: 2 tabel baru (expired_extend_logs, destruction_orders + items),
-- fungsi generate nomor BAP, fungsi approve/reject BAP, dan fungsi extend
-- expiry batch (RPC, karena role finance/purchasing tidak punya hak UPDATE
-- langsung ke inventory_batches — lihat catatan di bawah).

-- ============================================
-- 1. Tabel expired_extend_logs
-- ============================================
CREATE TABLE public.expired_extend_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.inventory_batches(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  old_expired_date DATE NOT NULL,
  new_expired_date DATE NOT NULL,
  reason TEXT NOT NULL,
  extended_by UUID NOT NULL REFERENCES auth.users(id),
  extended_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.expired_extend_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can manage extend logs"
  ON public.expired_extend_logs FOR ALL
  TO authenticated
  USING (
    has_any_role(auth.uid(),
      ARRAY['super_admin','admin','finance','purchasing']::app_role[])
  );

-- ============================================
-- 2. Tabel destruction_orders (Berita Acara Pemusnahan / BAP)
-- ============================================
CREATE TABLE public.destruction_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bap_number TEXT UNIQUE NOT NULL,         -- BAP/YYYY/MM/NNN
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  destruction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  rejected_reason TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.destruction_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destruction_order_id UUID NOT NULL
    REFERENCES public.destruction_orders(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.inventory_batches(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty_to_destroy INTEGER NOT NULL CHECK (qty_to_destroy > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.destruction_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destruction_order_items ENABLE ROW LEVEL SECURITY;

-- Semua authenticated bisa lihat daftar BAP
CREATE POLICY "Authenticated users can view destruction orders"
  ON public.destruction_orders FOR SELECT TO authenticated USING (true);

-- Finance, purchasing, super_admin, admin bisa buat BAP
CREATE POLICY "Authorized users can create destruction orders"
  ON public.destruction_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(),
      ARRAY['super_admin','admin','finance','purchasing']::app_role[])
  );

-- Super_admin & admin bisa approve/reject (direktur pakai role ini)
CREATE POLICY "Admins can approve destruction orders"
  ON public.destruction_orders FOR UPDATE
  TO authenticated
  USING (
    has_any_role(auth.uid(),
      ARRAY['super_admin','admin']::app_role[])
  );

-- Semua authenticated bisa lihat item BAP (dipakai saat embed di tab Riwayat
-- BAP agar ringkasan produk tidak kosong untuk role selain finance/purchasing)
CREATE POLICY "Authenticated users can view destruction items"
  ON public.destruction_order_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized users can manage destruction items"
  ON public.destruction_order_items FOR ALL
  TO authenticated
  USING (
    has_any_role(auth.uid(),
      ARRAY['super_admin','admin','finance','purchasing']::app_role[])
  );

-- Function: generate nomor BAP otomatis (BAP/2026/11/001)
CREATE OR REPLACE FUNCTION public.generate_bap_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT := TO_CHAR(NOW(), 'YYYY');
  v_month TEXT := TO_CHAR(NOW(), 'MM');
  v_count INTEGER;
  v_number TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.destruction_orders
  WHERE bap_number LIKE 'BAP/' || v_year || '/' || v_month || '/%';

  v_number := 'BAP/' || v_year || '/' || v_month || '/' ||
              LPAD(v_count::TEXT, 3, '0');
  RETURN v_number;
END;
$$;

-- Function: approve BAP -> kurangi stok inventory_batches
CREATE OR REPLACE FUNCTION public.approve_destruction_order(
  p_destruction_order_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Pastikan hanya super_admin atau admin yang bisa approve
  IF NOT has_any_role(v_user_id, ARRAY['super_admin','admin']::app_role[]) THEN
    RAISE EXCEPTION 'Hanya admin/direktur yang bisa approve pemusnahan';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.destruction_orders
    WHERE id = p_destruction_order_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'BAP tidak ditemukan atau sudah diproses';
  END IF;

  -- Update status BAP
  UPDATE public.destruction_orders
  SET status = 'approved',
      approved_by = v_user_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_destruction_order_id
    AND status = 'pending';

  -- Kurangi stok tiap batch yang dimusnahkan
  FOR v_item IN
    SELECT doi.batch_id, doi.product_id, doi.qty_to_destroy
    FROM public.destruction_order_items doi
    WHERE doi.destruction_order_id = p_destruction_order_id
  LOOP
    -- Kurangi qty_on_hand di inventory_batches
    UPDATE public.inventory_batches
    SET qty_on_hand = GREATEST(0, qty_on_hand - v_item.qty_to_destroy),
        updated_at = NOW()
    WHERE id = v_item.batch_id;

    -- Catat stock_transaction tipe adjustment (qty negatif)
    INSERT INTO public.stock_transactions (
      product_id, batch_id, transaction_type,
      quantity, reference_type, reference_id
    ) VALUES (
      v_item.product_id, v_item.batch_id, 'adjustment',
      -v_item.qty_to_destroy, 'destruction_order', p_destruction_order_id
    );
  END LOOP;

  -- Audit log
  INSERT INTO public.audit_logs (
    user_id, action, module, ref_table, ref_id,
    new_data
  ) SELECT
    v_user_id, 'APPROVE_DESTRUCTION', 'Stock Adjustment',
    'destruction_orders', p_destruction_order_id,
    jsonb_build_object('bap_number', bap_number, 'status', 'approved')
  FROM public.destruction_orders
  WHERE id = p_destruction_order_id;
END;
$$;

-- Function: reject BAP
CREATE OR REPLACE FUNCTION public.reject_destruction_order(
  p_destruction_order_id UUID,
  p_reason TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]) THEN
    RAISE EXCEPTION 'Hanya admin/direktur yang bisa reject pemusnahan';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi';
  END IF;

  UPDATE public.destruction_orders
  SET status = 'rejected',
      rejected_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_destruction_order_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BAP tidak ditemukan atau sudah diproses';
  END IF;
END;
$$;

-- Function: extend batch expiry (RPC, bukan direct UPDATE client-side)
--
-- CATATAN: Role finance & purchasing TIDAK termasuk dalam policy
-- "Authorized users can manage inventory" (hanya super_admin/admin/warehouse
-- yang boleh UPDATE langsung ke inventory_batches). Supaya tombol "Extend"
-- berfungsi untuk Finance/Purchasing seperti diminta, aksi ini dibungkus
-- RPC SECURITY DEFINER dengan pengecekan role sendiri, bukan UPDATE
-- langsung dari client.
CREATE OR REPLACE FUNCTION public.extend_batch_expiry(
  p_batch_id UUID,
  p_new_expired_date DATE,
  p_reason TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_old_expired_date DATE;
  v_product_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF NOT has_any_role(v_user_id, ARRAY['super_admin','admin','finance','purchasing']::app_role[]) THEN
    RAISE EXCEPTION 'Tidak memiliki izin untuk memperpanjang tanggal expired';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Alasan perpanjangan wajib diisi';
  END IF;

  IF p_new_expired_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal expired baru harus setelah hari ini';
  END IF;

  SELECT expired_date, product_id INTO v_old_expired_date, v_product_id
  FROM public.inventory_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_old_expired_date IS NULL THEN
    RAISE EXCEPTION 'Batch tidak ditemukan';
  END IF;

  UPDATE public.inventory_batches
  SET expired_date = p_new_expired_date, updated_at = NOW()
  WHERE id = p_batch_id;

  INSERT INTO public.expired_extend_logs (
    batch_id, product_id, old_expired_date, new_expired_date, reason, extended_by
  ) VALUES (
    p_batch_id, v_product_id, v_old_expired_date, p_new_expired_date, p_reason, v_user_id
  );
END;
$$;
