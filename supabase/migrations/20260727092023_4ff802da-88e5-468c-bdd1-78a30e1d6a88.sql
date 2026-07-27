CREATE OR REPLACE FUNCTION public.sales_order_approve_revision(order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
  v_order_type text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN 
    RETURN json_build_object('success', false, 'error', 'Only administrators can approve revision requests'); 
  END IF;

  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number, order_type
    INTO v_current_status, v_order_number, v_order_type
  FROM sales_order_headers WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status != 'revision_requested' THEN RETURN json_build_object('success', false, 'error', 'Order is not in revision_requested status'); END IF;

  UPDATE sales_order_headers
     SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = now()
   WHERE id = order_id;

  -- For calibration orders, reset the tracker so the card returns to
  -- "Instrument Received" column and all subsequent checklists are cleared.
  IF v_order_type = 'calibration' THEN
    UPDATE calibration_tracker_checklists
       SET is_checked = false, checked_by = NULL, checked_at = NULL
     WHERE sales_order_id = order_id
       AND checklist_key IN (
         'spk_issued','spk_confirmed','calibration_completed',
         'payment_verified','certificate_released','instrument_delivered'
       );

    UPDATE sales_order_headers
       SET calibration_status = 'received',
           spk_confirmed_at = NULL,
           spk_confirmed_file_url = NULL,
           spk_confirmed_file_name = NULL,
           payment_verified_at = NULL,
           updated_at = now()
     WHERE id = order_id;
  END IF;
  
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data) 
  VALUES (v_user_id, v_user_email, 'REVISION_APPROVED', 'Sales Order', 'sales_order_headers', order_id, v_order_number, 
    json_build_object('status', 'draft', 'note',
      CASE WHEN v_order_type = 'calibration'
           THEN 'Revision approved, calibration tracker reset to Instrument Received'
           ELSE 'Revision approved, returned to draft' END));
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$function$;