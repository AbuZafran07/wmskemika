
-- Fix Stock Adjustment RPC role checks: replace warehouse with finance
-- (module is meant for super_admin/admin/finance per app permissions)

CREATE OR REPLACE FUNCTION public.stock_adjustment_create(header_data jsonb, items_data jsonb, attachment_meta jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adjustment_id UUID;
  v_user_id UUID;
  v_user_email TEXT;
  v_item JSONB;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'finance'::app_role]) THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient privileges'); END IF;
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
$function$;

-- Patch update and soft_delete role checks in-place
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='stock_adjustment_update';
  v_def := replace(v_def, 'ARRAY[''super_admin''::app_role,''admin''::app_role,''warehouse''::app_role]', 'ARRAY[''super_admin''::app_role,''admin''::app_role,''finance''::app_role]');
  EXECUTE v_def;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='stock_adjustment_soft_delete';
  v_def := replace(v_def, 'ARRAY[''super_admin''::app_role,''admin''::app_role,''warehouse''::app_role]', 'ARRAY[''super_admin''::app_role,''admin''::app_role,''finance''::app_role]');
  EXECUTE v_def;
END $$;
