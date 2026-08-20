-- 1) Kolom baru
ALTER TABLE public.plan_order_headers
  ADD COLUMN IF NOT EXISTS short_close_reason text,
  ADD COLUMN IF NOT EXISTS short_close_requested_by uuid,
  ADD COLUMN IF NOT EXISTS short_close_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS short_close_create_followup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS short_close_approved_by uuid,
  ADD COLUMN IF NOT EXISTS short_close_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS short_close_rejected_reason text,
  ADD COLUMN IF NOT EXISTS short_close_followup_plan_order_id uuid;

-- 2) Status baru
ALTER TABLE public.plan_order_headers DROP CONSTRAINT IF EXISTS plan_order_headers_status_check;
ALTER TABLE public.plan_order_headers ADD CONSTRAINT plan_order_headers_status_check
  CHECK (status = ANY (ARRAY['draft'::text,'approved'::text,'partially_received'::text,'received'::text,'cancelled'::text,'revision_requested'::text,'pending'::text,'short_close_requested'::text]));

-- 3) Ajukan short close
CREATE OR REPLACE FUNCTION public.plan_order_request_short_close(
  order_id uuid,
  reason text,
  create_followup boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.plan_order_headers;
  v_remaining int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['super_admin','admin','purchasing']::app_role[]) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized: required role missing');
  END IF;

  IF reason IS NULL OR length(btrim(reason)) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Alasan minimal 20 karakter');
  END IF;

  SELECT * INTO v_order FROM public.plan_order_headers WHERE id = order_id AND COALESCE(is_deleted,false) = false;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Plan order tidak ditemukan');
  END IF;

  IF v_order.status <> 'partially_received' THEN
    RETURN json_build_object('success', false, 'error', 'Hanya PO berstatus Diterima Sebagian yang bisa ditutup');
  END IF;

  SELECT COALESCE(SUM(GREATEST(planned_qty - qty_received, 0)), 0) INTO v_remaining
  FROM public.plan_order_items WHERE plan_order_id = order_id;

  IF v_remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Tidak ada sisa qty pada PO ini');
  END IF;

  UPDATE public.plan_order_headers
  SET status = 'short_close_requested',
      short_close_reason = btrim(reason),
      short_close_requested_by = v_uid,
      short_close_requested_at = now(),
      short_close_create_followup = COALESCE(create_followup, false),
      short_close_approved_by = NULL,
      short_close_approved_at = NULL,
      short_close_rejected_reason = NULL,
      updated_at = now()
  WHERE id = order_id;

  INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_uid, public.get_my_email(), 'short_close_request', 'plan_order', 'plan_order_headers', order_id, v_order.plan_number,
          json_build_object('status', v_order.status),
          json_build_object('status', 'short_close_requested', 'reason', btrim(reason), 'create_followup', COALESCE(create_followup,false), 'qty_remaining_total', v_remaining));

  RETURN json_build_object('success', true);
END;
$$;

