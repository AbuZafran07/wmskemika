
-- Drop and recreate plan_order_approve with optional approve_reason
CREATE OR REPLACE FUNCTION public.plan_order_approve(order_id uuid, approve_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_plan_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN RETURN json_build_object('success', false, 'error', 'Only administrators can approve orders'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, plan_number INTO v_current_status, v_plan_number FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status NOT IN ('pending', 'draft') THEN RETURN json_build_object('success', false, 'error', 'Only pending or draft orders can be approved'); END IF;
  UPDATE plan_order_headers SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now() WHERE id = order_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_user_id, v_user_email, 'APPROVE', 'Plan Order', 'plan_order_headers', order_id, v_plan_number,
    json_build_object('status', 'approved', 'approve_reason', COALESCE(approve_reason, '')));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Drop and recreate sales_order_approve with optional approve_reason
CREATE OR REPLACE FUNCTION public.sales_order_approve(order_id uuid, approve_reason text DEFAULT NULL)
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
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN RETURN json_build_object('success', false, 'error', 'Only administrators can approve orders'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status NOT IN ('pending', 'draft') THEN RETURN json_build_object('success', false, 'error', 'Only pending or draft orders can be approved'); END IF;
  UPDATE sales_order_headers SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now() WHERE id = order_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_user_id, v_user_email, 'APPROVE', 'Sales Order', 'sales_order_headers', order_id, v_order_number,
    json_build_object('status', 'approved', 'approve_reason', COALESCE(approve_reason, '')));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;
