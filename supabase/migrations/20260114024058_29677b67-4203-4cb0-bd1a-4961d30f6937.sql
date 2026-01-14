-- Add reference_no column to plan_order_headers table
ALTER TABLE public.plan_order_headers 
ADD COLUMN IF NOT EXISTS reference_no TEXT;

-- Create index for faster lookups if needed
CREATE INDEX IF NOT EXISTS idx_plan_order_headers_reference_no ON public.plan_order_headers(reference_no);

-- Update the plan_order_create RPC function to include reference_no
CREATE OR REPLACE FUNCTION public.plan_order_create(
  header_data jsonb, 
  items_data jsonb,
  attachment_meta jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order_id uuid;
  user_id uuid;
  user_email text;
  item jsonb;
BEGIN
  user_id := auth.uid();
  user_email := get_user_email(user_id);
  
  -- Insert header with reference_no
  INSERT INTO plan_order_headers (
    plan_number,
    plan_date,
    supplier_id,
    expected_delivery_date,
    reference_no,
    notes,
    po_document_url,
    status,
    total_amount,
    discount,
    tax_rate,
    shipping_cost,
    grand_total,
    created_by
  ) VALUES (
    header_data->>'plan_number',
    (header_data->>'plan_date')::date,
    (header_data->>'supplier_id')::uuid,
    NULLIF(header_data->>'expected_delivery_date', '')::date,
    NULLIF(header_data->>'reference_no', ''),
    NULLIF(header_data->>'notes', ''),
    NULLIF(header_data->>'po_document_url', ''),
    COALESCE(header_data->>'status', 'draft'),
    COALESCE((header_data->>'total_amount')::numeric, 0),
    COALESCE((header_data->>'discount')::numeric, 0),
    COALESCE((header_data->>'tax_rate')::numeric, 0),
    COALESCE((header_data->>'shipping_cost')::numeric, 0),
    COALESCE((header_data->>'grand_total')::numeric, 0),
    user_id
  )
  RETURNING id INTO new_order_id;
  
  -- Insert items
  FOR item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO plan_order_items (
      plan_order_id,
      product_id,
      unit_price,
      planned_qty,
      qty_received,
      qty_remaining,
      subtotal,
      notes
    ) VALUES (
      new_order_id,
      (item->>'product_id')::uuid,
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'planned_qty')::integer, 0),
      0,
      COALESCE((item->>'planned_qty')::integer, 0),
      COALESCE((item->>'unit_price')::numeric, 0) * COALESCE((item->>'planned_qty')::integer, 0),
      NULLIF(item->>'notes', '')
    );
  END LOOP;
  
  -- Insert attachment if provided
  IF attachment_meta IS NOT NULL AND attachment_meta->>'file_key' IS NOT NULL THEN
    INSERT INTO attachments (
      module_name,
      ref_table,
      ref_id,
      file_key,
      url,
      mime_type,
      file_size,
      uploaded_by
    ) VALUES (
      'plan_order',
      'plan_order_headers',
      new_order_id::text,
      attachment_meta->>'file_key',
      attachment_meta->>'url',
      attachment_meta->>'mime_type',
      (attachment_meta->>'file_size')::integer,
      user_id
    );
  END IF;
  
  -- Insert audit log
  INSERT INTO audit_logs (
    user_id,
    user_email,
    action,
    module,
    ref_table,
    ref_id,
    ref_no,
    new_data
  ) VALUES (
    user_id,
    user_email,
    'create',
    'plan_order',
    'plan_order_headers',
    new_order_id::text,
    header_data->>'plan_number',
    jsonb_build_object(
      'header', header_data,
      'items', items_data,
      'attachment', attachment_meta
    )
  );
  
  RETURN jsonb_build_object('success', true, 'id', new_order_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Update the plan_order_update RPC function to include reference_no
CREATE OR REPLACE FUNCTION public.plan_order_update(
  order_id uuid,
  header_data jsonb, 
  items_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id uuid;
  user_email text;
  old_data jsonb;
  item jsonb;
  current_status text;
BEGIN
  user_id := auth.uid();
  user_email := get_user_email(user_id);
  
  -- Get current status and old data
  SELECT status, to_jsonb(plan_order_headers.*) INTO current_status, old_data
  FROM plan_order_headers 
  WHERE id = order_id AND is_deleted = false;
  
  IF current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  
  IF current_status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only edit orders in draft status');
  END IF;
  
  -- Update header with reference_no
  UPDATE plan_order_headers SET
    plan_number = COALESCE(header_data->>'plan_number', plan_number),
    plan_date = COALESCE(NULLIF(header_data->>'plan_date', '')::date, plan_date),
    supplier_id = COALESCE((header_data->>'supplier_id')::uuid, supplier_id),
    expected_delivery_date = NULLIF(header_data->>'expected_delivery_date', '')::date,
    reference_no = NULLIF(header_data->>'reference_no', ''),
    notes = NULLIF(header_data->>'notes', ''),
    po_document_url = COALESCE(NULLIF(header_data->>'po_document_url', ''), po_document_url),
    total_amount = COALESCE((header_data->>'total_amount')::numeric, total_amount),
    discount = COALESCE((header_data->>'discount')::numeric, discount),
    tax_rate = COALESCE((header_data->>'tax_rate')::numeric, tax_rate),
    shipping_cost = COALESCE((header_data->>'shipping_cost')::numeric, shipping_cost),
    grand_total = COALESCE((header_data->>'grand_total')::numeric, grand_total),
    updated_at = now()
  WHERE id = order_id;
  
  -- Delete existing items
  DELETE FROM plan_order_items WHERE plan_order_id = order_id;
  
  -- Insert new items
  FOR item IN SELECT * FROM jsonb_array_elements(items_data)
  LOOP
    INSERT INTO plan_order_items (
      plan_order_id,
      product_id,
      unit_price,
      planned_qty,
      qty_received,
      qty_remaining,
      subtotal,
      notes
    ) VALUES (
      order_id,
      (item->>'product_id')::uuid,
      COALESCE((item->>'unit_price')::numeric, 0),
      COALESCE((item->>'planned_qty')::integer, 0),
      0,
      COALESCE((item->>'planned_qty')::integer, 0),
      COALESCE((item->>'unit_price')::numeric, 0) * COALESCE((item->>'planned_qty')::integer, 0),
      NULLIF(item->>'notes', '')
    );
  END LOOP;
  
  -- Insert audit log
  INSERT INTO audit_logs (
    user_id,
    user_email,
    action,
    module,
    ref_table,
    ref_id,
    ref_no,
    old_data,
    new_data
  ) VALUES (
    user_id,
    user_email,
    'update',
    'plan_order',
    'plan_order_headers',
    order_id::text,
    header_data->>'plan_number',
    old_data,
    jsonb_build_object('header', header_data, 'items', items_data)
  );
  
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;