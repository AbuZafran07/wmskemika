
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
  
  v_plan_order_id := (header_data->>'plan_order_id')::uuid;
  IF NOT validate_uuid_exists('plan_order_headers', v_plan_order_id) THEN
    RETURN json_build_object('success', false, 'error', 'Plan order not found');
  END IF;
  
  v_received_date := COALESCE((header_data->>'received_date')::date, CURRENT_DATE);
  IF NOT validate_date_reasonable(v_received_date) THEN
    RETURN json_build_object('success', false, 'error', 'Received date is invalid or out of reasonable range');
  END IF;
  
  IF NOT validate_string_length(header_data->>'stock_in_number', 100) THEN
    RETURN json_build_object('success', false, 'error', 'Stock in number exceeds maximum length');
  END IF;
  
  IF NOT validate_string_length(header_data->>'notes', 2000) THEN
    RETURN json_build_object('success', false, 'error', 'Notes exceed maximum length');
  END IF;
  
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
    
    IF NOT validate_string_length(v_item->>'batch_no', 100) THEN
      RETURN json_build_object('success', false, 'error', 'Batch number exceeds maximum length');
    END IF;
  END LOOP;
  
  INSERT INTO stock_in_headers (
    stock_in_number, plan_order_id, received_date, delivery_note_url, notes, created_by
  ) VALUES (
    header_data->>'stock_in_number',
    v_plan_order_id,
    v_received_date,
    header_data->>'delivery_note_url',
    header_data->>'notes',
    v_user_id
  )
  RETURNING id INTO v_header_id;
  
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    v_qty_received := (v_item->>'qty_received')::integer;
    v_plan_item_id := (v_item->>'plan_order_item_id')::uuid;
    
    INSERT INTO stock_in_items (
      stock_in_id, plan_order_item_id, product_id, batch_no, expired_date, qty_received
    ) VALUES (
      v_header_id,
      v_plan_item_id,
      (v_item->>'product_id')::uuid,
      v_item->>'batch_no',
      (v_item->>'expired_date')::date,
      v_qty_received
    );
    
    UPDATE plan_order_items
    SET 
      qty_received = COALESCE(qty_received, 0) + v_qty_received,
      qty_remaining = GREATEST(0, COALESCE(qty_remaining, planned_qty) - v_qty_received)
    WHERE id = v_plan_item_id;
    
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
    
    INSERT INTO stock_transactions (
      product_id, batch_id, transaction_type, quantity,
      reference_type, reference_id, reference_number, created_by
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
  
  SELECT NOT EXISTS (
    SELECT 1 FROM plan_order_items
    WHERE plan_order_id = v_plan_order_id
    AND COALESCE(qty_remaining, planned_qty) > 0
  ) INTO v_all_received;
  
  UPDATE plan_order_headers
  SET status = CASE WHEN v_all_received THEN 'received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = v_plan_order_id;
  
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
END;
$$;
