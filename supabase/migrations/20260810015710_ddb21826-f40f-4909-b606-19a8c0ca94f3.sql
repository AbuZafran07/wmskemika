CREATE OR REPLACE FUNCTION public.sales_order_cancel_delivered(order_id uuid, reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
  v_so_number text;
  v_items json;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role]) THEN
    RETURN json_build_object('success', false, 'error', 'Hanya super_admin yang dapat membatalkan SO yang sudah delivered');
  END IF;

  IF reason IS NULL OR length(trim(reason)) < 20 THEN
    RETURN json_build_object('success', false, 'error', 'Alasan minimal 20 karakter');
  END IF;

  SELECT status, sales_order_number INTO v_status, v_so_number
  FROM sales_order_headers
  WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);

  IF v_so_number IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_status NOT IN ('delivered', 'partially_delivered') THEN
    RETURN json_build_object('success', false, 'error', 'RPC ini khusus SO yang sudah delivered. Gunakan cancel biasa.');
  END IF;

  SELECT COALESCE(json_agg(t), '[]'::json) INTO v_items
  FROM (
    SELECT soi.product_id, soi.batch_id, SUM(soi.qty_out)::int AS qty
    FROM stock_out_items soi
    JOIN stock_out_headers soh ON soh.id = soi.stock_out_id
    WHERE soh.sales_order_id = order_id AND soh.booking_status = 'delivered'
    GROUP BY soi.product_id, soi.batch_id
  ) t;

  UPDATE sales_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;

  UPDATE delivery_requests
  SET board_status = 'archived', moved_by = v_user_id, moved_at = now(), updated_at = now()
  WHERE sales_order_id = order_id AND board_status <> 'archived';

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_user_id, get_user_email(v_user_id), 'CANCEL_DELIVERED', 'Sales Order', 'sales_order_headers', order_id, v_so_number,
          json_build_object('status', 'cancelled', 'reason', trim(reason)));

  RETURN json_build_object('success', true, 'sales_order_number', v_so_number, 'delivered_items', v_items);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;