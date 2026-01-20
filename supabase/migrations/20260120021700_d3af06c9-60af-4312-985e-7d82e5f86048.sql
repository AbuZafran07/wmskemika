-- Fix INFO_LEAKAGE: Replace raw SQLERRM with sanitized error messages
-- First, drop all affected functions, then recreate them

-- Drop existing functions
DROP FUNCTION IF EXISTS public.plan_order_create(json, json, json);
DROP FUNCTION IF EXISTS public.plan_order_update(uuid, json, json);
DROP FUNCTION IF EXISTS public.plan_order_approve(uuid);
DROP FUNCTION IF EXISTS public.plan_order_cancel(uuid);
DROP FUNCTION IF EXISTS public.plan_order_soft_delete(uuid);
DROP FUNCTION IF EXISTS public.sales_order_create(json, json, json);
DROP FUNCTION IF EXISTS public.sales_order_update(uuid, json, json);
DROP FUNCTION IF EXISTS public.sales_order_approve(uuid);
DROP FUNCTION IF EXISTS public.sales_order_cancel(uuid);
DROP FUNCTION IF EXISTS public.sales_order_soft_delete(uuid);
DROP FUNCTION IF EXISTS public.stock_adjustment_create(json, json, json);
DROP FUNCTION IF EXISTS public.stock_adjustment_update(uuid, json, json);
DROP FUNCTION IF EXISTS public.stock_adjustment_approve(uuid);
DROP FUNCTION IF EXISTS public.stock_adjustment_reject(uuid, text);
DROP FUNCTION IF EXISTS public.stock_adjustment_soft_delete(uuid);
DROP FUNCTION IF EXISTS public.stock_in_create(json, json);
DROP FUNCTION IF EXISTS public.stock_out_create(json, json);

