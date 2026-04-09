
-- Fix existing orphaned delivery requests
UPDATE delivery_requests
SET board_status = 'archived', updated_at = now()
WHERE sales_order_id IN (
  SELECT id FROM sales_order_headers WHERE is_deleted = true OR status = 'cancelled'
) AND board_status != 'archived';

-- Update sales_order_soft_delete to also archive delivery requests
CREATE OR REPLACE FUNCTION public.sales_order_soft_delete(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'draft' THEN RETURN json_build_object('success', false, 'error', 'Only draft orders can be deleted'); END IF;
  UPDATE sales_order_headers SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, updated_at = now() WHERE id = order_id;
  -- Archive related delivery requests
  UPDATE delivery_requests SET board_status = 'archived', moved_by = v_user_id, moved_at = now(), updated_at = now() WHERE sales_order_id = order_id AND board_status != 'archived';
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'DELETE', 'Sales Order', 'sales_order_headers', order_id, v_order_number, json_build_object('status', 'deleted'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Update sales_order_cancel to also archive delivery requests
CREATE OR REPLACE FUNCTION public.sales_order_cancel(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status = 'cancelled' THEN RETURN json_build_object('success', false, 'error', 'Order is already cancelled'); END IF;
  IF v_current_status IN ('delivered', 'partial', 'partially_delivered') THEN RETURN json_build_object('success', false, 'error', 'Cannot cancel orders that have been delivered'); END IF;
  UPDATE sales_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;
  -- Archive related delivery requests
  UPDATE delivery_requests SET board_status = 'archived', moved_by = v_user_id, moved_at = now(), updated_at = now() WHERE sales_order_id = order_id AND board_status != 'archived';
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CANCEL', 'Sales Order', 'sales_order_headers', order_id, v_order_number, json_build_object('status', 'cancelled'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;
