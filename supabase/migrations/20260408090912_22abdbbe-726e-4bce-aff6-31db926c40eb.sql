
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

  IF NOT has_any_role(v_user_id, ARRAY['super_admin'::app_role, 'admin'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin or admin can approve stock adjustments');
  END IF;

  v_user_email := get_user_email(v_user_id);

  SELECT * INTO v_adjustment
  FROM stock_adjustments
  WHERE id = p_adjustment_id AND is_deleted = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment not found');
  END IF;

  IF v_adjustment.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be approved');
  END IF;

  v_old_data := to_jsonb(v_adjustment);

  UPDATE stock_adjustments
  SET status = 'posted',
      approved_by = v_user_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_adjustment_id;

  FOR v_item IN SELECT * FROM stock_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    UPDATE inventory_batches
    SET qty_on_hand = qty_on_hand + v_item.adjustment_qty,
        updated_at = NOW()
    WHERE id = v_item.batch_id;

    IF v_item.new_batch_no IS NOT NULL AND v_item.new_batch_no != '' THEN
      UPDATE inventory_batches
      SET batch_no = v_item.new_batch_no,
          updated_at = NOW()
      WHERE id = v_item.batch_id;
    END IF;

    IF v_item.new_expired_date IS NOT NULL THEN
      UPDATE inventory_batches
      SET expired_date = v_item.new_expired_date,
          updated_at = NOW()
      WHERE id = v_item.batch_id;
    END IF;

    INSERT INTO stock_transactions (product_id, batch_id, transaction_type, quantity, reference_type, reference_id, reference_number, created_by, notes)
    VALUES (
      v_item.product_id, v_item.batch_id,
      'adjustment',
      v_item.adjustment_qty,
      'stock_adjustment', p_adjustment_id, v_adjustment.adjustment_number,
      v_user_id, v_item.notes
    );
  END LOOP;

  SELECT to_jsonb(sa) INTO v_new_data FROM stock_adjustments sa WHERE sa.id = p_adjustment_id;

  INSERT INTO audit_logs (user_id, user_email, action, module, ref_id, ref_no, ref_table, old_data, new_data)
  VALUES (v_user_id, v_user_email, 'approve', 'stock_adjustment', p_adjustment_id, v_adjustment.adjustment_number, 'stock_adjustments', v_old_data, v_new_data);

  RETURN jsonb_build_object('success', true);
END;
$$;
