-- Drop existing functions first (they return JSON, we need JSONB)
DROP FUNCTION IF EXISTS public.stock_adjustment_approve(UUID);
DROP FUNCTION IF EXISTS public.stock_adjustment_create(JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.stock_adjustment_update(UUID, JSONB, JSONB);

-- Recreate the approve function with JSONB return type and expiry date update
CREATE FUNCTION public.stock_adjustment_approve(p_adjustment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adjustment RECORD;
  v_item RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Only super_admin can approve
  IF NOT has_role('super_admin'::app_role, v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can approve stock adjustments');
  END IF;

  v_user_email := get_user_email(v_user_id);

  -- Get adjustment
  SELECT * INTO v_adjustment FROM stock_adjustments WHERE id = p_adjustment_id AND is_deleted = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment not found');
  END IF;

  IF v_adjustment.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be approved');
  END IF;

  -- Capture old data for audit
  v_old_data := to_jsonb(v_adjustment);

  -- Update adjustment status
  UPDATE stock_adjustments 
  SET status = 'posted', approved_by = v_user_id, approved_at = NOW(), updated_at = NOW()
  WHERE id = p_adjustment_id;

  -- Get new data for audit
  SELECT to_jsonb(sa) INTO v_new_data FROM stock_adjustments sa WHERE id = p_adjustment_id;

  -- Apply each adjustment item to inventory
  FOR v_item IN 
    SELECT * FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Update batch qty and expired_date if new_expired_date is provided
    UPDATE inventory_batches 
    SET 
      qty_on_hand = qty_on_hand + v_item.adjustment_qty,
      expired_date = COALESCE(v_item.new_expired_date, expired_date),
      updated_at = NOW()
    WHERE id = v_item.batch_id;

    -- Create stock transaction record
    INSERT INTO stock_transactions (
      product_id, batch_id, transaction_type, quantity, 
      reference_type, reference_id, reference_number, 
      notes, created_by
    ) VALUES (
      v_item.product_id, v_item.batch_id, 'adjustment', v_item.adjustment_qty,
      'adjustment', p_adjustment_id, v_adjustment.adjustment_number,
      v_item.notes, v_user_id
    );
  END LOOP;

  -- Log audit
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, old_data, new_data, user_id, user_email)
  VALUES ('stock_adjustment', 'approve', 'stock_adjustments', p_adjustment_id, v_adjustment.adjustment_number, v_old_data, v_new_data, v_user_id, v_user_email);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Recreate create function with new_expired_date support
CREATE FUNCTION public.stock_adjustment_create(
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
  v_adjustment_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_user_email := get_user_email(v_user_id);

  -- Validate required fields
  IF header_data->>'adjustment_number' IS NULL OR header_data->>'reason' IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing required fields');
  END IF;

  -- Insert header
  INSERT INTO stock_adjustments (adjustment_number, adjustment_date, reason, attachment_url, status, created_by)
  VALUES (
    header_data->>'adjustment_number',
    COALESCE((header_data->>'adjustment_date')::DATE, CURRENT_DATE),
    header_data->>'reason',
    header_data->>'attachment_url',
    'draft',
    v_user_id
  ) RETURNING id INTO v_adjustment_id;

  -- Insert items with new_expired_date support
  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes, new_expired_date)
    VALUES (
      v_adjustment_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'batch_id')::UUID,
      (v_item->>'adjustment_qty')::INTEGER,
      v_item->>'notes',
      NULLIF(v_item->>'new_expired_date', '')::DATE
    );
  END LOOP;

  -- Log attachment if provided
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, file_key, url, mime_type, file_size, uploaded_by)
    VALUES (
      'stock_adjustments', v_adjustment_id, 'stock_adjustment',
      attachment_meta->>'file_key', attachment_meta->>'url',
      attachment_meta->>'mime_type', (attachment_meta->>'file_size')::INTEGER,
      v_user_id
    );
  END IF;

  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, new_data, user_id, user_email)
  VALUES (
    'stock_adjustment', 'create', 'stock_adjustments', v_adjustment_id, 
    header_data->>'adjustment_number', 
    jsonb_build_object('header', header_data, 'items', items_data),
    v_user_id, v_user_email
  );

  RETURN jsonb_build_object('success', true, 'id', v_adjustment_id);
END;
$$;

-- Recreate update function with new_expired_date support
CREATE FUNCTION public.stock_adjustment_update(
  adjustment_id UUID,
  header_data JSONB,
  items_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adjustment RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_old_data JSONB;
  v_item JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_user_email := get_user_email(v_user_id);

  -- Get adjustment
  SELECT * INTO v_adjustment FROM stock_adjustments WHERE id = adjustment_id AND is_deleted = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment not found');
  END IF;

  IF v_adjustment.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be edited');
  END IF;

  v_old_data := to_jsonb(v_adjustment);

  -- Update header
  UPDATE stock_adjustments SET
    adjustment_number = COALESCE(header_data->>'adjustment_number', adjustment_number),
    adjustment_date = COALESCE((header_data->>'adjustment_date')::DATE, adjustment_date),
    reason = COALESCE(header_data->>'reason', reason),
    attachment_url = COALESCE(header_data->>'attachment_url', attachment_url),
    updated_at = NOW()
  WHERE id = adjustment_id;

  -- Delete existing items and re-insert with new_expired_date support
  DELETE FROM stock_adjustment_items WHERE stock_adjustment_items.adjustment_id = stock_adjustment_update.adjustment_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes, new_expired_date)
    VALUES (
      stock_adjustment_update.adjustment_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'batch_id')::UUID,
      (v_item->>'adjustment_qty')::INTEGER,
      v_item->>'notes',
      NULLIF(v_item->>'new_expired_date', '')::DATE
    );
  END LOOP;

  -- Audit log
  INSERT INTO audit_logs (module, action, ref_table, ref_id, ref_no, old_data, new_data, user_id, user_email)
  VALUES (
    'stock_adjustment', 'update', 'stock_adjustments', adjustment_id,
    v_adjustment.adjustment_number, v_old_data,
    jsonb_build_object('header', header_data, 'items', items_data),
    v_user_id, v_user_email
  );

  RETURN jsonb_build_object('success', true);
END;
$$;