-- Helper function to get sanitized error message
CREATE OR REPLACE FUNCTION public.get_sanitized_error_message(p_sqlstate text, p_sqlerrm text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log the detailed error for debugging (server-side only)
  RAISE LOG 'Database error [%]: %', p_sqlstate, p_sqlerrm;
  
  -- Return user-friendly messages based on error code
  CASE p_sqlstate
    WHEN '23505' THEN RETURN 'A record with this identifier already exists.';
    WHEN '23503' THEN RETURN 'This operation references data that does not exist or cannot be modified.';
    WHEN '23502' THEN RETURN 'Required information is missing. Please fill in all required fields.';
    WHEN '23514' THEN RETURN 'The provided data does not meet the required criteria.';
    WHEN '42501' THEN RETURN 'You do not have permission to perform this action.';
    WHEN '22P02' THEN RETURN 'Invalid data format provided.';
    WHEN 'P0001' THEN RETURN p_sqlerrm; -- Custom business logic errors pass through
    ELSE RETURN 'An error occurred processing your request. Please try again.';
  END CASE;
END;
$$;

-- Recreate plan_order_create
CREATE FUNCTION public.plan_order_create(
  header_data json, items_data json, attachment_meta json DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id uuid; v_plan_number text; v_user_id uuid; v_user_email text; v_item json; v_supplier_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  v_plan_number := header_data->>'plan_number';
  v_supplier_id := (header_data->>'supplier_id')::uuid;
  INSERT INTO plan_order_headers (plan_number, plan_date, supplier_id, expected_delivery_date, notes, reference_no, status, total_amount, discount, tax_rate, shipping_cost, grand_total, po_document_url, created_by)
  VALUES (v_plan_number, COALESCE((header_data->>'plan_date')::date, CURRENT_DATE), v_supplier_id, (header_data->>'expected_delivery_date')::date, header_data->>'notes', header_data->>'reference_no', COALESCE(header_data->>'status', 'draft'), COALESCE((header_data->>'total_amount')::numeric, 0), COALESCE((header_data->>'discount')::numeric, 0), COALESCE((header_data->>'tax_rate')::numeric, 0), COALESCE((header_data->>'shipping_cost')::numeric, 0), COALESCE((header_data->>'grand_total')::numeric, 0), header_data->>'po_document_url', v_user_id)
  RETURNING id INTO v_plan_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    INSERT INTO plan_order_items (plan_order_id, product_id, planned_qty, unit_price, notes)
    VALUES (v_plan_id, (v_item->>'product_id')::uuid, (v_item->>'planned_qty')::integer, COALESCE((v_item->>'unit_price')::numeric, 0), v_item->>'notes');
  END LOOP;
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, file_key, url, mime_type, file_size, uploaded_by)
    VALUES ('plan_order_headers', v_plan_id, 'plan_order', attachment_meta->>'file_key', attachment_meta->>'url', attachment_meta->>'mime_type', (attachment_meta->>'file_size')::bigint, v_user_id);
  END IF;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_user_id, v_user_email, 'CREATE', 'Plan Order', 'plan_order_headers', v_plan_id, v_plan_number, json_build_object('plan_number', v_plan_number, 'supplier_id', v_supplier_id, 'status', COALESCE(header_data->>'status', 'draft')));
  RETURN json_build_object('success', true, 'id', v_plan_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate plan_order_update
CREATE FUNCTION public.plan_order_update(order_id uuid, header_data json, items_data json)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_old_data json; v_item json; v_plan_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, plan_number, row_to_json(plan_order_headers.*) INTO v_current_status, v_plan_number, v_old_data FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status NOT IN ('draft', 'pending') THEN RETURN json_build_object('success', false, 'error', 'Only draft or pending orders can be edited'); END IF;
  UPDATE plan_order_headers SET plan_date = COALESCE((header_data->>'plan_date')::date, plan_date), supplier_id = COALESCE((header_data->>'supplier_id')::uuid, supplier_id), expected_delivery_date = (header_data->>'expected_delivery_date')::date, notes = header_data->>'notes', reference_no = header_data->>'reference_no', status = COALESCE(header_data->>'status', status), total_amount = COALESCE((header_data->>'total_amount')::numeric, total_amount), discount = COALESCE((header_data->>'discount')::numeric, discount), tax_rate = COALESCE((header_data->>'tax_rate')::numeric, tax_rate), shipping_cost = COALESCE((header_data->>'shipping_cost')::numeric, shipping_cost), grand_total = COALESCE((header_data->>'grand_total')::numeric, grand_total), po_document_url = COALESCE(header_data->>'po_document_url', po_document_url), updated_at = now() WHERE id = order_id;
  DELETE FROM plan_order_items WHERE plan_order_id = order_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    INSERT INTO plan_order_items (plan_order_id, product_id, planned_qty, unit_price, notes) VALUES (order_id, (v_item->>'product_id')::uuid, (v_item->>'planned_qty')::integer, COALESCE((v_item->>'unit_price')::numeric, 0), v_item->>'notes');
  END LOOP;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data) VALUES (v_user_id, v_user_email, 'UPDATE', 'Plan Order', 'plan_order_headers', order_id, v_plan_number, v_old_data, header_data);
  RETURN json_build_object('success', true, 'id', order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate plan_order_approve
CREATE FUNCTION public.plan_order_approve(order_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'APPROVE', 'Plan Order', 'plan_order_headers', order_id, v_plan_number, json_build_object('status', 'approved'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate plan_order_cancel
CREATE FUNCTION public.plan_order_cancel(order_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_plan_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, plan_number INTO v_current_status, v_plan_number FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status = 'cancelled' THEN RETURN json_build_object('success', false, 'error', 'Order is already cancelled'); END IF;
  IF v_current_status IN ('received', 'partial') THEN RETURN json_build_object('success', false, 'error', 'Cannot cancel orders that have received stock'); END IF;
  UPDATE plan_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CANCEL', 'Plan Order', 'plan_order_headers', order_id, v_plan_number, json_build_object('status', 'cancelled'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate plan_order_soft_delete
CREATE FUNCTION public.plan_order_soft_delete(order_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_plan_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, plan_number INTO v_current_status, v_plan_number FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'draft' THEN RETURN json_build_object('success', false, 'error', 'Only draft orders can be deleted'); END IF;
  UPDATE plan_order_headers SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, updated_at = now() WHERE id = order_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'DELETE', 'Plan Order', 'plan_order_headers', order_id, v_plan_number, json_build_object('status', 'deleted'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate sales_order_create
CREATE FUNCTION public.sales_order_create(header_data json, items_data json, attachment_meta json DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid; v_order_number text; v_user_id uuid; v_user_email text; v_item json;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  v_order_number := header_data->>'sales_order_number';
  INSERT INTO sales_order_headers (sales_order_number, order_date, customer_id, customer_po_number, project_instansi, sales_name, allocation_type, delivery_deadline, ship_to_address, notes, status, total_amount, discount, tax_rate, shipping_cost, grand_total, po_document_url, created_by)
  VALUES (v_order_number, COALESCE((header_data->>'order_date')::date, CURRENT_DATE), (header_data->>'customer_id')::uuid, header_data->>'customer_po_number', header_data->>'project_instansi', header_data->>'sales_name', header_data->>'allocation_type', (header_data->>'delivery_deadline')::date, header_data->>'ship_to_address', header_data->>'notes', COALESCE(header_data->>'status', 'draft'), COALESCE((header_data->>'total_amount')::numeric, 0), COALESCE((header_data->>'discount')::numeric, 0), COALESCE((header_data->>'tax_rate')::numeric, 0), COALESCE((header_data->>'shipping_cost')::numeric, 0), COALESCE((header_data->>'grand_total')::numeric, 0), header_data->>'po_document_url', v_user_id)
  RETURNING id INTO v_order_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    INSERT INTO sales_order_items (sales_order_id, product_id, ordered_qty, unit_price, discount, tax_rate, notes)
    VALUES (v_order_id, (v_item->>'product_id')::uuid, (v_item->>'ordered_qty')::integer, COALESCE((v_item->>'unit_price')::numeric, 0), COALESCE((v_item->>'discount')::numeric, 0), COALESCE((v_item->>'tax_rate')::numeric, 0), v_item->>'notes');
  END LOOP;
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, file_key, url, mime_type, file_size, uploaded_by)
    VALUES ('sales_order_headers', v_order_id, 'sales_order', attachment_meta->>'file_key', attachment_meta->>'url', attachment_meta->>'mime_type', (attachment_meta->>'file_size')::bigint, v_user_id);
  END IF;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CREATE', 'Sales Order', 'sales_order_headers', v_order_id, v_order_number, json_build_object('sales_order_number', v_order_number, 'customer_id', header_data->>'customer_id', 'status', COALESCE(header_data->>'status', 'draft')));
  RETURN json_build_object('success', true, 'id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate sales_order_update
CREATE FUNCTION public.sales_order_update(order_id uuid, header_data json, items_data json) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_old_data json; v_item json; v_order_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number, row_to_json(sales_order_headers.*) INTO v_current_status, v_order_number, v_old_data FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status NOT IN ('draft', 'pending') THEN RETURN json_build_object('success', false, 'error', 'Only draft or pending orders can be edited'); END IF;
  UPDATE sales_order_headers SET order_date = COALESCE((header_data->>'order_date')::date, order_date), customer_id = COALESCE((header_data->>'customer_id')::uuid, customer_id), customer_po_number = COALESCE(header_data->>'customer_po_number', customer_po_number), project_instansi = COALESCE(header_data->>'project_instansi', project_instansi), sales_name = COALESCE(header_data->>'sales_name', sales_name), allocation_type = COALESCE(header_data->>'allocation_type', allocation_type), delivery_deadline = COALESCE((header_data->>'delivery_deadline')::date, delivery_deadline), ship_to_address = header_data->>'ship_to_address', notes = header_data->>'notes', status = COALESCE(header_data->>'status', status), total_amount = COALESCE((header_data->>'total_amount')::numeric, total_amount), discount = COALESCE((header_data->>'discount')::numeric, discount), tax_rate = COALESCE((header_data->>'tax_rate')::numeric, tax_rate), shipping_cost = COALESCE((header_data->>'shipping_cost')::numeric, shipping_cost), grand_total = COALESCE((header_data->>'grand_total')::numeric, grand_total), po_document_url = COALESCE(header_data->>'po_document_url', po_document_url), updated_at = now() WHERE id = order_id;
  DELETE FROM sales_order_items WHERE sales_order_id = order_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    INSERT INTO sales_order_items (sales_order_id, product_id, ordered_qty, unit_price, discount, tax_rate, notes) VALUES (order_id, (v_item->>'product_id')::uuid, (v_item->>'ordered_qty')::integer, COALESCE((v_item->>'unit_price')::numeric, 0), COALESCE((v_item->>'discount')::numeric, 0), COALESCE((v_item->>'tax_rate')::numeric, 0), v_item->>'notes');
  END LOOP;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data) VALUES (v_user_id, v_user_email, 'UPDATE', 'Sales Order', 'sales_order_headers', order_id, v_order_number, v_old_data, header_data);
  RETURN json_build_object('success', true, 'id', order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate sales_order_approve
CREATE FUNCTION public.sales_order_approve(order_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'APPROVE', 'Sales Order', 'sales_order_headers', order_id, v_order_number, json_build_object('status', 'approved'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate sales_order_cancel
CREATE FUNCTION public.sales_order_cancel(order_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status = 'cancelled' THEN RETURN json_build_object('success', false, 'error', 'Order is already cancelled'); END IF;
  IF v_current_status IN ('delivered', 'partial') THEN RETURN json_build_object('success', false, 'error', 'Cannot cancel orders that have been delivered'); END IF;
  UPDATE sales_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CANCEL', 'Sales Order', 'sales_order_headers', order_id, v_order_number, json_build_object('status', 'cancelled'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate sales_order_soft_delete
CREATE FUNCTION public.sales_order_soft_delete(order_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'DELETE', 'Sales Order', 'sales_order_headers', order_id, v_order_number, json_build_object('status', 'deleted'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate stock_adjustment_create
CREATE FUNCTION public.stock_adjustment_create(header_data json, items_data json, attachment_meta json DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_adjustment_id uuid; v_adjustment_number text; v_user_id uuid; v_user_email text; v_item json;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  v_adjustment_number := header_data->>'adjustment_number';
  INSERT INTO stock_adjustments (adjustment_number, adjustment_date, reason, status, attachment_url, created_by)
  VALUES (v_adjustment_number, COALESCE((header_data->>'adjustment_date')::date, CURRENT_DATE), header_data->>'reason', COALESCE(header_data->>'status', 'draft'), header_data->>'attachment_url', v_user_id)
  RETURNING id INTO v_adjustment_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes)
    VALUES (v_adjustment_id, (v_item->>'product_id')::uuid, (v_item->>'batch_id')::uuid, (v_item->>'adjustment_qty')::integer, v_item->>'notes');
  END LOOP;
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, file_key, url, mime_type, file_size, uploaded_by)
    VALUES ('stock_adjustments', v_adjustment_id, 'stock_adjustment', attachment_meta->>'file_key', attachment_meta->>'url', attachment_meta->>'mime_type', (attachment_meta->>'file_size')::bigint, v_user_id);
  END IF;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CREATE', 'Stock Adjustment', 'stock_adjustments', v_adjustment_id, v_adjustment_number, json_build_object('adjustment_number', v_adjustment_number, 'reason', header_data->>'reason', 'status', COALESCE(header_data->>'status', 'draft')));
  RETURN json_build_object('success', true, 'id', v_adjustment_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate stock_adjustment_update
CREATE FUNCTION public.stock_adjustment_update(p_adjustment_id uuid, header_data json, items_data json) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_old_data json; v_item json; v_adjustment_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, adjustment_number, row_to_json(stock_adjustments.*) INTO v_current_status, v_adjustment_number, v_old_data FROM stock_adjustments WHERE id = p_adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Adjustment not found'); END IF;
  IF v_current_status NOT IN ('draft', 'submitted') THEN RETURN json_build_object('success', false, 'error', 'Only draft or submitted adjustments can be edited'); END IF;
  UPDATE stock_adjustments SET adjustment_date = COALESCE((header_data->>'adjustment_date')::date, adjustment_date), reason = COALESCE(header_data->>'reason', reason), status = COALESCE(header_data->>'status', status), attachment_url = COALESCE(header_data->>'attachment_url', attachment_url), updated_at = now() WHERE id = p_adjustment_id;
  DELETE FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes) VALUES (p_adjustment_id, (v_item->>'product_id')::uuid, (v_item->>'batch_id')::uuid, (v_item->>'adjustment_qty')::integer, v_item->>'notes');
  END LOOP;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data) VALUES (v_user_id, v_user_email, 'UPDATE', 'Stock Adjustment', 'stock_adjustments', p_adjustment_id, v_adjustment_number, v_old_data, header_data);
  RETURN json_build_object('success', true, 'id', p_adjustment_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate stock_adjustment_approve
CREATE FUNCTION public.stock_adjustment_approve(p_adjustment_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_adjustment_number text; v_current_status text; v_item RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN RETURN json_build_object('success', false, 'error', 'Only administrators can approve adjustments'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, adjustment_number INTO v_current_status, v_adjustment_number FROM stock_adjustments WHERE id = p_adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Adjustment not found'); END IF;
  IF v_current_status NOT IN ('submitted', 'draft') THEN RETURN json_build_object('success', false, 'error', 'Only submitted or draft adjustments can be approved'); END IF;
  FOR v_item IN SELECT product_id, batch_id, adjustment_qty FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id LOOP
    UPDATE inventory_batches SET qty_on_hand = qty_on_hand + v_item.adjustment_qty, updated_at = now() WHERE id = v_item.batch_id;
    INSERT INTO stock_transactions (product_id, batch_id, transaction_type, quantity, reference_type, reference_id, reference_number, created_by) VALUES (v_item.product_id, v_item.batch_id, 'adjustment', v_item.adjustment_qty, 'stock_adjustment', p_adjustment_id, v_adjustment_number, v_user_id);
  END LOOP;
  UPDATE stock_adjustments SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now() WHERE id = p_adjustment_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'APPROVE', 'Stock Adjustment', 'stock_adjustments', p_adjustment_id, v_adjustment_number, json_build_object('status', 'approved'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate stock_adjustment_reject
CREATE FUNCTION public.stock_adjustment_reject(p_adjustment_id uuid, reject_reason text DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_adjustment_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN RETURN json_build_object('success', false, 'error', 'Only administrators can reject adjustments'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, adjustment_number INTO v_current_status, v_adjustment_number FROM stock_adjustments WHERE id = p_adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Adjustment not found'); END IF;
  IF v_current_status NOT IN ('submitted', 'draft') THEN RETURN json_build_object('success', false, 'error', 'Only submitted or draft adjustments can be rejected'); END IF;
  UPDATE stock_adjustments SET status = 'rejected', rejected_reason = reject_reason, approved_by = v_user_id, approved_at = now(), updated_at = now() WHERE id = p_adjustment_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'REJECT', 'Stock Adjustment', 'stock_adjustments', p_adjustment_id, v_adjustment_number, json_build_object('status', 'rejected', 'reason', reject_reason));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate stock_adjustment_soft_delete
CREATE FUNCTION public.stock_adjustment_soft_delete(p_adjustment_id uuid) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_adjustment_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, adjustment_number INTO v_current_status, v_adjustment_number FROM stock_adjustments WHERE id = p_adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Adjustment not found'); END IF;
  IF v_current_status != 'draft' THEN RETURN json_build_object('success', false, 'error', 'Only draft adjustments can be deleted'); END IF;
  UPDATE stock_adjustments SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, updated_at = now() WHERE id = p_adjustment_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'DELETE', 'Stock Adjustment', 'stock_adjustments', p_adjustment_id, v_adjustment_number, json_build_object('status', 'deleted'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate stock_in_create
CREATE FUNCTION public.stock_in_create(header_data json, items_data json) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stock_in_id uuid; v_stock_in_number text; v_plan_order_id uuid; v_user_id uuid; v_user_email text; v_item json; v_batch_id uuid; v_plan_number text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  v_user_email := get_user_email(v_user_id);
  v_stock_in_number := header_data->>'stock_in_number';
  v_plan_order_id := (header_data->>'plan_order_id')::uuid;
  SELECT plan_number INTO v_plan_number FROM plan_order_headers WHERE id = v_plan_order_id;
  INSERT INTO stock_in_headers (stock_in_number, plan_order_id, received_date, notes, delivery_note_url, created_by)
  VALUES (v_stock_in_number, v_plan_order_id, COALESCE((header_data->>'received_date')::date, CURRENT_DATE), header_data->>'notes', header_data->>'delivery_note_url', v_user_id)
  RETURNING id INTO v_stock_in_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_on_hand) VALUES ((v_item->>'product_id')::uuid, v_item->>'batch_no', (v_item->>'expired_date')::date, (v_item->>'qty_received')::integer) RETURNING id INTO v_batch_id;
    INSERT INTO stock_in_items (stock_in_id, plan_order_item_id, product_id, batch_no, expired_date, qty_received) VALUES (v_stock_in_id, (v_item->>'plan_order_item_id')::uuid, (v_item->>'product_id')::uuid, v_item->>'batch_no', (v_item->>'expired_date')::date, (v_item->>'qty_received')::integer);
    UPDATE plan_order_items SET qty_received = COALESCE(qty_received, 0) + (v_item->>'qty_received')::integer WHERE id = (v_item->>'plan_order_item_id')::uuid;
    INSERT INTO stock_transactions (product_id, batch_id, transaction_type, quantity, reference_type, reference_id, reference_number, created_by) VALUES ((v_item->>'product_id')::uuid, v_batch_id, 'inbound', (v_item->>'qty_received')::integer, 'stock_in', v_stock_in_id, v_stock_in_number, v_user_id);
  END LOOP;
  PERFORM update_plan_order_status(v_plan_order_id);
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CREATE', 'Stock In', 'stock_in_headers', v_stock_in_id, v_stock_in_number, json_build_object('stock_in_number', v_stock_in_number, 'plan_order_id', v_plan_order_id, 'plan_number', v_plan_number));
  RETURN json_build_object('success', true, 'id', v_stock_in_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- Recreate stock_out_create
CREATE FUNCTION public.stock_out_create(header_data json, items_data json) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stock_out_id uuid; v_stock_out_number text; v_sales_order_id uuid; v_user_id uuid; v_user_email text; v_item json; v_order_number text; v_current_qty integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  v_user_email := get_user_email(v_user_id);
  v_stock_out_number := header_data->>'stock_out_number';
  v_sales_order_id := (header_data->>'sales_order_id')::uuid;
  SELECT sales_order_number INTO v_order_number FROM sales_order_headers WHERE id = v_sales_order_id;
  INSERT INTO stock_out_headers (stock_out_number, sales_order_id, delivery_date, notes, delivery_note_url, created_by)
  VALUES (v_stock_out_number, v_sales_order_id, COALESCE((header_data->>'delivery_date')::date, CURRENT_DATE), header_data->>'notes', header_data->>'delivery_note_url', v_user_id)
  RETURNING id INTO v_stock_out_id;
  FOR v_item IN SELECT * FROM json_array_elements(items_data) LOOP
    SELECT qty_on_hand INTO v_current_qty FROM inventory_batches WHERE id = (v_item->>'batch_id')::uuid;
    IF v_current_qty < (v_item->>'qty_out')::integer THEN RAISE EXCEPTION 'Insufficient stock for selected batch'; END IF;
    INSERT INTO stock_out_items (stock_out_id, sales_order_item_id, product_id, batch_id, qty_out) VALUES (v_stock_out_id, (v_item->>'sales_order_item_id')::uuid, (v_item->>'product_id')::uuid, (v_item->>'batch_id')::uuid, (v_item->>'qty_out')::integer);
    UPDATE inventory_batches SET qty_on_hand = qty_on_hand - (v_item->>'qty_out')::integer, updated_at = now() WHERE id = (v_item->>'batch_id')::uuid;
    UPDATE sales_order_items SET qty_delivered = COALESCE(qty_delivered, 0) + (v_item->>'qty_out')::integer WHERE id = (v_item->>'sales_order_item_id')::uuid;
    INSERT INTO stock_transactions (product_id, batch_id, transaction_type, quantity, reference_type, reference_id, reference_number, created_by) VALUES ((v_item->>'product_id')::uuid, (v_item->>'batch_id')::uuid, 'outbound', (v_item->>'qty_out')::integer, 'stock_out', v_stock_out_id, v_stock_out_number, v_user_id);
  END LOOP;
  PERFORM update_sales_order_status(v_sales_order_id);
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CREATE', 'Stock Out', 'stock_out_headers', v_stock_out_id, v_stock_out_number, json_build_object('stock_out_number', v_stock_out_number, 'sales_order_id', v_sales_order_id, 'order_number', v_order_number));
  RETURN json_build_object('success', true, 'id', v_stock_out_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;