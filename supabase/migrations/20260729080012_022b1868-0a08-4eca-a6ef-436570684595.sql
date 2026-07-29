CREATE OR REPLACE FUNCTION public.revoke_certificate(p_item_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['super_admin'::app_role,'admin'::app_role,'finance'::app_role]) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient privileges');
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alasan revoke minimal 10 karakter');
  END IF;

  SELECT id, certificate_number, certificate_revoked_at, sales_order_id
  INTO v_row
  FROM public.sales_order_items
  WHERE id = p_item_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item tidak ditemukan');
  END IF;

  IF v_row.certificate_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sertifikat belum terbit');
  END IF;

  IF v_row.certificate_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sertifikat sudah di-revoke');
  END IF;

  UPDATE public.sales_order_items
  SET certificate_revoked_at = now(),
      certificate_revoked_reason = btrim(p_reason),
      certificate_revoked_by = v_uid
  WHERE id = p_item_id;

  v_email := public.get_user_email(v_uid);

  INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
  VALUES (v_uid, v_email, 'REVOKE', 'Calibration Certificate', 'sales_order_items', p_item_id,
    v_row.certificate_number,
    jsonb_build_object('reason', btrim(p_reason), 'revoked_at', now()));

  RETURN jsonb_build_object('success', true);
END;
$function$;