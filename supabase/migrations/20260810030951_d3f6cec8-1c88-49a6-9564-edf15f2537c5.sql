-- ============ TIER 1: Koreksi harga / diskon ============
CREATE OR REPLACE FUNCTION public.sales_order_revise_pricing(order_id uuid, reason text, items jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_so_number text;
  v_old jsonb;
  v_new jsonb;
  v_grand numeric;
  v_total numeric;
  v_it jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT has_any_role(v_uid, ARRAY['super_admin'::app_role]) THEN
    RETURN json_build_object('success', false, 'error', 'Hanya super_admin yang dapat mengoreksi harga');
  END IF;

  IF reason IS NULL OR length(trim(reason)) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Alasan minimal 20 karakter');
  END IF;

  SELECT sales_order_number INTO v_so_number
  FROM sales_order_headers
  WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);

  IF v_so_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF items IS NULL OR jsonb_typeof(items) <> 'array' OR jsonb_array_length(items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Tidak ada item untuk dikoreksi');
  END IF;

  SELECT jsonb_build_object(
           'header', (SELECT jsonb_build_object('total_amount', total_amount, 'grand_total', grand_total, 'status', status)
                        FROM sales_order_headers WHERE id = order_id),
           'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'unit_price', unit_price, 'discount', discount, 'ordered_qty', ordered_qty))
                        FROM sales_order_items WHERE sales_order_id = order_id), '[]'::jsonb))
    INTO v_old;

  FOR v_it IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    IF COALESCE((v_it->>'unit_price')::numeric, 0) < 0 OR COALESCE((v_it->>'discount')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Harga dan diskon tidak boleh negatif';
    END IF;

    UPDATE sales_order_items
       SET unit_price = COALESCE((v_it->>'unit_price')::numeric, unit_price),
           discount   = COALESCE((v_it->>'discount')::numeric, discount)
     WHERE id = (v_it->>'item_id')::uuid
       AND sales_order_id = order_id;
  END LOOP;

  PERFORM recompute_sales_order_totals(order_id);

  SELECT total_amount, grand_total INTO v_total, v_grand
  FROM sales_order_headers WHERE id = order_id;

  UPDATE sales_order_headers SET updated_at = now() WHERE id = order_id;

  SELECT jsonb_build_object(
           'header', jsonb_build_object('total_amount', v_total, 'grand_total', v_grand),
           'reason', trim(reason),
           'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'unit_price', unit_price, 'discount', discount, 'ordered_qty', ordered_qty))
                        FROM sales_order_items WHERE sales_order_id = order_id), '[]'::jsonb))
    INTO v_new;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_uid, get_user_email(v_uid), 'REVISE_PRICING', 'Sales Order', 'sales_order_headers', order_id, v_so_number, v_old, v_new);

  RETURN json_build_object('success', true, 'grand_total', v_grand, 'total_amount', v_total, 'sales_order_number', v_so_number);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$function$;

