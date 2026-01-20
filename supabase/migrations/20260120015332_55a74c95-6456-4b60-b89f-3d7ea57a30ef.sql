-- Fix stock_in_create and stock_out_create to use get_user_email() helper
-- instead of directly accessing auth.users for better security encapsulation

-- Update stock_in_create function
CREATE OR REPLACE FUNCTION public.stock_in_create(header_data json, items_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_in_id uuid;
  v_plan_order_id uuid;
  v_item json;
  v_product_id uuid;
  v_batch_id uuid;
  v_user_id uuid;
  v_user_email text;
  v_stock_in_number text;
  v_total_qty integer := 0;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Use helper function instead of direct auth.users access
  v_user_email := get_user_email(v_user_id);
  
  -- Extract header data
  v_plan_order_id := (header_data->>'plan_order_id')::uuid;
  v_stock_in_number := header_data->>'stock_in_number';
  
  -- Create stock_in_header
  INSERT INTO stock_in_headers (
    stock_in_number,
    plan_order_id,
    received_date,
    notes,
    delivery_note_url,
    created_by
  ) VALUES (
    v_stock_in_number,
    v_plan_order_id,
    COALESCE((header_data->>'received_date')::date, CURRENT_DATE),
    header_data->>'notes',
    header_data->>'delivery_note_url',
    v_user_id
  ) RETURNING id INTO v_stock_in_id;
  
  -- Process items
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    
    -- Create or update inventory batch
    INSERT INTO inventory_batches (
      product_id,
      batch_no,
      expired_date,
      qty_on_hand
    ) VALUES (
      v_product_id,
      v_item->>'batch_no',
      (v_item->>'expired_date')::date,
      (v_item->>'qty_received')::integer
    )
    ON CONFLICT (product_id, batch_no) DO UPDATE
    SET qty_on_hand = inventory_batches.qty_on_hand + (v_item->>'qty_received')::integer,
        expired_date = COALESCE((v_item->>'expired_date')::date, inventory_batches.expired_date),
        updated_at = now()
    RETURNING id INTO v_batch_id;
    
    -- Create stock_in_item
    INSERT INTO stock_in_items (
      stock_in_id,
      plan_order_item_id,
      product_id,
      batch_no,
      qty_received,
      expired_date
    ) VALUES (
      v_stock_in_id,
      (v_item->>'plan_order_item_id')::uuid,
      v_product_id,
      v_item->>'batch_no',
      (v_item->>'qty_received')::integer,
      (v_item->>'expired_date')::date
    );
    
    -- Update plan_order_item qty_received
    UPDATE plan_order_items
    SET qty_received = COALESCE(qty_received, 0) + (v_item->>'qty_received')::integer
    WHERE id = (v_item->>'plan_order_item_id')::uuid;
    
    -- Create stock transaction record
    INSERT INTO stock_transactions (
      product_id,
      batch_id,
      transaction_type,
      quantity,
      reference_type,
      reference_id,
      reference_number,
      created_by,
      notes
    ) VALUES (
      v_product_id,
      v_batch_id,
      'inbound',
      (v_item->>'qty_received')::integer,
      'stock_in',
      v_stock_in_id,
      v_stock_in_number,
      v_user_id,
      'Stock In from Plan Order'
    );
    
    v_total_qty := v_total_qty + (v_item->>'qty_received')::integer;
  END LOOP;
  
  -- Update plan order status if fully received
  UPDATE plan_order_headers
  SET status = CASE
    WHEN (
      SELECT COUNT(*) FROM plan_order_items 
      WHERE plan_order_id = v_plan_order_id 
      AND COALESCE(qty_received, 0) < planned_qty
    ) = 0 THEN 'received'
    ELSE 'partial'
  END,
  updated_at = now()
  WHERE id = v_plan_order_id;
  
  -- Create audit log
  INSERT INTO audit_logs (
    user_id,
    user_email,
    action,
    module,
    ref_table,
    ref_id,
    ref_no,
    new_data
  ) VALUES (
    v_user_id,
    v_user_email,
    'create',
    'stock_in',
    'stock_in_headers',
    v_stock_in_id,
    v_stock_in_number,
    json_build_object(
      'stock_in_id', v_stock_in_id,
      'plan_order_id', v_plan_order_id,
      'total_items', json_array_length(items_data),
      'total_qty', v_total_qty
    )
  );
  
  RETURN json_build_object('success', true, 'stock_in_id', v_stock_in_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Update stock_out_create function
CREATE OR REPLACE FUNCTION public.stock_out_create(header_data json, items_data json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_out_id uuid;
  v_sales_order_id uuid;
  v_item json;
  v_product_id uuid;
  v_batch_id uuid;
  v_user_id uuid;
  v_user_email text;
  v_stock_out_number text;
  v_total_qty integer := 0;
  v_current_qty integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Use helper function instead of direct auth.users access
  v_user_email := get_user_email(v_user_id);
  
  -- Extract header data
  v_sales_order_id := (header_data->>'sales_order_id')::uuid;
  v_stock_out_number := header_data->>'stock_out_number';
  
  -- Create stock_out_header
  INSERT INTO stock_out_headers (
    stock_out_number,
    sales_order_id,
    delivery_date,
    notes,
    delivery_note_url,
    created_by
  ) VALUES (
    v_stock_out_number,
    v_sales_order_id,
    COALESCE((header_data->>'delivery_date')::date, CURRENT_DATE),
    header_data->>'notes',
    header_data->>'delivery_note_url',
    v_user_id
  ) RETURNING id INTO v_stock_out_id;
  
  -- Process items
  FOR v_item IN SELECT * FROM json_array_elements(items_data)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_batch_id := (v_item->>'batch_id')::uuid;
    
    -- Check and update inventory batch
    SELECT qty_on_hand INTO v_current_qty
    FROM inventory_batches
    WHERE id = v_batch_id
    FOR UPDATE;
    
    IF v_current_qty < (v_item->>'qty_out')::integer THEN
      RAISE EXCEPTION 'Insufficient stock for batch %', v_batch_id;
    END IF;
    
    UPDATE inventory_batches
    SET qty_on_hand = qty_on_hand - (v_item->>'qty_out')::integer,
        updated_at = now()
    WHERE id = v_batch_id;
    
    -- Create stock_out_item
    INSERT INTO stock_out_items (
      stock_out_id,
      sales_order_item_id,
      product_id,
      batch_id,
      qty_out
    ) VALUES (
      v_stock_out_id,
      (v_item->>'sales_order_item_id')::uuid,
      v_product_id,
      v_batch_id,
      (v_item->>'qty_out')::integer
    );
    
    -- Update sales_order_item qty_delivered
    UPDATE sales_order_items
    SET qty_delivered = COALESCE(qty_delivered, 0) + (v_item->>'qty_out')::integer
    WHERE id = (v_item->>'sales_order_item_id')::uuid;
    
    -- Create stock transaction record
    INSERT INTO stock_transactions (
      product_id,
      batch_id,
      transaction_type,
      quantity,
      reference_type,
      reference_id,
      reference_number,
      created_by,
      notes
    ) VALUES (
      v_product_id,
      v_batch_id,
      'outbound',
      (v_item->>'qty_out')::integer,
      'stock_out',
      v_stock_out_id,
      v_stock_out_number,
      v_user_id,
      'Stock Out for Sales Order'
    );
    
    v_total_qty := v_total_qty + (v_item->>'qty_out')::integer;
  END LOOP;
  
  -- Update sales order status if fully delivered
  UPDATE sales_order_headers
  SET status = CASE
    WHEN (
      SELECT COUNT(*) FROM sales_order_items 
      WHERE sales_order_id = v_sales_order_id 
      AND COALESCE(qty_delivered, 0) < ordered_qty
    ) = 0 THEN 'delivered'
    ELSE 'partial'
  END,
  updated_at = now()
  WHERE id = v_sales_order_id;
  
  -- Create audit log
  INSERT INTO audit_logs (
    user_id,
    user_email,
    action,
    module,
    ref_table,
    ref_id,
    ref_no,
    new_data
  ) VALUES (
    v_user_id,
    v_user_email,
    'create',
    'stock_out',
    'stock_out_headers',
    v_stock_out_id,
    v_stock_out_number,
    json_build_object(
      'stock_out_id', v_stock_out_id,
      'sales_order_id', v_sales_order_id,
      'total_items', json_array_length(items_data),
      'total_qty', v_total_qty
    )
  );
  
  RETURN json_build_object('success', true, 'stock_out_id', v_stock_out_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;