-- 4) Setujui short close
CREATE OR REPLACE FUNCTION public.plan_order_approve_short_close(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.plan_order_headers;
  v_total numeric := 0;
  v_grand numeric := 0;
  v_new_id uuid;
  v_new_number text;
  v_seq int;
  v_followup_count int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['super_admin','finance']::app_role[]) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized: hanya Finance atau Super Admin');
  END IF;

  SELECT * INTO v_order FROM public.plan_order_headers WHERE id = order_id AND COALESCE(is_deleted,false) = false;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Plan order tidak ditemukan');
  END IF;

  IF v_order.status <> 'short_close_requested' THEN
    RETURN json_build_object('success', false, 'error', 'Tidak ada pengajuan tutup sisa PO pada dokumen ini');
  END IF;

  -- Buat PO lanjutan (draft) untuk sisa bila diminta
  IF COALESCE(v_order.short_close_create_followup, false) THEN
    SELECT COUNT(*) INTO v_followup_count
    FROM public.plan_order_items
    WHERE plan_order_id = order_id AND (planned_qty - qty_received) > 0;

    IF v_followup_count > 0 THEN
      SELECT COALESCE(MAX(split_part(plan_number, '.', 2)::int), 0) + 1 INTO v_seq
      FROM public.plan_order_headers
      WHERE plan_number LIKE 'PO/' || to_char(now(), 'YYYYMMDD') || '.%';

      v_new_number := 'PO/' || to_char(now(), 'YYYYMMDD') || '.' || lpad(v_seq::text, 2, '0');

      INSERT INTO public.plan_order_headers (
        plan_number, plan_date, supplier_id, expected_delivery_date, notes, status,
        discount, tax_rate, shipping_cost, created_by, reference_no
      ) VALUES (
        v_new_number, CURRENT_DATE, v_order.supplier_id, v_order.expected_delivery_date,
        'Lanjutan sisa dari ' || v_order.plan_number || COALESCE(' — ' || v_order.short_close_reason, ''),
        'draft', 0, COALESCE(v_order.tax_rate, 0), 0, v_uid, v_order.reference_no
      ) RETURNING id INTO v_new_id;

      INSERT INTO public.plan_order_items (plan_order_id, product_id, unit_price, planned_qty, notes)
      SELECT v_new_id, product_id, unit_price, (planned_qty - qty_received), notes
      FROM public.plan_order_items
      WHERE plan_order_id = order_id AND (planned_qty - qty_received) > 0;

      SELECT COALESCE(SUM(unit_price * planned_qty), 0) INTO v_total
      FROM public.plan_order_items WHERE plan_order_id = v_new_id;

      UPDATE public.plan_order_headers
      SET total_amount = v_total,
          grand_total = ROUND((v_total * (1 + COALESCE(tax_rate,0)/100.0))::numeric, 2)
      WHERE id = v_new_id;
    END IF;
  END IF;

  -- Sesuaikan qty pesanan = qty diterima
  UPDATE public.plan_order_items
  SET planned_qty = qty_received
  WHERE plan_order_id = order_id AND planned_qty <> qty_received;

  DELETE FROM public.plan_order_items
  WHERE plan_order_id = order_id AND planned_qty = 0;

  SELECT COALESCE(SUM(unit_price * planned_qty), 0) INTO v_total
  FROM public.plan_order_items WHERE plan_order_id = order_id;

  v_grand := ROUND(
    (((v_total - COALESCE(v_order.discount, 0)) * (1 + COALESCE(v_order.tax_rate, 0)/100.0)) + COALESCE(v_order.shipping_cost, 0))::numeric
  , 2);
  IF v_grand < 0 THEN v_grand := 0; END IF;

  UPDATE public.plan_order_headers
  SET status = 'received',
      total_amount = v_total,
      grand_total = v_grand,
      short_close_approved_by = v_uid,
      short_close_approved_at = now(),
      short_close_followup_plan_order_id = v_new_id,
      updated_at = now()
  WHERE id = order_id;

  INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_uid, public.get_my_email(), 'short_close_approve', 'plan_order', 'plan_order_headers', order_id, v_order.plan_number,
          json_build_object('status', v_order.status, 'total_amount', v_order.total_amount, 'grand_total', v_order.grand_total),
          json_build_object('status', 'received', 'total_amount', v_total, 'grand_total', v_grand,
                            'reason', v_order.short_close_reason, 'followup_plan_order_id', v_new_id, 'followup_plan_number', v_new_number));

  RETURN json_build_object('success', true, 'followup_plan_number', v_new_number, 'followup_id', v_new_id);
END;
$$;

-- 5) Tolak short close
CREATE OR REPLACE FUNCTION public.plan_order_reject_short_close(order_id uuid, reject_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.plan_order_headers;
BEGIN
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['super_admin','finance']::app_role[]) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized: hanya Finance atau Super Admin');
  END IF;

  IF reject_reason IS NULL OR length(btrim(reject_reason)) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Alasan penolakan minimal 20 karakter');
  END IF;

  SELECT * INTO v_order FROM public.plan_order_headers WHERE id = order_id AND COALESCE(is_deleted,false) = false;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Plan order tidak ditemukan');
  END IF;

  IF v_order.status <> 'short_close_requested' THEN
    RETURN json_build_object('success', false, 'error', 'Tidak ada pengajuan tutup sisa PO pada dokumen ini');
  END IF;

  UPDATE public.plan_order_headers
  SET status = 'partially_received',
      short_close_rejected_reason = btrim(reject_reason),
      short_close_approved_by = NULL,
      short_close_approved_at = NULL,
      updated_at = now()
  WHERE id = order_id;

  INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_uid, public.get_my_email(), 'short_close_reject', 'plan_order', 'plan_order_headers', order_id, v_order.plan_number,
          json_build_object('status', v_order.status, 'reason', v_order.short_close_reason),
          json_build_object('status', 'partially_received', 'rejected_reason', btrim(reject_reason)));

  RETURN json_build_object('success', true);
END;
$$;