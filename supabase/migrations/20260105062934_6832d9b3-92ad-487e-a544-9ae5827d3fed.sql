-- 1) Add soft delete fields to plan_order_headers
ALTER TABLE public.plan_order_headers 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- 2) Add unique constraint on plan_number (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_order_headers_plan_number_key') THEN
    ALTER TABLE public.plan_order_headers ADD CONSTRAINT plan_order_headers_plan_number_key UNIQUE (plan_number);
  END IF;
END $$;

-- 3) Add ref_no column to audit_logs if missing
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ref_no TEXT NULL;

-- 4) Create RPC function: plan_order_approve
CREATE OR REPLACE FUNCTION public.plan_order_approve(order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Get current user
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  v_user_role := get_user_role(v_user_id);
  
  -- Fetch header
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or deleted');
  END IF;
  
  -- Validate status is draft
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be approved');
  END IF;
  
  -- Check approval permission
  IF v_user_role != 'super_admin' THEN
    SELECT COALESCE((value::jsonb->>'value')::boolean, (value::text)::boolean, false) INTO v_allow_admin_approve 
    FROM settings WHERE key = 'allow_admin_approve';
    
    IF v_user_role != 'admin' OR NOT COALESCE(v_allow_admin_approve, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to approve orders');
    END IF;
  END IF;
  
  -- Capture before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object(
    'header', row_to_json(v_header),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
  
  -- Update header
  UPDATE plan_order_headers SET 
    status = 'approved',
    approved_by = v_user_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = order_id;
  
  -- Capture after snapshot
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id;
  v_after_json := jsonb_build_object(
    'header', row_to_json(v_header),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
  
  -- Insert audit log
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'approve', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5) Create RPC function: plan_order_cancel
CREATE OR REPLACE FUNCTION public.plan_order_cancel(order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Fetch header
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or deleted');
  END IF;
  
  -- Validate cancel conditions
  IF v_header.status = 'draft' THEN
    -- OK to cancel
  ELSIF v_header.status = 'approved' THEN
    -- Check if any receiving has happened
    SELECT COALESCE(SUM(qty_received), 0) INTO v_total_received 
    FROM plan_order_items WHERE plan_order_id = order_id;
    
    IF v_total_received > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel order with received items');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Only draft or approved orders (with no receiving) can be cancelled');
  END IF;
  
  -- Capture before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object(
    'header', row_to_json(v_header),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
  
  -- Update status
  UPDATE plan_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;
  
  -- Capture after snapshot
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id;
  v_after_json := jsonb_build_object(
    'header', row_to_json(v_header),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
  
  -- Insert audit log
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'cancel', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6) Create RPC function: plan_order_soft_delete
CREATE OR REPLACE FUNCTION public.plan_order_soft_delete(order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_header RECORD;
  v_items JSONB;
  v_user_id UUID;
  v_user_email TEXT;
  v_before_json JSONB;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Fetch header
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or already deleted');
  END IF;
  
  -- Validate status is draft
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be deleted');
  END IF;
  
  -- Capture before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object(
    'header', row_to_json(v_header),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
  
  -- Soft delete
  UPDATE plan_order_headers SET 
    is_deleted = true,
    deleted_at = now(),
    deleted_by = v_user_id,
    updated_at = now()
  WHERE id = order_id;
  
  -- Insert audit log
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'delete', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, NULL);
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7) Create RPC function: plan_order_create with audit logging
CREATE OR REPLACE FUNCTION public.plan_order_create(
  header_data JSONB,
  items_data JSONB,
  attachment_meta JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_header_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
  v_after_json JSONB;
  v_items_result JSONB;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Insert header
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
  
  -- Insert items
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
  
  -- Insert attachment metadata if provided
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
  
  -- Build after snapshot for audit
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result FROM plan_order_items i WHERE i.plan_order_id = v_header_id;
  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM plan_order_headers h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb)
  );
  
  -- Insert audit log
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'create', 'plan_order', 'plan_order_headers', v_header_id, header_data->>'plan_number', NULL, v_after_json);
  
  RETURN jsonb_build_object('success', true, 'id', v_header_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Plan number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8) Create RPC function: plan_order_update with audit logging
CREATE OR REPLACE FUNCTION public.plan_order_update(
  order_id UUID,
  header_data JSONB,
  items_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Fetch header
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or deleted');
  END IF;
  
  -- Validate status is draft
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft orders can be edited');
  END IF;
  
  -- Capture before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_before FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_before_json := jsonb_build_object(
    'header', row_to_json(v_header),
    'items', COALESCE(v_items_before, '[]'::jsonb)
  );
  
  -- Update header
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
  
  -- Delete old items and insert new ones
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
  
  -- Capture after snapshot
  SELECT * INTO v_header FROM plan_order_headers WHERE id = order_id;
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_after FROM plan_order_items i WHERE i.plan_order_id = order_id;
  v_after_json := jsonb_build_object(
    'header', row_to_json(v_header),
    'items', COALESCE(v_items_after, '[]'::jsonb)
  );
  
  -- Insert audit log
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'update', 'plan_order', 'plan_order_headers', order_id, v_header.plan_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Plan number already exists');
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 9) Add index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_plan_order_headers_is_deleted ON plan_order_headers(is_deleted);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.plan_order_approve(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_order_cancel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_order_soft_delete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_order_create(JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_order_update(UUID, JSONB, JSONB) TO authenticated;