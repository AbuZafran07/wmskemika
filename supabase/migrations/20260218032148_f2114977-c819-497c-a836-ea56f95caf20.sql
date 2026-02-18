
-- ============================================================
-- Revision Request Workflow for Plan Order and Sales Order
-- ============================================================

-- 1. Plan Order: Request Revision (any authenticated user)
CREATE OR REPLACE FUNCTION public.plan_order_request_revision(order_id uuid, revision_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_plan_number text; v_current_status text;
  v_has_stock_in boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  
  IF revision_reason IS NULL OR trim(revision_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Revision reason is required');
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, plan_number INTO v_current_status, v_plan_number 
  FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'approved' THEN RETURN json_build_object('success', false, 'error', 'Only approved orders can request revision'); END IF;

  -- Check if there are stock in records
  SELECT EXISTS(SELECT 1 FROM stock_in_headers WHERE plan_order_id = order_id) INTO v_has_stock_in;
  IF v_has_stock_in THEN
    RETURN json_build_object('success', false, 'error', 'Cannot request revision: order already has stock in records');
  END IF;

  UPDATE plan_order_headers SET status = 'revision_requested', updated_at = now() WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) 
  VALUES (v_user_id, v_user_email, 'REVISION_REQUEST', 'Plan Order', 'plan_order_headers', order_id, v_plan_number, 
    json_build_object('status', 'revision_requested', 'reason', revision_reason));
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- 2. Plan Order: Approve Revision (admin/super_admin only -> returns to draft)
CREATE OR REPLACE FUNCTION public.plan_order_approve_revision(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_plan_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN 
    RETURN json_build_object('success', false, 'error', 'Only administrators can approve revision requests'); 
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, plan_number INTO v_current_status, v_plan_number 
  FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'revision_requested' THEN RETURN json_build_object('success', false, 'error', 'Order is not in revision_requested status'); END IF;

  -- Reset to draft so user can edit, clear approval
  UPDATE plan_order_headers SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = now() WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) 
  VALUES (v_user_id, v_user_email, 'REVISION_APPROVED', 'Plan Order', 'plan_order_headers', order_id, v_plan_number, 
    json_build_object('status', 'draft', 'note', 'Revision approved, returned to draft'));
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- 3. Plan Order: Reject Revision (admin/super_admin -> returns to approved)
CREATE OR REPLACE FUNCTION public.plan_order_reject_revision(order_id uuid, reject_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_plan_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN 
    RETURN json_build_object('success', false, 'error', 'Only administrators can reject revision requests'); 
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, plan_number INTO v_current_status, v_plan_number 
  FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'revision_requested' THEN RETURN json_build_object('success', false, 'error', 'Order is not in revision_requested status'); END IF;

  UPDATE plan_order_headers SET status = 'approved', updated_at = now() WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) 
  VALUES (v_user_id, v_user_email, 'REVISION_REJECTED', 'Plan Order', 'plan_order_headers', order_id, v_plan_number, 
    json_build_object('status', 'approved', 'reason', reject_reason));
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- 4. Sales Order: Request Revision
CREATE OR REPLACE FUNCTION public.sales_order_request_revision(order_id uuid, revision_reason text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
  v_has_stock_out boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  
  IF revision_reason IS NULL OR trim(revision_reason) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Revision reason is required');
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number 
  FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'approved' THEN RETURN json_build_object('success', false, 'error', 'Only approved orders can request revision'); END IF;

  SELECT EXISTS(SELECT 1 FROM stock_out_headers WHERE sales_order_id = order_id) INTO v_has_stock_out;
  IF v_has_stock_out THEN
    RETURN json_build_object('success', false, 'error', 'Cannot request revision: order already has stock out records');
  END IF;

  UPDATE sales_order_headers SET status = 'revision_requested', updated_at = now() WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) 
  VALUES (v_user_id, v_user_email, 'REVISION_REQUEST', 'Sales Order', 'sales_order_headers', order_id, v_order_number, 
    json_build_object('status', 'revision_requested', 'reason', revision_reason));
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- 5. Sales Order: Approve Revision
CREATE OR REPLACE FUNCTION public.sales_order_approve_revision(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN 
    RETURN json_build_object('success', false, 'error', 'Only administrators can approve revision requests'); 
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number 
  FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'revision_requested' THEN RETURN json_build_object('success', false, 'error', 'Order is not in revision_requested status'); END IF;

  UPDATE sales_order_headers SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = now() WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) 
  VALUES (v_user_id, v_user_email, 'REVISION_APPROVED', 'Sales Order', 'sales_order_headers', order_id, v_order_number, 
    json_build_object('status', 'draft', 'note', 'Revision approved, returned to draft'));
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- 6. Sales Order: Reject Revision
CREATE OR REPLACE FUNCTION public.sales_order_reject_revision(order_id uuid, reject_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN 
    RETURN json_build_object('success', false, 'error', 'Only administrators can reject revision requests'); 
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number 
  FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'revision_requested' THEN RETURN json_build_object('success', false, 'error', 'Order is not in revision_requested status'); END IF;

  UPDATE sales_order_headers SET status = 'approved', updated_at = now() WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) 
  VALUES (v_user_id, v_user_email, 'REVISION_REJECTED', 'Sales Order', 'sales_order_headers', order_id, v_order_number, 
    json_build_object('status', 'approved', 'reason', reject_reason));
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;
