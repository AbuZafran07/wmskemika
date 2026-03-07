
-- 1. Update stock_out_create: change 'partial' to 'partially_delivered'
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
    AND status IN ('approved', 'partially_delivered')
    AND (is_deleted = false OR is_deleted IS NULL)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales order not found or not in approved/partially_delivered status');
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
  SET status = CASE WHEN v_all_delivered THEN 'delivered' ELSE 'partially_delivered' END,
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

-- 2. Update sales_order_cancel: also block 'partially_delivered'
CREATE OR REPLACE FUNCTION public.sales_order_cancel(order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number INTO v_current_status, v_order_number FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status = 'cancelled' THEN RETURN json_build_object('success', false, 'error', 'Order is already cancelled'); END IF;
  IF v_current_status IN ('delivered', 'partial', 'partially_delivered') THEN RETURN json_build_object('success', false, 'error', 'Cannot cancel orders that have been delivered'); END IF;
  UPDATE sales_order_headers SET status = 'cancelled', updated_at = now() WHERE id = order_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) VALUES (v_user_id, v_user_email, 'CANCEL', 'Sales Order', 'sales_order_headers', order_id, v_order_number, json_build_object('status', 'cancelled'));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$function$;

-- 3. Migrate existing 'partial' status to 'partially_delivered'
UPDATE sales_order_headers SET status = 'partially_delivered' WHERE status = 'partial';
