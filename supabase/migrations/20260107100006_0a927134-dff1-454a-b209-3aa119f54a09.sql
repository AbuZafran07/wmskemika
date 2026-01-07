-- Fix 1: Create a dedicated helper function for getting user emails
-- This centralizes auth.users access and reduces attack surface
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = _user_id
$$;

-- Fix 2: Add DELETE policy for attachments table
-- Allow uploaders and admins to delete their attachments
CREATE POLICY "Uploaders and admins can delete attachments"
ON public.attachments FOR DELETE
USING (
  uploaded_by = auth.uid() OR 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin']::app_role[])
);

-- Fix 3: Add UPDATE policy for attachments table
-- Allow uploaders and admins to update attachment metadata
CREATE POLICY "Uploaders and admins can update attachments"
ON public.attachments FOR UPDATE
USING (
  uploaded_by = auth.uid() OR 
  has_any_role(auth.uid(), ARRAY['super_admin', 'admin']::app_role[])
);

-- Fix 4: Update all SECURITY DEFINER functions to use get_user_email helper
-- Plan Order functions
CREATE OR REPLACE FUNCTION public.plan_order_approve(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role app_role;
  v_allow_admin_approve BOOLEAN;
  v_before_json JSONB;
  v_after_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  v_user_role := get_user_role(v_user_id);
  
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be approved');
  END IF;
  
  IF v_user_role != 'super_admin' THEN
    SELECT COALESCE((value::jsonb->>'value')::boolean, (value::text)::boolean, false) INTO v_allow_admin_approve 
    FROM settings WHERE key = 'allow_admin_approve';
    
    IF v_user_role != 'admin' OR NOT COALESCE(v_allow_admin_approve, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to approve orders');
    END IF;
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE plan_order_headers SET 
    status = 'approved',
    approved_by = v_user_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = order_id;
  
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'approve', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plan_order_cancel(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_total_received INTEGER;
  v_before_json JSONB;
  v_after_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or deleted');
  END IF;
  
  IF v_header.status = 'draft' THEN
    -- OK to cancel
  ELSIF v_header.status = 'approved' THEN
    SELECT COALESCE(SUM(qty_received), 0) INTO v_total_received 
    FROM plan_order_items WHERE plan_order_id = order_id;
    
    IF v_total_received > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel order with received items');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Only draft or approved orders (with no receiving) can be cancelled');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE plan_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;
  
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'cancel', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plan_order_soft_delete(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_before_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or already deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be deleted');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE plan_order_headers SET 
    is_deleted = true,
    deleted_at = now(),
    deleted_by = v_user_id,
    updated_at = now()
  WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'delete', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, NULL);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plan_order_create(header_data jsonb, items_data jsonb, attachment_meta jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_after_json JSONB;
  v_items_result JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  INSERT INTO plan_order_headers (
    plan_number, plan_date, supplier_id, expected_delivery_date, notes,
    po_document_url, status, total_amount, discount, tax_rate,
    shipping_cost, grand_total, created_by, is_deleted
  )
  VALUES (
    header_data->>'plan_number',
    (header_data->>'plan_date')::date,
    (header_data->>'supplier_id')::uuid,
    NULLIF(header_data->>'expected_delivery_date', '')::date,
    NULLIF(header_data->>'notes', ''),
    NULLIF(header_data->>'po_document_url', ''),
    COALESCE(header_data->>'status', 'draft'),
    COALESCE((header_data->>'total_amount')::numeric, 0),
    COALESCE((header_data->>'discount')::numeric, 0),
    COALESCE((header_data->>'tax_rate')::numeric, 0),
    COALESCE((header_data->>'shipping_cost')::numeric, 0),
    COALESCE((header_data->>'grand_total')::numeric, 0),
    v_user_id,
    false
  )
  RETURNING id INTO v_header_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO plan_order_items (plan_order_id, product_id, unit_price, planned_qty, notes)
    VALUES (
      v_header_id,
      (v_item->>'product_id')::uuid,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'planned_qty')::integer, 1),
      NULLIF(v_item->>'notes', '')
    );
  END LOOP;
  
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (module_name, ref_table, ref_id, file_key, url, mime_type, file_size, uploaded_by)
    VALUES (
      'plan_order',
      'plan_order_headers',
      v_header_id,
      attachment_meta->>'file_key',
      attachment_meta->>'url',
      attachment_meta->>'mime_type',
      (attachment_meta->>'file_size')::bigint,
      v_user_id
    );
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result FROM plan_order_items i WHERE i.plan_order_id = v_header_id;
  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM plan_order_headers h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb)
  );
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'create', 'plan_order', 'plan_order_headers', v_header_id, header_data->>'plan_number', NULL, v_after_json);
  
  RETURN jsonb_build_object('success', true, 'id', v_header_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Plan number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.plan_order_update(order_id uuid, header_data jsonb, items_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_before_json JSONB;
  v_after_json JSONB;
  v_items_before JSONB;
  v_items_after JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be edited');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_before FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items_before, '[]'::jsonb));
  
  UPDATE plan_order_headers SET
    plan_number = COALESCE(header_data->>'plan_number', plan_number),
    plan_date = COALESCE((header_data->>'plan_date')::date, plan_date),
    supplier_id = COALESCE((header_data->>'supplier_id')::uuid, supplier_id),
    expected_delivery_date = NULLIF(header_data->>'expected_delivery_date', '')::date,
    notes = NULLIF(header_data->>'notes', ''),
    po_document_url = NULLIF(header_data->>'po_document_url', ''),
    total_amount = COALESCE((header_data->>'total_amount')::numeric, total_amount),
    discount = COALESCE((header_data->>'discount')::numeric, discount),
    tax_rate = COALESCE((header_data->>'tax_rate')::numeric, tax_rate),
    shipping_cost = COALESCE((header_data->>'shipping_cost')::numeric, shipping_cost),
    grand_total = COALESCE((header_data->>'grand_total')::numeric, grand_total),
    updated_at = now()
  WHERE id = order_id;
  
  DELETE FROM plan_order_items WHERE plan_order_id = order_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO plan_order_items (plan_order_id, product_id, unit_price, planned_qty, notes)
    VALUES (
      order_id,
      (v_item->>'product_id')::uuid,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'planned_qty')::integer, 1),
      NULLIF(v_item->>'notes', '')
    );
  END LOOP;
  
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id;
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_after FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items_after, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'update', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Plan number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- Sales Order functions
CREATE OR REPLACE FUNCTION public.sales_order_approve(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role app_role;
  v_allow_admin_approve BOOLEAN;
  v_before_json JSONB;
  v_after_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  v_user_role := get_user_role(v_user_id);
  
  SELECT * INTO v_header FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be approved');
  END IF;
  
  IF v_user_role != 'super_admin' THEN
    SELECT COALESCE((value::jsonb->>'value')::boolean, (value::text)::boolean, false) INTO v_allow_admin_approve 
    FROM settings WHERE key = 'allow_admin_approve';
    
    IF v_user_role != 'admin' OR NOT COALESCE(v_allow_admin_approve, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to approve orders');
    END IF;
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM sales_order_items i WHERE i.sales_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE sales_order_headers SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now() WHERE id = order_id;
  
  SELECT * INTO v_header FROM sales_order_headers WHERE id = order_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'approve', 'sales_order', 'sales_order_headers', order_id, v_header.sales_order_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sales_order_cancel(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_total_delivered INTEGER;
  v_before_json JSONB;
  v_after_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or deleted');
  END IF;
  
  IF v_header.status = 'draft' THEN
    -- OK to cancel
  ELSIF v_header.status = 'approved' THEN
    SELECT COALESCE(SUM(qty_delivered), 0) INTO v_total_delivered FROM sales_order_items WHERE sales_order_id = order_id;
    IF v_total_delivered > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel order with delivered items');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Only draft or approved orders (with no delivery) can be cancelled');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM sales_order_items i WHERE i.sales_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE sales_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;
  
  SELECT * INTO v_header FROM sales_order_headers WHERE id = order_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'cancel', 'sales_order', 'sales_order_headers', order_id, v_header.sales_order_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sales_order_soft_delete(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_before_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or already deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be deleted');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM sales_order_items i WHERE i.sales_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE sales_order_headers SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, updated_at = now() WHERE id = order_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'delete', 'sales_order', 'sales_order_headers', order_id, v_header.sales_order_number, v_before_json, NULL);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sales_order_create(header_data jsonb, items_data jsonb, attachment_meta jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_after_json JSONB;
  v_items_result JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  INSERT INTO sales_order_headers (
    sales_order_number, order_date, customer_id, customer_po_number, sales_name,
    allocation_type, project_instansi, delivery_deadline, ship_to_address, notes,
    po_document_url, status, total_amount, discount, tax_rate, shipping_cost, grand_total, created_by, is_deleted
  )
  VALUES (
    header_data->>'sales_order_number',
    (header_data->>'order_date')::date,
    (header_data->>'customer_id')::uuid,
    header_data->>'customer_po_number',
    header_data->>'sales_name',
    header_data->>'allocation_type',
    header_data->>'project_instansi',
    (header_data->>'delivery_deadline')::date,
    NULLIF(header_data->>'ship_to_address', ''),
    NULLIF(header_data->>'notes', ''),
    NULLIF(header_data->>'po_document_url', ''),
    COALESCE(header_data->>'status', 'draft'),
    COALESCE((header_data->>'total_amount')::numeric, 0),
    COALESCE((header_data->>'discount')::numeric, 0),
    COALESCE((header_data->>'tax_rate')::numeric, 0),
    COALESCE((header_data->>'shipping_cost')::numeric, 0),
    COALESCE((header_data->>'grand_total')::numeric, 0),
    v_user_id,
    false
  )
  RETURNING id INTO v_header_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO sales_order_items (sales_order_id, product_id, unit_price, ordered_qty, discount, notes)
    VALUES (
      v_header_id,
      (v_item->>'product_id')::uuid,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'ordered_qty')::integer, 1),
      COALESCE((v_item->>'discount')::numeric, 0),
      NULLIF(v_item->>'notes', '')
    );
  END LOOP;
  
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (module_name, ref_table, ref_id, file_key, url, mime_type, file_size, uploaded_by)
    VALUES ('sales_order', 'sales_order_headers', v_header_id, attachment_meta->>'file_key', attachment_meta->>'url', attachment_meta->>'mime_type', (attachment_meta->>'file_size')::bigint, v_user_id);
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result FROM sales_order_items i WHERE i.sales_order_id = v_header_id;
  v_after_json := jsonb_build_object('header', (SELECT row_to_json(h) FROM sales_order_headers h WHERE h.id = v_header_id), 'items', COALESCE(v_items_result, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'create', 'sales_order', 'sales_order_headers', v_header_id, header_data->>'sales_order_number', NULL, v_after_json);
  
  RETURN jsonb_build_object('success', true, 'id', v_header_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Sales order number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sales_order_update(order_id uuid, header_data jsonb, items_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_before_json JSONB;
  v_after_json JSONB;
  v_items_before JSONB;
  v_items_after JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be edited');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_before FROM sales_order_items i WHERE i.sales_order_id = order_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items_before, '[]'::jsonb));
  
  UPDATE sales_order_headers SET
    sales_order_number = COALESCE(header_data->>'sales_order_number', sales_order_number),
    order_date = COALESCE((header_data->>'order_date')::date, order_date),
    customer_id = COALESCE((header_data->>'customer_id')::uuid, customer_id),
    customer_po_number = COALESCE(header_data->>'customer_po_number', customer_po_number),
    sales_name = COALESCE(header_data->>'sales_name', sales_name),
    allocation_type = COALESCE(header_data->>'allocation_type', allocation_type),
    project_instansi = COALESCE(header_data->>'project_instansi', project_instansi),
    delivery_deadline = COALESCE((header_data->>'delivery_deadline')::date, delivery_deadline),
    ship_to_address = NULLIF(header_data->>'ship_to_address', ''),
    notes = NULLIF(header_data->>'notes', ''),
    po_document_url = NULLIF(header_data->>'po_document_url', ''),
    total_amount = COALESCE((header_data->>'total_amount')::numeric, total_amount),
    discount = COALESCE((header_data->>'discount')::numeric, discount),
    tax_rate = COALESCE((header_data->>'tax_rate')::numeric, tax_rate),
    shipping_cost = COALESCE((header_data->>'shipping_cost')::numeric, shipping_cost),
    grand_total = COALESCE((header_data->>'grand_total')::numeric, grand_total),
    updated_at = now()
  WHERE id = order_id;
  
  DELETE FROM sales_order_items WHERE sales_order_id = order_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO sales_order_items (sales_order_id, product_id, unit_price, ordered_qty, discount, notes)
    VALUES (
      order_id,
      (v_item->>'product_id')::uuid,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'ordered_qty')::integer, 1),
      COALESCE((v_item->>'discount')::numeric, 0),
      NULLIF(v_item->>'notes', '')
    );
  END LOOP;
  
  SELECT * INTO v_header FROM sales_order_headers WHERE id = order_id;
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_after FROM sales_order_items i WHERE i.sales_order_id = order_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items_after, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'update', 'sales_order', 'sales_order_headers', order_id, v_header.sales_order_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Sales order number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- Stock Adjustment functions
CREATE OR REPLACE FUNCTION public.stock_adjustment_approve(adjustment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_item RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role app_role;
  v_allow_admin_approve BOOLEAN;
  v_before_json JSONB;
  v_after_json JSONB;
  v_items JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  v_user_role := get_user_role(v_user_id);
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be approved');
  END IF;
  
  IF v_user_role != 'super_admin' THEN
    SELECT COALESCE((value::jsonb->>'value')::boolean, (value::text)::boolean, false) INTO v_allow_admin_approve 
    FROM settings WHERE key = 'allow_admin_approve';
    
    IF v_user_role != 'admin' OR NOT COALESCE(v_allow_admin_approve, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to approve adjustments');
    END IF;
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_approve.adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  FOR v_item IN SELECT * FROM stock_adjustment_items WHERE adjustment_id = stock_adjustment_approve.adjustment_id
  LOOP
    UPDATE inventory_batches 
    SET qty_on_hand = qty_on_hand + v_item.adjustment_qty,
        updated_at = now()
    WHERE id = v_item.batch_id;
    
    INSERT INTO stock_transactions (
      product_id, batch_id, transaction_type, quantity, 
      reference_type, reference_id, reference_number, created_by, notes
    )
    VALUES (
      v_item.product_id, v_item.batch_id, 
      CASE WHEN v_item.adjustment_qty >= 0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
      v_item.adjustment_qty, 
      'stock_adjustment', stock_adjustment_approve.adjustment_id, v_header.adjustment_number, 
      v_user_id, v_item.notes
    );
  END LOOP;
  
  UPDATE stock_adjustments SET 
    status = 'posted',
    approved_by = v_user_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = adjustment_id;
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'approve', 'stock_adjustment', 'stock_adjustments', adjustment_id, v_header.adjustment_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_adjustment_reject(adjustment_id uuid, reject_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_user_role app_role;
  v_allow_admin_approve BOOLEAN;
  v_before_json JSONB;
  v_after_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  v_user_role := get_user_role(v_user_id);
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be rejected');
  END IF;
  
  IF v_user_role != 'super_admin' THEN
    SELECT COALESCE((value::jsonb->>'value')::boolean, (value::text)::boolean, false) INTO v_allow_admin_approve 
    FROM settings WHERE key = 'allow_admin_approve';
    
    IF v_user_role != 'admin' OR NOT COALESCE(v_allow_admin_approve, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to reject adjustments');
    END IF;
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_reject.adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE stock_adjustments SET 
    status = 'rejected',
    rejected_reason = reject_reason,
    updated_at = now()
  WHERE id = adjustment_id;
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'reject', 'stock_adjustment', 'stock_adjustments', adjustment_id, v_header.adjustment_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_adjustment_create(header_data jsonb, items_data jsonb, attachment_meta jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_after_json JSONB;
  v_items_result JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  INSERT INTO stock_adjustments (
    adjustment_number, adjustment_date, reason, attachment_url,
    status, created_by, is_deleted
  )
  VALUES (
    header_data->>'adjustment_number',
    (header_data->>'adjustment_date')::date,
    header_data->>'reason',
    NULLIF(header_data->>'attachment_url', ''),
    COALESCE(header_data->>'status', 'draft'),
    v_user_id,
    false
  )
  RETURNING id INTO v_header_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes)
    VALUES (
      v_header_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'batch_id')::uuid,
      COALESCE((v_item->>'adjustment_qty')::integer, 0),
      NULLIF(v_item->>'notes', '')
    );
  END LOOP;
  
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (module_name, ref_table, ref_id, file_key, url, mime_type, file_size, uploaded_by)
    VALUES (
      'stock_adjustment',
      'stock_adjustments',
      v_header_id,
      attachment_meta->>'file_key',
      attachment_meta->>'url',
      attachment_meta->>'mime_type',
      (attachment_meta->>'file_size')::bigint,
      v_user_id
    );
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result FROM stock_adjustment_items i WHERE i.adjustment_id = v_header_id;
  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM stock_adjustments h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb)
  );
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'create', 'stock_adjustment', 'stock_adjustments', v_header_id, header_data->>'adjustment_number', NULL, v_after_json);
  
  RETURN jsonb_build_object('success', true, 'id', v_header_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Adjustment number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_adjustment_update(adjustment_id uuid, header_data jsonb, items_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_before_json JSONB;
  v_after_json JSONB;
  v_items_before JSONB;
  v_items_after JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be edited');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_before FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_update.adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items_before, '[]'::jsonb));
  
  UPDATE stock_adjustments SET
    adjustment_number = COALESCE(header_data->>'adjustment_number', adjustment_number),
    adjustment_date = COALESCE((header_data->>'adjustment_date')::date, adjustment_date),
    reason = COALESCE(header_data->>'reason', reason),
    attachment_url = NULLIF(header_data->>'attachment_url', ''),
    updated_at = now()
  WHERE id = adjustment_id;
  
  DELETE FROM stock_adjustment_items WHERE stock_adjustment_items.adjustment_id = stock_adjustment_update.adjustment_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes)
    VALUES (
      stock_adjustment_update.adjustment_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'batch_id')::uuid,
      COALESCE((v_item->>'adjustment_qty')::integer, 0),
      NULLIF(v_item->>'notes', '')
    );
  END LOOP;
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id;
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_after FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_update.adjustment_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items_after, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'update', 'stock_adjustment', 'stock_adjustments', adjustment_id, v_header.adjustment_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Adjustment number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_adjustment_soft_delete(adjustment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_before_json JSONB;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or already deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be deleted');
  END IF;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_soft_delete.adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  UPDATE stock_adjustments SET 
    is_deleted = true,
    deleted_at = now(),
    deleted_by = v_user_id,
    updated_at = now()
  WHERE id = adjustment_id;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'delete', 'stock_adjustment', 'stock_adjustments', adjustment_id, v_header.adjustment_number, v_before_json, NULL);
  
  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Stock In/Out functions
CREATE OR REPLACE FUNCTION public.stock_in_create(header_data jsonb, items_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_plan_order_id UUID;
  v_after_json JSONB;
  v_items_result JSONB;
  v_existing_batch RECORD;
  v_total_received INTEGER;
  v_all_received BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  v_plan_order_id := (header_data->>'plan_order_id')::uuid;
  
  IF NOT EXISTS (
    SELECT 1 FROM plan_order_headers 
    WHERE id = v_plan_order_id 
    AND status IN ('approved', 'partially_received')
    AND (is_deleted = false OR is_deleted IS NULL)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or not in approved/partially_received status');
  END IF;
  
  INSERT INTO stock_in_headers (
    stock_in_number, plan_order_id, received_date, 
    delivery_note_url, notes, created_by
  )
  VALUES (
    header_data->>'stock_in_number',
    v_plan_order_id,
    COALESCE((header_data->>'received_date')::date, CURRENT_DATE),
    NULLIF(header_data->>'delivery_note_url', ''),
    NULLIF(header_data->>'notes', ''),
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    IF (v_item->>'qty_received')::integer > COALESCE((v_item->>'qty_remaining')::integer, 999999) THEN
      RAISE EXCEPTION 'Quantity received (%) exceeds remaining (%) for product', 
        (v_item->>'qty_received')::integer, (v_item->>'qty_remaining')::integer;
    END IF;
    
    INSERT INTO stock_in_items (
      stock_in_id, plan_order_item_id, product_id, 
      qty_received, batch_no, expired_date
    )
    VALUES (
      v_header_id,
      (v_item->>'plan_order_item_id')::uuid,
      (v_item->>'product_id')::uuid,
      (v_item->>'qty_received')::integer,
      v_item->>'batch_no',
      NULLIF(v_item->>'expired_date', '')::date
    );
    
    SELECT id, qty_on_hand INTO v_existing_batch 
    FROM inventory_batches 
    WHERE product_id = (v_item->>'product_id')::uuid 
    AND batch_no = v_item->>'batch_no';
    
    IF v_existing_batch.id IS NOT NULL THEN
      UPDATE inventory_batches 
      SET qty_on_hand = qty_on_hand + (v_item->>'qty_received')::integer,
          expired_date = COALESCE(NULLIF(v_item->>'expired_date', '')::date, expired_date),
          updated_at = now()
      WHERE id = v_existing_batch.id;
    ELSE
      INSERT INTO inventory_batches (product_id, batch_no, qty_on_hand, expired_date)
      VALUES (
        (v_item->>'product_id')::uuid,
        v_item->>'batch_no',
        (v_item->>'qty_received')::integer,
        NULLIF(v_item->>'expired_date', '')::date
      );
    END IF;
    
    INSERT INTO stock_transactions (
      product_id, transaction_type, quantity,
      reference_type, reference_id, reference_number, created_by, notes
    )
    VALUES (
      (v_item->>'product_id')::uuid,
      'inbound',
      (v_item->>'qty_received')::integer,
      'stock_in',
      v_header_id,
      header_data->>'stock_in_number',
      v_user_id,
      v_item->>'notes'
    );
    
    SELECT COALESCE(SUM(qty_received), 0) INTO v_total_received
    FROM stock_in_items
    WHERE plan_order_item_id = (v_item->>'plan_order_item_id')::uuid;
    
    UPDATE plan_order_items
    SET qty_received = v_total_received
    WHERE id = (v_item->>'plan_order_item_id')::uuid;
  END LOOP;
  
  SELECT NOT EXISTS (
    SELECT 1 FROM plan_order_items 
    WHERE plan_order_id = v_plan_order_id 
    AND COALESCE(qty_remaining, planned_qty - COALESCE(qty_received, 0)) > 0
  ) INTO v_all_received;
  
  UPDATE plan_order_headers
  SET status = CASE WHEN v_all_received THEN 'received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = v_plan_order_id;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result 
  FROM stock_in_items i WHERE i.stock_in_id = v_header_id;
  
  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM stock_in_headers h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb)
  );
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'create', 'stock_in', 'stock_in_headers', v_header_id, header_data->>'stock_in_number', NULL, v_after_json);
  
  RETURN jsonb_build_object('success', true, 'id', v_header_id);
  
EXCEPTION 
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock in number already exists');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_out_create(header_data jsonb, items_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_header_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_batch JSONB;
  v_sales_order_id UUID;
  v_after_json JSONB;
  v_items_result JSONB;
  v_current_qty_on_hand INTEGER;
  v_so_item RECORD;
  v_new_qty_delivered INTEGER;
  v_all_delivered BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  v_user_email := get_user_email(v_user_id);
  
  v_sales_order_id := (header_data->>'sales_order_id')::uuid;
  
  IF NOT EXISTS (
    SELECT 1 FROM sales_order_headers 
    WHERE id = v_sales_order_id 
    AND status IN ('approved', 'partial')
    AND (is_deleted = false OR is_deleted IS NULL)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or not in approved/partial status');
  END IF;
  
  INSERT INTO stock_out_headers (
    stock_out_number, sales_order_id, delivery_date, 
    delivery_note_url, notes, created_by
  )
  VALUES (
    header_data->>'stock_out_number',
    v_sales_order_id,
    COALESCE((header_data->>'delivery_date')::date, CURRENT_DATE),
    NULLIF(header_data->>'delivery_note_url', ''),
    NULLIF(header_data->>'notes', ''),
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    FOR v_batch IN SELECT * FROM jsonb_array_elements(v_item->'batches')
    LOOP
      SELECT qty_on_hand INTO v_current_qty_on_hand 
      FROM inventory_batches 
      WHERE id = (v_batch->>'batch_id')::uuid;
      
      IF v_current_qty_on_hand IS NULL THEN
        RAISE EXCEPTION 'Batch not found: %', v_batch->>'batch_id';
      END IF;
      
      IF v_current_qty_on_hand < (v_batch->>'qty_out')::integer THEN
        RAISE EXCEPTION 'Insufficient stock in batch. Available: %, Requested: %', 
          v_current_qty_on_hand, (v_batch->>'qty_out')::integer;
      END IF;
      
      INSERT INTO stock_out_items (
        stock_out_id, sales_order_item_id, product_id, batch_id, qty_out
      )
      VALUES (
        v_header_id,
        (v_item->>'sales_order_item_id')::uuid,
        (v_item->>'product_id')::uuid,
        (v_batch->>'batch_id')::uuid,
        (v_batch->>'qty_out')::integer
      );
      
      UPDATE inventory_batches 
      SET qty_on_hand = qty_on_hand - (v_batch->>'qty_out')::integer,
          updated_at = now()
      WHERE id = (v_batch->>'batch_id')::uuid;
      
      INSERT INTO stock_transactions (
        product_id, batch_id, transaction_type, quantity,
        reference_type, reference_id, reference_number, created_by, notes
      )
      VALUES (
        (v_item->>'product_id')::uuid,
        (v_batch->>'batch_id')::uuid,
        'outbound',
        -(v_batch->>'qty_out')::integer,
        'stock_out',
        v_header_id,
        header_data->>'stock_out_number',
        v_user_id,
        v_batch->>'notes'
      );
    END LOOP;
    
    SELECT qty_delivered INTO v_so_item 
    FROM sales_order_items 
    WHERE id = (v_item->>'sales_order_item_id')::uuid;
    
    v_new_qty_delivered := COALESCE(v_so_item.qty_delivered, 0) + (v_item->>'total_qty_out')::integer;
    
    UPDATE sales_order_items
    SET qty_delivered = v_new_qty_delivered
    WHERE id = (v_item->>'sales_order_item_id')::uuid;
  END LOOP;
  
  SELECT NOT EXISTS (
    SELECT 1 FROM sales_order_items 
    WHERE sales_order_id = v_sales_order_id 
    AND COALESCE(qty_remaining, ordered_qty - COALESCE(qty_delivered, 0)) > 0
  ) INTO v_all_delivered;
  
  UPDATE sales_order_headers
  SET status = CASE WHEN v_all_delivered THEN 'delivered' ELSE 'partial' END,
      updated_at = now()
  WHERE id = v_sales_order_id;
  
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result 
  FROM stock_out_items i WHERE i.stock_out_id = v_header_id;
  
  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM stock_out_headers h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb)
  );
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'create', 'stock_out', 'stock_out_headers', v_header_id, header_data->>'stock_out_number', NULL, v_after_json);
  
  RETURN jsonb_build_object('success', true, 'id', v_header_id);
  
EXCEPTION 
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock out number already exists');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;