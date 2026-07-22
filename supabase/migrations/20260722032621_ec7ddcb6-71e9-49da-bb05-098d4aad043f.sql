
-- 1) Kolom bukti SPK Confirmed
ALTER TABLE public.sales_order_headers
  ADD COLUMN IF NOT EXISTS spk_confirmed_file_url text,
  ADD COLUMN IF NOT EXISTS spk_confirmed_file_name text;

-- 2) Update sales_order_approve: guard kalibrasi harus sudah SPK Issued
CREATE OR REPLACE FUNCTION public.sales_order_approve(order_id uuid, approve_reason text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_user_email text; v_order_number text; v_current_status text;
  v_order_type text; v_spk_issued boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'Authentication required'); END IF;
  IF NOT has_any_role(v_user_id, ARRAY['super_admin', 'admin']::app_role[]) THEN
    RETURN json_build_object('success', false, 'error', 'Only administrators can approve orders');
  END IF;
  SELECT get_user_email(v_user_id) INTO v_user_email;
  SELECT status, sales_order_number, order_type
    INTO v_current_status, v_order_number, v_order_type
  FROM sales_order_headers
  WHERE id = order_id AND (is_deleted = false OR is_deleted IS NULL);
  IF v_current_status IS NULL THEN RETURN json_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_current_status NOT IN ('pending', 'draft') THEN
    RETURN json_build_object('success', false, 'error', 'Only pending or draft orders can be approved');
  END IF;

  -- Guard khusus kalibrasi: SPK Issued wajib sudah dicentang sebelum SO bisa di-approve
  IF v_order_type = 'calibration' THEN
    SELECT COALESCE(bool_or(is_checked), false) INTO v_spk_issued
    FROM calibration_tracker_checklists
    WHERE sales_order_id = order_id AND checklist_key = 'spk_issued';
    IF NOT v_spk_issued THEN
      RETURN json_build_object('success', false,
        'error', 'SO kalibrasi hanya bisa di-Approve setelah checklist "SPK Issued" tercentang di Tracker Kalibrasi.');
    END IF;
  END IF;

  UPDATE sales_order_headers
    SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now()
  WHERE id = order_id;
  INSERT INTO audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_user_id, v_user_email, 'APPROVE', 'Sales Order', 'sales_order_headers', order_id, v_order_number,
    json_build_object('status', 'approved', 'approve_reason', COALESCE(approve_reason, '')));
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', get_sanitized_error_message(SQLSTATE, SQLERRM));
END;
$$;

-- 3) Update sync_calibration_spk_confirmed: guard SO harus approved & file bukti sudah diupload
CREATE OR REPLACE FUNCTION public.sync_calibration_spk_confirmed(p_so_id uuid, p_confirmed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_file text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role) OR
    public.has_role(v_uid, 'admin'::app_role) OR
    public.has_role(v_uid, 'warehouse'::app_role) OR
    public.has_role(v_uid, 'purchasing'::app_role) OR
    public.has_role(v_uid, 'sales'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_confirmed THEN
    SELECT status, spk_confirmed_file_url
      INTO v_status, v_file
    FROM public.sales_order_headers
    WHERE id = p_so_id;

    IF v_status IS NULL THEN RAISE EXCEPTION 'Sales Order tidak ditemukan'; END IF;
    IF v_status <> 'approved' THEN
      RAISE EXCEPTION 'Approve Sales Order terlebih dahulu sebelum menandai SPK Confirmed';
    END IF;
    IF v_file IS NULL OR length(trim(v_file)) = 0 THEN
      RAISE EXCEPTION 'Upload bukti SPK yang telah dikonfirmasi customer terlebih dahulu';
    END IF;
  END IF;

  UPDATE public.sales_order_headers
    SET spk_confirmed_at = CASE WHEN p_confirmed THEN now() ELSE NULL END
    WHERE id = p_so_id;
END;
$$;
