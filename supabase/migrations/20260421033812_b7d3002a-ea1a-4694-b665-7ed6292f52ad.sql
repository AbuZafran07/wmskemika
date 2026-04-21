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
    po_document_url, status, total_amount, discount, tax_rate, shipping_cost, grand_total,
    sales_pulse_reference_number, created_by, is_deleted
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
    NULLIF(header_data->>'sales_pulse_reference_number', ''),
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
    sales_pulse_reference_number = NULLIF(header_data->>'sales_pulse_reference_number', ''),
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