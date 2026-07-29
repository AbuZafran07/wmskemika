
CREATE OR REPLACE FUNCTION public.delete_certificate(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_cert_no text;
BEGIN
  v_role := public.get_user_role(auth.uid());
  IF v_role <> 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hanya Super Admin yang dapat menghapus sertifikat');
  END IF;

  SELECT certificate_number INTO v_cert_no
  FROM public.sales_order_items
  WHERE id = p_item_id;

  IF v_cert_no IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sertifikat tidak ditemukan');
  END IF;

  DELETE FROM public.certificate_expiry_notifications WHERE item_id = p_item_id;

  UPDATE public.sales_order_items
  SET certificate_number = NULL,
      certificate_issued_at = NULL,
      certificate_revoked_at = NULL,
      certificate_revoked_reason = NULL,
      certificate_revoked_by = NULL
  WHERE id = p_item_id;

  INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, new_data)
  VALUES (auth.uid(), public.get_my_email(), 'delete_certificate', 'calibration',
          'sales_order_items', p_item_id,
          jsonb_build_object('certificate_number', v_cert_no));

  RETURN jsonb_build_object('success', true, 'certificate_number', v_cert_no);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_certificate(uuid) TO authenticated;
