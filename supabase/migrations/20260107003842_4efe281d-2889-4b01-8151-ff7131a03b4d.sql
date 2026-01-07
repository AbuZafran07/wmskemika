-- Create RPC function for Stock In creation with full transaction support
CREATE OR REPLACE FUNCTION public.stock_in_create(
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
  v_plan_order_id UUID;
  v_after_json JSONB;
  v_items_result JSONB;
  v_existing_batch RECORD;
  v_total_received INTEGER;
  v_all_received BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  v_plan_order_id := (header_data->>'plan_order_id')::uuid;
  
  -- Validate plan order exists and is approved/partially_received
  IF NOT EXISTS (
    SELECT 1 FROM plan_order_headers 
    WHERE id = v_plan_order_id 
    AND status IN ('approved', 'partially_received')
    AND (is_deleted = false OR is_deleted IS NULL)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plan order not found or not in approved/partially_received status');
  END IF;
  
  -- Insert header
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
  
  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    -- Validate qty_received doesn't exceed qty_remaining
    IF (v_item->>'qty_received')::integer > COALESCE((v_item->>'qty_remaining')::integer, 999999) THEN
      RAISE EXCEPTION 'Quantity received (%) exceeds remaining (%) for product', 
        (v_item->>'qty_received')::integer, (v_item->>'qty_remaining')::integer;
    END IF;
    
    -- Insert stock in item
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
    
    -- Check if batch exists
    SELECT id, qty_on_hand INTO v_existing_batch 
    FROM inventory_batches 
    WHERE product_id = (v_item->>'product_id')::uuid 
    AND batch_no = v_item->>'batch_no';
    
    IF v_existing_batch.id IS NOT NULL THEN
      -- Update existing batch
      UPDATE inventory_batches 
      SET qty_on_hand = qty_on_hand + (v_item->>'qty_received')::integer,
          expired_date = COALESCE(NULLIF(v_item->>'expired_date', '')::date, expired_date),
          updated_at = now()
      WHERE id = v_existing_batch.id;
    ELSE
      -- Create new batch
      INSERT INTO inventory_batches (product_id, batch_no, qty_on_hand, expired_date)
      VALUES (
        (v_item->>'product_id')::uuid,
        v_item->>'batch_no',
        (v_item->>'qty_received')::integer,
        NULLIF(v_item->>'expired_date', '')::date
      );
    END IF;
    
    -- Insert stock transaction
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
    
    -- Calculate total received for this plan order item
    SELECT COALESCE(SUM(qty_received), 0) INTO v_total_received
    FROM stock_in_items
    WHERE plan_order_item_id = (v_item->>'plan_order_item_id')::uuid;
    
    -- Update plan order item qty_received
    UPDATE plan_order_items
    SET qty_received = v_total_received
    WHERE id = (v_item->>'plan_order_item_id')::uuid;
  END LOOP;
  
  -- Check if all items are fully received and update PO status
  SELECT NOT EXISTS (
    SELECT 1 FROM plan_order_items 
    WHERE plan_order_id = v_plan_order_id 
    AND COALESCE(qty_remaining, planned_qty - COALESCE(qty_received, 0)) > 0
  ) INTO v_all_received;
  
  UPDATE plan_order_headers
  SET status = CASE WHEN v_all_received THEN 'received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = v_plan_order_id;
  
  -- Build after snapshot for audit
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_result 
  FROM stock_in_items i WHERE i.stock_in_id = v_header_id;
  
  v_after_json := jsonb_build_object(
    'header', (SELECT row_to_json(h) FROM stock_in_headers h WHERE h.id = v_header_id),
    'items', COALESCE(v_items_result, '[]'::jsonb)
  );
  
  -- Insert audit log
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