-- Add soft delete columns to stock_adjustments
ALTER TABLE public.stock_adjustments 
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- Add unique constraint on adjustment_number if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustments_adjustment_number_key') THEN
    ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_adjustment_number_key UNIQUE (adjustment_number);
  END IF;
END $$;

-- Add index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_is_deleted ON public.stock_adjustments(is_deleted);

-- RPC: stock_adjustment_create
CREATE OR REPLACE FUNCTION public.stock_adjustment_create(
  header_data JSONB,
  items_data JSONB,
  attachment_meta JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  -- Insert items
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
  
  -- Insert attachment if provided
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
  
  -- Audit log
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
$$;

-- RPC: stock_adjustment_update
CREATE OR REPLACE FUNCTION public.stock_adjustment_update(
  adjustment_id UUID,
  header_data JSONB,
  items_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be edited');
  END IF;
  
  -- Before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items_before FROM stock_adjustment_items i WHERE i.adjustment_id = adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items_before, '[]'::jsonb));
  
  -- Update header
  UPDATE stock_adjustments SET
    adjustment_number = COALESCE(header_data->>'adjustment_number', adjustment_number),
    adjustment_date = COALESCE((header_data->>'adjustment_date')::date, adjustment_date),
    reason = COALESCE(header_data->>'reason', reason),
    attachment_url = NULLIF(header_data->>'attachment_url', ''),
    updated_at = now()
  WHERE id = adjustment_id;
  
  -- Replace items
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
  
  -- After snapshot
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
$$;

-- RPC: stock_adjustment_approve (posts to inventory)
CREATE OR REPLACE FUNCTION public.stock_adjustment_approve(adjustment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  v_user_role := get_user_role(v_user_id);
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be approved');
  END IF;
  
  -- Check permission
  IF v_user_role != 'super_admin' THEN
    SELECT COALESCE((value::jsonb->>'value')::boolean, (value::text)::boolean, false) INTO v_allow_admin_approve 
    FROM settings WHERE key = 'allow_admin_approve';
    
    IF v_user_role != 'admin' OR NOT COALESCE(v_allow_admin_approve, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to approve adjustments');
    END IF;
  END IF;
  
  -- Before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_approve.adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  -- Post to inventory: update batch quantities
  FOR v_item IN SELECT * FROM stock_adjustment_items WHERE adjustment_id = stock_adjustment_approve.adjustment_id
  LOOP
    -- Update batch qty_on_hand
    UPDATE inventory_batches 
    SET qty_on_hand = qty_on_hand + v_item.adjustment_qty,
        updated_at = now()
    WHERE id = v_item.batch_id;
    
    -- Insert stock transaction
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
  
  -- Update header status
  UPDATE stock_adjustments SET 
    status = 'posted',
    approved_by = v_user_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = adjustment_id;
  
  -- After snapshot
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'approve', 'stock_adjustment', 'stock_adjustments', adjustment_id, v_header.adjustment_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: stock_adjustment_reject
CREATE OR REPLACE FUNCTION public.stock_adjustment_reject(adjustment_id UUID, reject_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be rejected');
  END IF;
  
  -- Check permission
  IF v_user_role != 'super_admin' THEN
    SELECT COALESCE((value::jsonb->>'value')::boolean, (value::text)::boolean, false) INTO v_allow_admin_approve 
    FROM settings WHERE key = 'allow_admin_approve';
    
    IF v_user_role != 'admin' OR NOT COALESCE(v_allow_admin_approve, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'You do not have permission to reject adjustments');
    END IF;
  END IF;
  
  -- Before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_reject.adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  -- Update status
  UPDATE stock_adjustments SET 
    status = 'rejected',
    rejected_reason = reject_reason,
    updated_at = now()
  WHERE id = adjustment_id;
  
  -- After snapshot
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id;
  v_after_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'reject', 'stock_adjustment', 'stock_adjustments', adjustment_id, v_header.adjustment_number, v_before_json, v_after_json);
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC: stock_adjustment_soft_delete
CREATE OR REPLACE FUNCTION public.stock_adjustment_soft_delete(adjustment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  SELECT * INTO v_header FROM stock_adjustments WHERE id = adjustment_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_header IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock adjustment not found or already deleted');
  END IF;
  
  IF v_header.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be deleted');
  END IF;
  
  -- Before snapshot
  SELECT jsonb_agg(row_to_json(i)) INTO v_items FROM stock_adjustment_items i WHERE i.adjustment_id = stock_adjustment_soft_delete.adjustment_id;
  v_before_json := jsonb_build_object('header', row_to_json(v_header), 'items', COALESCE(v_items, '[]'::jsonb));
  
  -- Soft delete
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
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.stock_adjustment_create TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_adjustment_update TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_adjustment_approve TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_adjustment_reject TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_adjustment_soft_delete TO authenticated;