-- ============ TIER 2a: Paksa revisi qty (undo -> release -> revision_requested) ============
CREATE OR REPLACE FUNCTION public.sales_order_force_revision_qty(order_id uuid, reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_so_number text;
  v_status text;
  v_so record;
  v_res jsonb;
  v_res2 json;
  v_card_id uuid;
  v_delivered_snapshot jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT has_any_role(v_uid, ARRAY['super_admin'::app_role]) THEN
    RETURN json_build_object('success', false, 'error', 'Hanya super_admin yang dapat memaksa revisi qty');
  END IF;

  IF reason IS NULL OR length(trim(reason)) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Alasan minimal 20 karakter');
  END IF;

  SELECT sales_order_number, status INTO v_so_number, v_status
  FROM sales_order_headers
  WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);

  IF v_so_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_status NOT IN ('delivered', 'partially_delivered') THEN
    RETURN json_build_object('success', false, 'error', 'RPC ini khusus SO yang sudah delivered. Gunakan alur revisi biasa.');
  END IF;

  -- Snapshot qty yang benar-benar terkirim (sebelum di-undo)
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_delivered_snapshot
  FROM (
    SELECT soi.sales_order_item_id AS item_id, soi.product_id, soi.batch_id, SUM(soi.qty_out)::int AS qty
    FROM stock_out_items soi
    JOIN stock_out_headers soh ON soh.id = soi.stock_out_id
    WHERE soh.sales_order_id = order_id AND soh.booking_status = 'delivered'
    GROUP BY soi.sales_order_item_id, soi.product_id, soi.batch_id
  ) t;

  SELECT id INTO v_card_id FROM delivery_requests
  WHERE sales_order_id = order_id AND board_status <> 'archived'
  ORDER BY created_at DESC LIMIT 1;

  -- 1) Undo semua pengiriman yang delivered
  FOR v_so IN
    SELECT id, stock_out_number FROM stock_out_headers
    WHERE sales_order_id = order_id AND booking_status = 'delivered'
  LOOP
    v_res := stock_out_undo_delivery(v_so.id, trim(reason), v_card_id);
    IF COALESCE((v_res->>'success')::boolean, false) = false THEN
      RAISE EXCEPTION 'Undo pengiriman % gagal: %', v_so.stock_out_number, COALESCE(v_res->>'error', 'unknown');
    END IF;
  END LOOP;

  -- 2) Release semua booking yang tersisa
  FOR v_so IN
    SELECT id, stock_out_number FROM stock_out_headers
    WHERE sales_order_id = order_id AND booking_status = 'booked'
  LOOP
    v_res := stock_out_release_booking(v_so.id, trim(reason));
    IF COALESCE((v_res->>'success')::boolean, false) = false THEN
      RAISE EXCEPTION 'Release booking % gagal: %', v_so.stock_out_number, COALESCE(v_res->>'error', 'unknown');
    END IF;
  END LOOP;

  -- 3) Pastikan status approved lalu minta revisi
  UPDATE sales_order_headers SET status = 'approved', updated_at = now()
   WHERE id = order_id AND status IN ('delivered', 'partially_delivered');

  v_res2 := sales_order_request_revision(order_id, trim(reason));
  IF COALESCE((v_res2->>'success')::boolean, false) = false THEN
    RAISE EXCEPTION 'Request revisi gagal: %', COALESCE(v_res2->>'error', 'unknown');
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_uid, get_user_email(v_uid), 'FORCE_REVISION_QTY', 'Sales Order', 'sales_order_headers', order_id, v_so_number,
    jsonb_build_object('status', v_status, 'delivered_snapshot', v_delivered_snapshot),
    jsonb_build_object('status', 'revision_requested', 'reason', trim(reason)));

  IF v_card_id IS NOT NULL THEN
    INSERT INTO delivery_comments (delivery_request_id, user_id, message, type)
    VALUES (v_card_id, v_uid,
      format('♻️ SO %s dipaksa masuk revisi qty oleh super_admin. Pengiriman di-undo & stok dikembalikan. WAJIB approve ulang lalu kirim ulang. Alasan: %s', v_so_number, trim(reason)),
      'activity');
  END IF;

  RETURN json_build_object('success', true, 'so_status', 'revision_requested',
    'sales_order_number', v_so_number, 'delivered_snapshot', v_delivered_snapshot, 'card_id', v_card_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$function$;

-- ============ TIER 2b: Revisi qty in-place ============
CREATE OR REPLACE FUNCTION public.sales_order_revise_qty(order_id uuid, reason text, items jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_so_number text;
  v_status text;
  v_old jsonb;
  v_new jsonb;
  v_total numeric;
  v_grand numeric;
  v_it jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT has_any_role(v_uid, ARRAY['super_admin'::app_role]) THEN
    RETURN json_build_object('success', false, 'error', 'Hanya super_admin yang dapat merevisi qty');
  END IF;

  IF reason IS NULL OR length(trim(reason)) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Alasan minimal 20 karakter');
  END IF;

  SELECT sales_order_number, status INTO v_so_number, v_status
  FROM sales_order_headers
  WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);

  IF v_so_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_status NOT IN ('revision_requested', 'draft') THEN
    RETURN json_build_object('success', false, 'error', 'Qty hanya bisa direvisi saat status revision_requested atau draft');
  END IF;

  IF items IS NULL OR jsonb_typeof(items) <> 'array' OR jsonb_array_length(items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Tidak ada item untuk direvisi');
  END IF;

  SELECT jsonb_build_object(
           'header', (SELECT jsonb_build_object('total_amount', total_amount, 'grand_total', grand_total, 'status', status)
                        FROM sales_order_headers WHERE id = order_id),
           'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'ordered_qty', ordered_qty, 'qty_delivered', qty_delivered))
                        FROM sales_order_items WHERE sales_order_id = order_id), '[]'::jsonb))
    INTO v_old;

  FOR v_it IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    IF COALESCE((v_it->>'ordered_qty')::int, -1) < 0 THEN
      RAISE EXCEPTION 'Qty tidak boleh negatif';
    END IF;

    UPDATE sales_order_items
       SET ordered_qty = (v_it->>'ordered_qty')::int
     WHERE id = (v_it->>'item_id')::uuid
       AND sales_order_id = order_id;
  END LOOP;

  PERFORM recompute_sales_order_totals(order_id);

  SELECT total_amount, grand_total INTO v_total, v_grand
  FROM sales_order_headers WHERE id = order_id;

  UPDATE sales_order_headers SET updated_at = now() WHERE id = order_id;

  SELECT jsonb_build_object(
           'header', jsonb_build_object('total_amount', v_total, 'grand_total', v_grand),
           'reason', trim(reason),
           'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'ordered_qty', ordered_qty, 'qty_delivered', qty_delivered))
                        FROM sales_order_items WHERE sales_order_id = order_id), '[]'::jsonb))
    INTO v_new;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_uid, get_user_email(v_uid), 'REVISE_QTY', 'Sales Order', 'sales_order_headers', order_id, v_so_number, v_old, v_new);

  RETURN json_build_object('success', true, 'grand_total', v_grand, 'total_amount', v_total, 'sales_order_number', v_so_number);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$function$;

REVOKE ALL ON FUNCTION public.sales_order_revise_pricing(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.sales_order_force_revision_qty(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.sales_order_revise_qty(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_order_revise_pricing(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_force_revision_qty(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_revise_qty(uuid, text, jsonb) TO authenticated;