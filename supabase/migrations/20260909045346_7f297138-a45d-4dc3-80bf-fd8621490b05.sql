ALTER TABLE public.sales_order_headers
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

DROP FUNCTION IF EXISTS public.sales_order_cancel(uuid);

CREATE OR REPLACE FUNCTION public.sales_order_cancel(order_id uuid, cancel_reason text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
  v_so_rec record; v_reason text;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'sales'::app_role]) THEN RETURN json_build_object('success', false, 'error', 'Insufficient privileges'); END IF;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  v_reason := btrim(COALESCE(cancel_reason, ''));
  IF length(v_reason) < 20 THEN RETURN json_build_object('success', false, 'error', 'Alasan pembatalan wajib diisi minimal 20 karakter'); END IF;
  IF length(v_reason) > 1000 THEN RETURN json_build_object('success', false, 'error', 'Alasan pembatalan maksimal 1000 karakter'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status = 'cancelled' THEN RETURN json_build_object('success', false, 'error', 'Order is already cancelled'); END IF;
  IF v_current_status IN ('delivered', 'partial', 'partially_delivered') THEN RETURN json_build_object('success', false, 'error', 'Cannot cancel orders that have been delivered'); END IF;

  UPDATE sales_order_headers
  SET status = 'cancelled',
      cancel_reason = v_reason,
      cancelled_by = v_user_id,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = order_id;

  UPDATE delivery_requests SET board_status = 'archived', moved_by = v_user_id, moved_at = now(), updated_at = now() WHERE sales_order_id = order_id AND board_status != 'archived';

  FOR v_so_rec IN
    SELECT id, so_number FROM stock_out_headers
    WHERE sales_order_id = order_id AND booking_status = 'booked'
  LOOP
    UPDATE stock_out_headers
    SET booking_status = 'released',
        released_at = now(),
        released_reason = COALESCE(released_reason, 'SO dibatalkan: ' || v_reason)
    WHERE id = v_so_rec.id;

    INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
    VALUES (v_user_id, v_user_email, 'release_booking', 'stock_out', 'stock_out_headers', v_so_rec.id, v_so_rec.so_number,
      jsonb_build_object('booking_status','booked'),
      jsonb_build_object('booking_status','released','reason', v_reason, 'released_at', now()));
  END LOOP;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_user_id, v_user_email, 'CANCEL', 'Sales Order', 'sales_order_headers', order_id, v_order_number, json_build_object('status', 'cancelled', 'reason', v_reason));

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$function$;