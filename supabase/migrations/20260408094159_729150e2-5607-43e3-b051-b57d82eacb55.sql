CREATE OR REPLACE FUNCTION public.stock_adjustment_approve(p_adjustment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_adjustment RECORD;
  v_item RECORD;
  v_source_batch RECORD;
  v_target_batch RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_final_batch_no TEXT;
  v_final_expired_date DATE;
  v_effective_batch_id UUID;
  v_effective_qty INTEGER;
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
  FROM public.stock_adjustments
  WHERE id = p_adjustment_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment not found');
  END IF;

  IF v_adjustment.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft adjustments can be approved');
  END IF;

  v_old_data := to_jsonb(v_adjustment);

  UPDATE public.stock_adjustments
  SET status = 'posted',
      approved_by = v_user_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_adjustment_id;

  FOR v_item IN
    SELECT *
    FROM public.stock_adjustment_items
    WHERE adjustment_id = p_adjustment_id
    ORDER BY created_at NULLS FIRST, id
  LOOP
    SELECT * INTO v_source_batch
    FROM public.inventory_batches
    WHERE id = v_item.batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch inventory not found for item %', v_item.id;
    END IF;

    v_final_batch_no := COALESCE(NULLIF(BTRIM(v_item.new_batch_no), ''), v_source_batch.batch_no);
    v_final_expired_date := COALESCE(v_item.new_expired_date, v_source_batch.expired_date);
    v_effective_qty := COALESCE(v_source_batch.qty_on_hand, 0) + COALESCE(v_item.adjustment_qty, 0);
    v_effective_batch_id := v_source_batch.id;

    SELECT * INTO v_target_batch
    FROM public.inventory_batches
    WHERE product_id = v_source_batch.product_id
      AND batch_no = v_final_batch_no
      AND expired_date IS NOT DISTINCT FROM v_final_expired_date
      AND id <> v_source_batch.id
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.inventory_batches
      SET qty_on_hand = qty_on_hand + v_effective_qty,
          updated_at = NOW()
      WHERE id = v_target_batch.id;

      UPDATE public.inventory_batches
      SET qty_on_hand = 0,
          updated_at = NOW()
      WHERE id = v_source_batch.id;

      v_effective_batch_id := v_target_batch.id;
    ELSE
      UPDATE public.inventory_batches
      SET qty_on_hand = v_effective_qty,
          batch_no = v_final_batch_no,
          expired_date = v_final_expired_date,
          updated_at = NOW()
      WHERE id = v_source_batch.id;
    END IF;

    INSERT INTO public.stock_transactions (
      product_id,
      batch_id,
      transaction_type,
      quantity,
      reference_type,
      reference_id,
      reference_number,
      created_by,
      notes
    )
    VALUES (
      v_item.product_id,
      v_effective_batch_id,
      'adjustment',
      v_item.adjustment_qty,
      'stock_adjustment',
      p_adjustment_id,
      v_adjustment.adjustment_number,
      v_user_id,
      COALESCE(
        NULLIF(BTRIM(v_item.notes), ''),
        CASE
          WHEN v_effective_batch_id <> v_source_batch.id THEN 'Batch merged during stock adjustment approval'
          ELSE NULL
        END
      )
    );
  END LOOP;

  SELECT to_jsonb(sa) INTO v_new_data
  FROM public.stock_adjustments sa
  WHERE sa.id = p_adjustment_id;

  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    action,
    module,
    ref_id,
    ref_no,
    ref_table,
    old_data,
    new_data
  )
  VALUES (
    v_user_id,
    v_user_email,
    'approve',
    'stock_adjustment',
    p_adjustment_id,
    v_adjustment.adjustment_number,
    'stock_adjustments',
    v_old_data,
    v_new_data
  );

  RETURN jsonb_build_object('success', true);
END;
$$;