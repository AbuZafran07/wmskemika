
CREATE OR REPLACE FUNCTION stock_adjustment_create(header_data jsonb, items_data jsonb, attachment_meta jsonb DEFAULT NULL)
RETURNS jsonb
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

  IF header_data->>'adjustment_number' IS NULL OR header_data->>'reason' IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing required fields');
  END IF;

  INSERT INTO stock_adjustments (adjustment_number, adjustment_date, reason, attachment_url, status, created_by)
  VALUES (
    header_data->>'adjustment_number',
    COALESCE((header_data->>'adjustment_date')::DATE, CURRENT_DATE),
    header_data->>'reason',
    header_data->>'attachment_url',
    'draft',
    v_user_id
  ) RETURNING id INTO v_adjustment_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes, new_expired_date, new_batch_no)
    VALUES (
      v_adjustment_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'batch_id')::UUID,
      (v_item->>'adjustment_qty')::INTEGER,
      v_item->>'notes',
      NULLIF(v_item->>'new_expired_date', '')::DATE,
      NULLIF(TRIM(v_item->>'new_batch_no'), '')
    );
  END LOOP;

  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (ref_table, ref_id, module_name, file_key, url, mime_type, file_size, uploaded_by)
    VALUES (
      'stock_adjustments', v_adjustment_id, 'stock_adjustment',
      attachment_meta->>'file_key', attachment_meta->>'url',
      attachment_meta->>'mime_type', (attachment_meta->>'file_size')::INTEGER,
      v_user_id
    );
  END IF;

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

CREATE OR REPLACE FUNCTION stock_adjustment_update(adjustment_id uuid, header_data jsonb, items_data jsonb)
RETURNS jsonb
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

  SELECT * INTO v_adjustment FROM stock_adjustments WHERE id = adjustment_id AND is_deleted = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment not found');
  END IF;

  IF v_adjustment.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be edited');
  END IF;

  v_old_data := to_jsonb(v_adjustment);

  UPDATE stock_adjustments SET
    adjustment_number = COALESCE(header_data->>'adjustment_number', adjustment_number),
    adjustment_date = COALESCE((header_data->>'adjustment_date')::DATE, adjustment_date),
    reason = COALESCE(header_data->>'reason', reason),
    attachment_url = COALESCE(header_data->>'attachment_url', attachment_url),
    updated_at = NOW()
  WHERE id = adjustment_id;

  DELETE FROM stock_adjustment_items WHERE stock_adjustment_items.adjustment_id = stock_adjustment_update.adjustment_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO stock_adjustment_items (adjustment_id, product_id, batch_id, adjustment_qty, notes, new_expired_date, new_batch_no)
    VALUES (
      stock_adjustment_update.adjustment_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'batch_id')::UUID,
      (v_item->>'adjustment_qty')::INTEGER,
      v_item->>'notes',
      NULLIF(v_item->>'new_expired_date', '')::DATE,
      NULLIF(TRIM(v_item->>'new_batch_no'), '')
    );
  END LOOP;

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
