-- 1) Add soft delete fields to sales_order_headers
ALTER TABLE public.sales_order_headers 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- 2) Add unique constraint on sales_order_number (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_headers_sales_order_number_key') THEN
    ALTER TABLE public.sales_order_headers ADD CONSTRAINT sales_order_headers_sales_order_number_key UNIQUE (sales_order_number);
  END IF;
END $$;

-- 3) Create index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_sales_order_headers_is_deleted ON sales_order_headers(is_deleted);

-- 4) Create RPC function: sales_order_approve
CREATE OR REPLACE FUNCTION public.sales_order_approve(order_id UUID)
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
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
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
$$;

-- 5) Create RPC function: sales_order_cancel
CREATE OR REPLACE FUNCTION public.sales_order_cancel(order_id UUID)
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
  v_total_delivered INTEGER;
  v_before_json JSONB;
  v_after_json JSONB;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
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
$$;

-- 6) Create RPC function: sales_order_soft_delete
CREATE OR REPLACE FUNCTION public.sales_order_soft_delete(order_id UUID)
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
$$;

-- 7) Create RPC function: sales_order_create
CREATE OR REPLACE FUNCTION public.sales_order_create(header_data JSONB, items_data JSONB, attachment_meta JSONB DEFAULT NULL)
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
$$;

-- 8) Create RPC function: sales_order_update
CREATE OR REPLACE FUNCTION public.sales_order_update(order_id UUID, header_data JSONB, items_data JSONB)
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
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.sales_order_approve(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_cancel(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_soft_delete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_create(JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_update(UUID, JSONB, JSONB) TO authenticated;