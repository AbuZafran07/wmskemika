-- ============================================
-- INPUT VALIDATION HELPER FUNCTIONS
-- For RPC JSON input validation (security hardening)
-- ============================================

-- Validate positive quantity with upper limit
CREATE OR REPLACE FUNCTION public.validate_quantity(qty integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN qty IS NOT NULL AND qty > 0 AND qty <= 1000000;
END;
$$;

-- Validate quantity can be zero (for adjustments that reduce stock)
CREATE OR REPLACE FUNCTION public.validate_quantity_allow_zero(qty integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN qty IS NOT NULL AND qty >= 0 AND qty <= 1000000;
END;
$$;

-- Validate adjustment quantity (can be negative for stock reductions)
CREATE OR REPLACE FUNCTION public.validate_adjustment_quantity(qty integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN qty IS NOT NULL AND qty >= -1000000 AND qty <= 1000000 AND qty != 0;
END;
$$;

-- Validate date is within reasonable range (not too far in past or future)
CREATE OR REPLACE FUNCTION public.validate_date_reasonable(dt date)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN dt IS NOT NULL 
    AND dt >= (CURRENT_DATE - INTERVAL '2 years')::date
    AND dt <= (CURRENT_DATE + INTERVAL '5 years')::date;
END;
$$;

-- Validate end date is after start date
CREATE OR REPLACE FUNCTION public.validate_date_range(start_date date, end_date date)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF end_date IS NULL THEN
    RETURN true; -- Optional end date
  END IF;
  RETURN end_date >= start_date;
END;
$$;

-- Validate price/amount is non-negative and within reasonable bounds
CREATE OR REPLACE FUNCTION public.validate_price(price numeric)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN price IS NOT NULL AND price >= 0 AND price <= 999999999999.99;
END;
$$;

-- Validate percentage (0-100)
CREATE OR REPLACE FUNCTION public.validate_percentage(pct numeric)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF pct IS NULL THEN
    RETURN true; -- Optional field
  END IF;
  RETURN pct >= 0 AND pct <= 100;
END;
$$;

-- Validate string length
CREATE OR REPLACE FUNCTION public.validate_string_length(str text, max_length integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF str IS NULL THEN
    RETURN true;
  END IF;
  RETURN length(str) <= max_length;
END;
$$;

-- Validate UUID exists in a table
CREATE OR REPLACE FUNCTION public.validate_uuid_exists(table_name text, uuid_val uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_check boolean;
BEGIN
  IF uuid_val IS NULL THEN
    RETURN false;
  END IF;
  
  -- Only allow specific tables to be checked
  IF table_name NOT IN ('products', 'suppliers', 'customers', 'inventory_batches', 'plan_order_headers', 'sales_order_headers', 'plan_order_items', 'sales_order_items') THEN
    RETURN false;
  END IF;
  
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1)', table_name)
  INTO exists_check
  USING uuid_val;
  
  RETURN exists_check;
END;
$$;

-- ============================================
-- UPDATE plan_order_create WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.plan_order_create(
  header_data json,
  items_data json,
  attachment_meta json DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_header_id uuid;
  v_item json;
  v_plan_date date;
  v_expected_delivery date;
  v_supplier_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Validate header fields
  v_plan_date := (header_data->>'plan_date')::date;
  IF NOT validate_date_reasonable(v_plan_date) THEN
    RETURN json_build_object('success', false, 'error', 'Plan date is invalid or out of reasonable range');
  END IF;
  
  v_expected_delivery := (header_data->>'expected_delivery_date')::date;
  IF v_expected_delivery IS NOT NULL AND NOT validate_date_range(v_plan_date, v_expected_delivery) THEN
    RETURN json_build_object('success', false, 'error', 'Expected delivery date must be on or after plan date');
  END IF;
  
  v_supplier_id := (header_data->>'supplier_id')::uuid;
  IF NOT validate_uuid_exists('suppliers', v_supplier_id) THEN
    RETURN json_build_object('success', false, 'error', 'Supplier not found');
  END IF;
  
  -- Validate string lengths
  IF NOT validate_string_length(header_data->>'plan_number', 100) THEN
    RETURN json_build_object('success', false, 'error', 'Plan number exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'notes', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Notes exceed maximum length');
  END IF;
  
  -- Validate percentage fields
  IF NOT validate_percentage((header_data->>'tax_rate')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Tax rate must be between 0 and 100');
  END IF;
  
  IF NOT validate_percentage((header_data->>'discount')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Discount must be between 0 and 100');
  END IF;
  
  -- Validate price fields
  IF (header_data->>'shipping_cost') IS NOT NULL AND NOT validate_price((header_data->>'shipping_cost')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Shipping cost is invalid');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found: ' || (v_item->>'product_id'));
    END IF;
    
    IF NOT validate_quantity((v_item->>'planned_qty')::integer) THEN
      RETURN json_build_object('success', false, 'error', 'Quantity must be between 1 and 1,000,000');
    END IF;
    
    IF NOT validate_price((v_item->>'unit_price')::numeric) THEN
      RETURN json_build_object('success', false, 'error', 'Unit price is invalid');
    END IF;
  END LOOP;
  
  -- Insert header
  INSERT INTO plan_order_headers (
    plan_number,
    plan_date,
    supplier_id,
    expected_delivery_date,
    notes,
    reference_no,
    po_document_url,
    tax_rate,
    discount,
    shipping_cost,
    total_amount,
    grand_total,
    status,
    created_by
  ) VALUES (
    header_data->>'plan_number',
    v_plan_date,
    v_supplier_id,
    v_expected_delivery,
    header_data->>'notes',
    header_data->>'reference_no',
    header_data->>'po_document_url',
    COALESCE((header_data->>'tax_rate')::numeric, 0),
    COALESCE((header_data->>'discount')::numeric, 0),
    COALESCE((header_data->>'shipping_cost')::numeric, 0),
    COALESCE((header_data->>'total_amount')::numeric, 0),
    COALESCE((header_data->>'grand_total')::numeric, 0),
    'draft',
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  -- Insert items
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    INSERT INTO plan_order_items (
      plan_order_id,
      product_id,
      planned_qty,
      unit_price,
      subtotal,
      qty_remaining,
      notes
    ) VALUES (
      v_header_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'planned_qty')::integer,
      (v_item->>'unit_price')::numeric,
      (v_item->>'planned_qty')::integer * (v_item->>'unit_price')::numeric,
      (v_item->>'planned_qty')::integer,
      v_item->>'notes'
    );
  END LOOP;
  
  -- Handle attachment
  IF attachment_meta IS NOT NULL AND attachment_meta->>'url' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, url, file_key, uploaded_by)
    VALUES (
      'plan_order_headers',
      v_header_id,
      'plan_order',
      attachment_meta->>'url',
      COALESCE(attachment_meta->>'file_key', attachment_meta->>'url'),
      v_user_id
    );
  END IF;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, new_data, user_id, user_email)
  VALUES (
    'plan_order',
    'create',
    'plan_order_headers',
    v_header_id,
    header_data->>'plan_number',
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true, 'id', v_header_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;

-- ============================================
-- UPDATE plan_order_update WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.plan_order_update(
  order_id uuid,
  header_data json,
  items_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_old_data json;
  v_current_status text;
  v_item json;
  v_plan_date date;
  v_expected_delivery date;
  v_supplier_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Check order exists and get current status
  SELECT status, row_to_json(plan_order_headers.*)
  INTO v_current_status, v_old_data
  FROM plan_order_headers
  WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;
  
  IF v_current_status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Only draft orders can be edited');
  END IF;
  
  -- Validate header fields
  v_plan_date := (header_data->>'plan_date')::date;
  IF NOT validate_date_reasonable(v_plan_date) THEN
    RETURN json_build_object('success', false, 'error', 'Plan date is invalid or out of reasonable range');
  END IF;
  
  v_expected_delivery := (header_data->>'expected_delivery_date')::date;
  IF v_expected_delivery IS NOT NULL AND NOT validate_date_range(v_plan_date, v_expected_delivery) THEN
    RETURN json_build_object('success', false, 'error', 'Expected delivery date must be on or after plan date');
  END IF;
  
  v_supplier_id := (header_data->>'supplier_id')::uuid;
  IF NOT validate_uuid_exists('suppliers', v_supplier_id) THEN
    RETURN json_build_object('success', false, 'error', 'Supplier not found');
  END IF;
  
  -- Validate string lengths
  IF NOT validate_string_length(header_data->>'notes', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Notes exceed maximum length');
  END IF;
  
  -- Validate percentage fields
  IF NOT validate_percentage((header_data->>'tax_rate')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Tax rate must be between 0 and 100');
  END IF;
  
  IF NOT validate_percentage((header_data->>'discount')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Discount must be between 0 and 100');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    IF NOT validate_quantity((v_item->>'planned_qty')::integer) THEN
      RETURN json_build_object('success', false, 'error', 'Quantity must be between 1 and 1,000,000');
    END IF;
    
    IF NOT validate_price((v_item->>'unit_price')::numeric) THEN
      RETURN json_build_object('success', false, 'error', 'Unit price is invalid');
    END IF;
  END LOOP;
  
  -- Update header
  UPDATE plan_order_headers SET
    plan_date = v_plan_date,
    supplier_id = v_supplier_id,
    expected_delivery_date = v_expected_delivery,
    notes = header_data->>'notes',
    reference_no = header_data->>'reference_no',
    po_document_url = header_data->>'po_document_url',
    tax_rate = COALESCE((header_data->>'tax_rate')::numeric, 0),
    discount = COALESCE((header_data->>'discount')::numeric, 0),
    shipping_cost = COALESCE((header_data->>'shipping_cost')::numeric, 0),
    total_amount = COALESCE((header_data->>'total_amount')::numeric, 0),
    grand_total = COALESCE((header_data->>'grand_total')::numeric, 0),
    updated_at = now()
  WHERE id = order_id;
  
  -- Delete old items and insert new ones
  DELETE FROM plan_order_items WHERE plan_order_id = order_id;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    INSERT INTO plan_order_items (
      plan_order_id,
      product_id,
      planned_qty,
      unit_price,
      subtotal,
      qty_remaining,
      notes
    ) VALUES (
      order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'planned_qty')::integer,
      (v_item->>'unit_price')::numeric,
      (v_item->>'planned_qty')::integer * (v_item->>'unit_price')::numeric,
      (v_item->>'planned_qty')::integer,
      v_item->>'notes'
    );
  END LOOP;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, old_data, new_data, user_id, user_email)
  VALUES (
    'plan_order',
    'update',
    'plan_order_headers',
    order_id,
    v_old_data,
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;

-- ============================================
-- UPDATE sales_order_create WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.sales_order_create(
  header_data json,
  items_data json,
  attachment_meta json DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_header_id uuid;
  v_item json;
  v_order_date date;
  v_delivery_deadline date;
  v_customer_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Validate header fields
  v_order_date := COALESCE((header_data->>'order_date')::date, CURRENT_DATE);
  IF NOT validate_date_reasonable(v_order_date) THEN
    RETURN json_build_object('success', false, 'error', 'Order date is invalid or out of reasonable range');
  END IF;
  
  v_delivery_deadline := (header_data->>'delivery_deadline')::date;
  IF NOT validate_date_reasonable(v_delivery_deadline) THEN
    RETURN json_build_object('success', false, 'error', 'Delivery deadline is invalid or out of reasonable range');
  END IF;
  
  IF NOT validate_date_range(v_order_date, v_delivery_deadline) THEN
    RETURN json_build_object('success', false, 'error', 'Delivery deadline must be on or after order date');
  END IF;
  
  v_customer_id := (header_data->>'customer_id')::uuid;
  IF NOT validate_uuid_exists('customers', v_customer_id) THEN
    RETURN json_build_object('success', false, 'error', 'Customer not found');
  END IF;
  
  -- Validate string lengths
  IF NOT validate_string_length(header_data->>'sales_order_number', 100) THEN
    RETURN json_build_object('success', false, 'error', 'Sales order number exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'customer_po_number', 100) THEN
    RETURN json_build_object('success', false, 'error', 'Customer PO number exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'sales_name', 200) THEN
    RETURN json_build_object('success', false, 'error', 'Sales name exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'project_instansi', 500) THEN
    RETURN json_build_object('success', false, 'error', 'Project/Instansi exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'notes', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Notes exceed maximum length');
  END IF;
  
  -- Validate percentage fields
  IF NOT validate_percentage((header_data->>'tax_rate')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Tax rate must be between 0 and 100');
  END IF;
  
  IF NOT validate_percentage((header_data->>'discount')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Discount must be between 0 and 100');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found: ' || (v_item->>'product_id'));
    END IF;
    
    IF NOT validate_quantity((v_item->>'ordered_qty')::integer) THEN
      RETURN json_build_object('success', false, 'error', 'Quantity must be between 1 and 1,000,000');
    END IF;
    
    IF NOT validate_price((v_item->>'unit_price')::numeric) THEN
      RETURN json_build_object('success', false, 'error', 'Unit price is invalid');
    END IF;
  END LOOP;
  
  -- Insert header
  INSERT INTO sales_order_headers (
    sales_order_number,
    order_date,
    customer_id,
    customer_po_number,
    sales_name,
    project_instansi,
    delivery_deadline,
    allocation_type,
    ship_to_address,
    notes,
    po_document_url,
    tax_rate,
    discount,
    shipping_cost,
    total_amount,
    grand_total,
    status,
    created_by
  ) VALUES (
    header_data->>'sales_order_number',
    v_order_date,
    v_customer_id,
    header_data->>'customer_po_number',
    header_data->>'sales_name',
    header_data->>'project_instansi',
    v_delivery_deadline,
    COALESCE(header_data->>'allocation_type', 'FEFO'),
    header_data->>'ship_to_address',
    header_data->>'notes',
    header_data->>'po_document_url',
    COALESCE((header_data->>'tax_rate')::numeric, 0),
    COALESCE((header_data->>'discount')::numeric, 0),
    COALESCE((header_data->>'shipping_cost')::numeric, 0),
    COALESCE((header_data->>'total_amount')::numeric, 0),
    COALESCE((header_data->>'grand_total')::numeric, 0),
    'draft',
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  -- Insert items
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    INSERT INTO sales_order_items (
      sales_order_id,
      product_id,
      ordered_qty,
      unit_price,
      discount,
      tax_rate,
      subtotal,
      qty_remaining,
      notes
    ) VALUES (
      v_header_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'ordered_qty')::integer,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount')::numeric, 0),
      COALESCE((v_item->>'tax_rate')::numeric, 0),
      (v_item->>'ordered_qty')::integer * (v_item->>'unit_price')::numeric,
      (v_item->>'ordered_qty')::integer,
      v_item->>'notes'
    );
  END LOOP;
  
  -- Handle attachment
  IF attachment_meta IS NOT NULL AND attachment_meta->>'url' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, url, file_key, uploaded_by)
    VALUES (
      'sales_order_headers',
      v_header_id,
      'sales_order',
      attachment_meta->>'url',
      COALESCE(attachment_meta->>'file_key', attachment_meta->>'url'),
      v_user_id
    );
  END IF;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, new_data, user_id, user_email)
  VALUES (
    'sales_order',
    'create',
    'sales_order_headers',
    v_header_id,
    header_data->>'sales_order_number',
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true, 'id', v_header_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;

-- ============================================
-- UPDATE sales_order_update WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.sales_order_update(
  order_id uuid,
  header_data json,
  items_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_old_data json;
  v_current_status text;
  v_item json;
  v_order_date date;
  v_delivery_deadline date;
  v_customer_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Check order exists and get current status
  SELECT status, row_to_json(sales_order_headers.*)
  INTO v_current_status, v_old_data
  FROM sales_order_headers
  WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;
  
  IF v_current_status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Only draft orders can be edited');
  END IF;
  
  -- Validate header fields
  v_order_date := COALESCE((header_data->>'order_date')::date, CURRENT_DATE);
  IF NOT validate_date_reasonable(v_order_date) THEN
    RETURN json_build_object('success', false, 'error', 'Order date is invalid or out of reasonable range');
  END IF;
  
  v_delivery_deadline := (header_data->>'delivery_deadline')::date;
  IF NOT validate_date_reasonable(v_delivery_deadline) THEN
    RETURN json_build_object('success', false, 'error', 'Delivery deadline is invalid');
  END IF;
  
  IF NOT validate_date_range(v_order_date, v_delivery_deadline) THEN
    RETURN json_build_object('success', false, 'error', 'Delivery deadline must be on or after order date');
  END IF;
  
  v_customer_id := (header_data->>'customer_id')::uuid;
  IF NOT validate_uuid_exists('customers', v_customer_id) THEN
    RETURN json_build_object('success', false, 'error', 'Customer not found');
  END IF;
  
  -- Validate string lengths
  IF NOT validate_string_length(header_data->>'notes', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Notes exceed maximum length');
  END IF;
  
  -- Validate percentage fields
  IF NOT validate_percentage((header_data->>'tax_rate')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Tax rate must be between 0 and 100');
  END IF;
  
  IF NOT validate_percentage((header_data->>'discount')::numeric) THEN
    RETURN json_build_object('success', false, 'error', 'Discount must be between 0 and 100');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    IF NOT validate_quantity((v_item->>'ordered_qty')::integer) THEN
      RETURN json_build_object('success', false, 'error', 'Quantity must be between 1 and 1,000,000');
    END IF;
    
    IF NOT validate_price((v_item->>'unit_price')::numeric) THEN
      RETURN json_build_object('success', false, 'error', 'Unit price is invalid');
    END IF;
  END LOOP;
  
  -- Update header
  UPDATE sales_order_headers SET
    order_date = v_order_date,
    customer_id = v_customer_id,
    customer_po_number = header_data->>'customer_po_number',
    sales_name = header_data->>'sales_name',
    project_instansi = header_data->>'project_instansi',
    delivery_deadline = v_delivery_deadline,
    allocation_type = COALESCE(header_data->>'allocation_type', 'FEFO'),
    ship_to_address = header_data->>'ship_to_address',
    notes = header_data->>'notes',
    po_document_url = header_data->>'po_document_url',
    tax_rate = COALESCE((header_data->>'tax_rate')::numeric, 0),
    discount = COALESCE((header_data->>'discount')::numeric, 0),
    shipping_cost = COALESCE((header_data->>'shipping_cost')::numeric, 0),
    total_amount = COALESCE((header_data->>'total_amount')::numeric, 0),
    grand_total = COALESCE((header_data->>'grand_total')::numeric, 0),
    updated_at = now()
  WHERE id = order_id;
  
  -- Delete old items and insert new ones
  DELETE FROM sales_order_items WHERE sales_order_id = order_id;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    INSERT INTO sales_order_items (
      sales_order_id,
      product_id,
      ordered_qty,
      unit_price,
      discount,
      tax_rate,
      subtotal,
      qty_remaining,
      notes
    ) VALUES (
      order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'ordered_qty')::integer,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount')::numeric, 0),
      COALESCE((v_item->>'tax_rate')::numeric, 0),
      (v_item->>'ordered_qty')::integer * (v_item->>'unit_price')::numeric,
      (v_item->>'ordered_qty')::integer,
      v_item->>'notes'
    );
  END LOOP;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, old_data, new_data, user_id, user_email)
  VALUES (
    'sales_order',
    'update',
    'sales_order_headers',
    order_id,
    v_old_data,
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;

-- ============================================
-- UPDATE stock_adjustment_create WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.stock_adjustment_create(
  header_data json,
  items_data json,
  attachment_meta json DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_header_id uuid;
  v_item json;
  v_adjustment_date date;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Validate header fields
  v_adjustment_date := COALESCE((header_data->>'adjustment_date')::date, CURRENT_DATE);
  IF NOT validate_date_reasonable(v_adjustment_date) THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment date is invalid or out of reasonable range');
  END IF;
  
  -- Validate string lengths
  IF NOT validate_string_length(header_data->>'adjustment_number', 100) THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment number exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'reason', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Reason exceeds maximum length');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    IF NOT validate_uuid_exists('inventory_batches', (v_item->>'batch_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Batch not found');
    END IF;
    
    IF NOT validate_adjustment_quantity((v_item->>'adjustment_qty')::integer) THEN
      RETURN json_build_object('success', false, 'error', 'Adjustment quantity must be non-zero and between -1,000,000 and 1,000,000');
    END IF;
  END LOOP;
  
  -- Insert header
  INSERT INTO stock_adjustments (
    adjustment_number,
    adjustment_date,
    reason,
    attachment_url,
    status,
    created_by
  ) VALUES (
    header_data->>'adjustment_number',
    v_adjustment_date,
    header_data->>'reason',
    header_data->>'attachment_url',
    'draft',
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  -- Insert items
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (
      adjustment_id,
      product_id,
      batch_id,
      adjustment_qty,
      notes
    ) VALUES (
      v_header_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'batch_id')::uuid,
      (v_item->>'adjustment_qty')::integer,
      v_item->>'notes'
    );
  END LOOP;
  
  -- Handle attachment
  IF attachment_meta IS NOT NULL AND attachment_meta->>'url' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, url, file_key, uploaded_by)
    VALUES (
      'stock_adjustments',
      v_header_id,
      'stock_adjustment',
      attachment_meta->>'url',
      COALESCE(attachment_meta->>'file_key', attachment_meta->>'url'),
      v_user_id
    );
  END IF;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, new_data, user_id, user_email)
  VALUES (
    'stock_adjustment',
    'create',
    'stock_adjustments',
    v_header_id,
    header_data->>'adjustment_number',
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true, 'id', v_header_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;

-- ============================================
-- UPDATE stock_adjustment_update WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.stock_adjustment_update(
  p_adjustment_id uuid,
  header_data json,
  items_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_old_data json;
  v_current_status text;
  v_item json;
  v_adjustment_date date;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Check adjustment exists and get current status
  SELECT status, row_to_json(stock_adjustments.*)
  INTO v_current_status, v_old_data
  FROM stock_adjustments
  WHERE id = p_adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment not found');
  END IF;
  
  IF v_current_status != 'draft' THEN
    RETURN json_build_object('success', false, 'error', 'Only draft adjustments can be edited');
  END IF;
  
  -- Validate header fields
  v_adjustment_date := COALESCE((header_data->>'adjustment_date')::date, CURRENT_DATE);
  IF NOT validate_date_reasonable(v_adjustment_date) THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment date is invalid or out of reasonable range');
  END IF;
  
  IF NOT validate_string_length(header_data->>'reason', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Reason exceeds maximum length');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    IF NOT validate_uuid_exists('inventory_batches', (v_item->>'batch_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Batch not found');
    END IF;
    
    IF NOT validate_adjustment_quantity((v_item->>'adjustment_qty')::integer) THEN
      RETURN json_build_object('success', false, 'error', 'Adjustment quantity must be non-zero and between -1,000,000 and 1,000,000');
    END IF;
  END LOOP;
  
  -- Update header
  UPDATE stock_adjustments SET
    adjustment_date = v_adjustment_date,
    reason = header_data->>'reason',
    attachment_url = header_data->>'attachment_url',
    updated_at = now()
  WHERE id = p_adjustment_id;
  
  -- Delete old items and insert new ones
  DELETE FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (
      adjustment_id,
      product_id,
      batch_id,
      adjustment_qty,
      notes
    ) VALUES (
      p_adjustment_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'batch_id')::uuid,
      (v_item->>'adjustment_qty')::integer,
      v_item->>'notes'
    );
  END LOOP;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, old_data, new_data, user_id, user_email)
  VALUES (
    'stock_adjustment',
    'update',
    'stock_adjustments',
    p_adjustment_id,
    v_old_data,
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;

-- ============================================
-- UPDATE stock_in_create WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.stock_in_create(
  header_data json,
  items_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_header_id uuid;
  v_item json;
  v_plan_order_id uuid;
  v_received_date date;
  v_batch_id uuid;
  v_plan_item_id uuid;
  v_item_remaining integer;
  v_qty_received integer;
  v_all_received boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Validate header fields
  v_plan_order_id := (header_data->>'plan_order_id')::uuid;
  IF NOT validate_uuid_exists('plan_order_headers', v_plan_order_id) THEN
    RETURN json_build_object('success', false, 'error', 'Plan order not found');
  END IF;
  
  v_received_date := COALESCE((header_data->>'received_date')::date, CURRENT_DATE);
  IF NOT validate_date_reasonable(v_received_date) THEN
    RETURN json_build_object('success', false, 'error', 'Received date is invalid or out of reasonable range');
  END IF;
  
  -- Validate string lengths
  IF NOT validate_string_length(header_data->>'stock_in_number', 100) THEN
    RETURN json_build_object('success', false, 'error', 'Stock in number exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'notes', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Notes exceed maximum length');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    v_plan_item_id := (v_item->>'plan_order_item_id')::uuid;
    IF NOT validate_uuid_exists('plan_order_items', v_plan_item_id) THEN
      RETURN json_build_object('success', false, 'error', 'Plan order item not found');
    END IF;
    
    v_qty_received := (v_item->>'qty_received')::integer;
    IF NOT validate_quantity(v_qty_received) THEN
      RETURN json_build_object('success', false, 'error', 'Quantity must be between 1 and 1,000,000');
    END IF;
    
    -- Check remaining quantity
    SELECT qty_remaining INTO v_item_remaining
    FROM plan_order_items
    WHERE id = v_plan_item_id;
    
    IF v_qty_received > v_item_remaining THEN
      RETURN json_build_object('success', false, 'error', 'Received quantity exceeds remaining quantity');
    END IF;
    
    IF NOT validate_string_length(v_item->>'batch_no', 100) THEN
      RETURN json_build_object('success', false, 'error', 'Batch number exceeds maximum length');
    END IF;
  END LOOP;
  
  -- Insert header
  INSERT INTO stock_in_headers (
    stock_in_number,
    plan_order_id,
    received_date,
    delivery_note_url,
    notes,
    created_by
  ) VALUES (
    header_data->>'stock_in_number',
    v_plan_order_id,
    v_received_date,
    header_data->>'delivery_note_url',
    header_data->>'notes',
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  -- Process items
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    v_qty_received := (v_item->>'qty_received')::integer;
    v_plan_item_id := (v_item->>'plan_order_item_id')::uuid;
    
    -- Insert stock in item
    INSERT INTO stock_in_items (
      stock_in_id,
      plan_order_item_id,
      product_id,
      batch_no,
      expired_date,
      qty_received
    ) VALUES (
      v_header_id,
      v_plan_item_id,
      (v_item->>'product_id')::uuid,
      v_item->>'batch_no',
      (v_item->>'expired_date')::date,
      v_qty_received
    );
    
    -- Update plan order item quantities
    UPDATE plan_order_items
    SET 
      qty_received = COALESCE(qty_received, 0) + v_qty_received,
      qty_remaining = COALESCE(qty_remaining, planned_qty) - v_qty_received
    WHERE id = v_plan_item_id;
    
    -- Create or update inventory batch
    INSERT INTO inventory_batches (product_id, batch_no, expired_date, qty_on_hand)
    VALUES (
      (v_item->>'product_id')::uuid,
      v_item->>'batch_no',
      (v_item->>'expired_date')::date,
      v_qty_received
    )
    ON CONFLICT (product_id, batch_no)
    DO UPDATE SET qty_on_hand = inventory_batches.qty_on_hand + v_qty_received
    RETURNING id INTO v_batch_id;
    
    -- Create stock transaction
    INSERT INTO stock_transactions (
      product_id,
      batch_id,
      transaction_type,
      quantity,
      reference_type,
      reference_id,
      reference_number,
      created_by
    ) VALUES (
      (v_item->>'product_id')::uuid,
      v_batch_id,
      'IN',
      v_qty_received,
      'stock_in',
      v_header_id,
      header_data->>'stock_in_number',
      v_user_id
    );
  END LOOP;
  
  -- Check if all items received
  SELECT NOT EXISTS (
    SELECT 1 FROM plan_order_items
    WHERE plan_order_id = v_plan_order_id
    AND COALESCE(qty_remaining, planned_qty) > 0
  ) INTO v_all_received;
  
  -- Update plan order status
  UPDATE plan_order_headers
  SET status = CASE WHEN v_all_received THEN 'received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = v_plan_order_id;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, new_data, user_id, user_email)
  VALUES (
    'stock_in',
    'create',
    'stock_in_headers',
    v_header_id,
    header_data->>'stock_in_number',
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true, 'id', v_header_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;

-- ============================================
-- UPDATE stock_out_create WITH VALIDATION
-- ============================================
CREATE OR REPLACE FUNCTION public.stock_out_create(
  header_data json,
  items_data json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_header_id uuid;
  v_item json;
  v_sales_order_id uuid;
  v_delivery_date date;
  v_batch_qty integer;
  v_sales_item_id uuid;
  v_item_remaining integer;
  v_qty_out integer;
  v_all_delivered boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_user_email := get_user_email(v_user_id);
  
  -- Validate header fields
  v_sales_order_id := (header_data->>'sales_order_id')::uuid;
  IF NOT validate_uuid_exists('sales_order_headers', v_sales_order_id) THEN
    RETURN json_build_object('success', false, 'error', 'Sales order not found');
  END IF;
  
  v_delivery_date := COALESCE((header_data->>'delivery_date')::date, CURRENT_DATE);
  IF NOT validate_date_reasonable(v_delivery_date) THEN
    RETURN json_build_object('success', false, 'error', 'Delivery date is invalid or out of reasonable range');
  END IF;
  
  -- Validate string lengths
  IF NOT validate_string_length(header_data->>'stock_out_number', 100) THEN
    RETURN json_build_object('success', false, 'error', 'Stock out number exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'notes', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Notes exceed maximum length');
  END IF;
  
  -- Validate items
  IF items_data IS NULL OR json_array_length(items_data) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    IF NOT validate_uuid_exists('products', (v_item->>'product_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Product not found');
    END IF;
    
    IF NOT validate_uuid_exists('inventory_batches', (v_item->>'batch_id')::uuid) THEN
      RETURN json_build_object('success', false, 'error', 'Batch not found');
    END IF;
    
    v_sales_item_id := (v_item->>'sales_order_item_id')::uuid;
    IF NOT validate_uuid_exists('sales_order_items', v_sales_item_id) THEN
      RETURN json_build_object('success', false, 'error', 'Sales order item not found');
    END IF;
    
    v_qty_out := (v_item->>'qty_out')::integer;
    IF NOT validate_quantity(v_qty_out) THEN
      RETURN json_build_object('success', false, 'error', 'Quantity must be between 1 and 1,000,000');
    END IF;
    
    -- Check batch has enough stock
    SELECT qty_on_hand INTO v_batch_qty
    FROM inventory_batches
    WHERE id = (v_item->>'batch_id')::uuid;
    
    IF v_qty_out > v_batch_qty THEN
      RETURN json_build_object('success', false, 'error', 'Quantity exceeds available batch stock');
    END IF;
    
    -- Check remaining quantity
    SELECT qty_remaining INTO v_item_remaining
    FROM sales_order_items
    WHERE id = v_sales_item_id;
    
    IF v_qty_out > v_item_remaining THEN
      RETURN json_build_object('success', false, 'error', 'Quantity exceeds remaining order quantity');
    END IF;
  END LOOP;
  
  -- Insert header
  INSERT INTO stock_out_headers (
    stock_out_number,
    sales_order_id,
    delivery_date,
    delivery_note_url,
    notes,
    created_by
  ) VALUES (
    header_data->>'stock_out_number',
    v_sales_order_id,
    v_delivery_date,
    header_data->>'delivery_note_url',
    header_data->>'notes',
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  -- Process items
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    v_qty_out := (v_item->>'qty_out')::integer;
    v_sales_item_id := (v_item->>'sales_order_item_id')::uuid;
    
    -- Insert stock out item
    INSERT INTO stock_out_items (
      stock_out_id,
      sales_order_item_id,
      product_id,
      batch_id,
      qty_out
    ) VALUES (
      v_header_id,
      v_sales_item_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'batch_id')::uuid,
      v_qty_out
    );
    
    -- Update sales order item quantities
    UPDATE sales_order_items
    SET 
      qty_delivered = COALESCE(qty_delivered, 0) + v_qty_out,
      qty_remaining = COALESCE(qty_remaining, ordered_qty) - v_qty_out
    WHERE id = v_sales_item_id;
    
    -- Reduce batch stock
    UPDATE inventory_batches
    SET qty_on_hand = qty_on_hand - v_qty_out
    WHERE id = (v_item->>'batch_id')::uuid;
    
    -- Create stock transaction
    INSERT INTO stock_transactions (
      product_id,
      batch_id,
      transaction_type,
      quantity,
      reference_type,
      reference_id,
      reference_number,
      created_by
    ) VALUES (
      (v_item->>'product_id')::uuid,
      (v_item->>'batch_id')::uuid,
      'OUT',
      v_qty_out,
      'stock_out',
      v_header_id,
      header_data->>'stock_out_number',
      v_user_id
    );
  END LOOP;
  
  -- Check if all items delivered
  SELECT NOT EXISTS (
    SELECT 1 FROM sales_order_items
    WHERE sales_order_id = v_sales_order_id
    AND COALESCE(qty_remaining, ordered_qty) > 0
  ) INTO v_all_delivered;
  
  -- Update sales order status
  UPDATE sales_order_headers
  SET status = CASE WHEN v_all_delivered THEN 'delivered' ELSE 'partially_delivered' END,
      updated_at = now()
  WHERE id = v_sales_order_id;
  
  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, new_data, user_id, user_email)
  VALUES (
    'stock_out',
    'create',
    'stock_out_headers',
    v_header_id,
    header_data->>'stock_out_number',
    json_build_object('header', header_data, 'items', items_data),
    v_user_id,
    v_user_email
  );
  
  RETURN json_build_object('success', true, 'id', v_header_id);
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLERRM, SQLSTATE));
END;
$$;