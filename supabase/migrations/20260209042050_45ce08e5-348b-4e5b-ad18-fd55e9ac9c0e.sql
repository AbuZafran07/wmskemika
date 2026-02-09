-- Fix stock_adjustment_approve: correct has_role() argument order
-- Existing signature: has_role(_user_id uuid, _role app_role)

CREATE OR REPLACE FUNCTION public.stock_adjustment_approve(p_adjustment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can approve stock adjustments');
  END IF;

  v_user_email := get_user_email(v_user_id);

  -- Get adjustment
  SELECT *
  INTO v_adjustment
  FROM stock_adjustments
  WHERE id = p_adjustment_id
    AND is_deleted = false;

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
  SET status = 'posted',
      approved_by = v_user_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_adjustment_id;

  -- Get new data for audit
  SELECT to_jsonb(sa)
  INTO v_new_data
  FROM stock_adjustments sa
  WHERE id = p_adjustment_id;

  -- Apply each adjustment item to inventory
  FOR v_item IN
    SELECT * FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Update batch qty and expired_date if new_expired_date is provided
    UPDATE inventory_batches
    SET qty_on_hand = qty_on_hand + v_item.adjustment_qty,
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
  INSERT INTO audit_logs (
    module, action, ref_table, ref_id, ref_no,
    old_data, new_data, user_id, user_email
  ) VALUES (
    'stock_adjustment', 'approve', 'stock_adjustments', p_adjustment_id, v_adjustment.adjustment_number,
    v_old_data, v_new_data, v_user_id, v_user_email
  );

  RETURN jsonb_build_object('success', true);
END;
$$;