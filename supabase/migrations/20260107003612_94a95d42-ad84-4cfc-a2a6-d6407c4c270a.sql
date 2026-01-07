-- Create RPC function for Stock Out creation with full transaction support
CREATE OR REPLACE FUNCTION public.stock_out_create(
  header_data jsonb,
  items_data jsonb
)
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
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  v_sales_order_id := (header_data->>'sales_order_id')::uuid;
  
  -- Validate sales order exists and is approved
  IF NOT EXISTS (
    SELECT 1 FROM sales_order_headers 
    WHERE id = v_sales_order_id 
    AND status IN ('approved', 'partial')
    AND (is_deleted = false OR is_deleted IS NULL)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or not in approved/partial status');
  END IF;
  
  -- Insert header
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
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    -- Process each batch for this item
    FOR v_batch IN SELECT * FROM jsonb_array_elements(v_item->'batches')
    LOOP
      -- Validate batch has sufficient stock
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
      
      -- Insert stock out item
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
      
      -- Update inventory batch qty_on_hand
      UPDATE inventory_batches 
      SET qty_on_hand = qty_on_hand - (v_batch->>'qty_out')::integer,
          updated_at = now()
      WHERE id = (v_batch->>'batch_id')::uuid;
      
      -- Insert stock transaction
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
    
    -- Update sales order item qty_delivered
    -- Note: qty_remaining is a GENERATED column, only update qty_delivered
    SELECT qty_delivered INTO v_so_item 
    FROM sales_order_items 
    WHERE id = (v_item->>'sales_order_item_id')::uuid;
    
    v_new_qty_delivered := COALESCE(v_so_item.qty_delivered, 0) + (v_item->>'total_qty_out')::integer;
    
    UPDATE sales_order_items
    SET qty_delivered = v_new_qty_delivered
    WHERE id = (v_item->>'sales_order_item_id')::uuid;
  END LOOP;
  
  -- Check if all items are fully delivered and update SO status
  SELECT NOT EXISTS (
    SELECT 1 FROM sales_order_items 
    WHERE sales_order_id = v_sales_order_id 
    AND COALESCE(qty_remaining, ordered_qty - COALESCE(qty_delivered, 0)) > 0
  ) INTO v_all_delivered;
  
  UPDATE sales_order_headers
  SET status = CASE WHEN v_all_delivered THEN 'delivered' ELSE 'partial' END,
      updated_at = now()
  WHERE id = v_sales_order_id;
  
  -- Build after snapshot for audit
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result 
  FROM stock_out_items i WHERE i.stock_out_id = v_header_id;
  
  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM stock_out_headers h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb)
  );
  
  -- Insert audit log
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