-- 1) Petugas kalibrasi terdaftar boleh menerbitkan/preview sertifikat
CREATE OR REPLACE FUNCTION public.issue_calibration_certificates(p_so_id uuid)
 RETURNS TABLE(item_id uuid, certificate_number text, certificate_issued_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_order record;
  v_item record;
  v_prefix text := 'LAB-SK-' || to_char(now(), 'YYYYMMDD') || '.';
  v_sequence integer;
  v_number text;
  v_issued_at timestamptz;
  v_item_id uuid;
  v_required text[] := ARRAY['calibration_completed','payment_verified'];
  v_missing_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_any_role(v_uid, ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role])
    OR public.is_calibration_checker(v_uid)
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  SELECT id, sales_order_number, order_type, status
  INTO v_order
  FROM public.sales_order_headers
  WHERE id = p_so_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Sales Order kalibrasi tidak ditemukan';
  END IF;

  IF v_order.order_type <> 'calibration' THEN
    RAISE EXCEPTION 'Sales Order bukan tipe kalibrasi';
  END IF;

  SELECT count(*)
  INTO v_missing_count
  FROM unnest(v_required) AS req(checklist_key)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.calibration_tracker_checklists c
    WHERE c.sales_order_id = p_so_id
      AND c.checklist_key = req.checklist_key
      AND c.is_checked = true
  );

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Checklist Kalibrasi Selesai dan Payment Verified wajib dicentang sebelum menerbitkan sertifikat';
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(soi.certificate_number, '^.*\.', ''), '')::integer), 0) + 1
  INTO v_sequence
  FROM public.sales_order_items soi
  WHERE soi.item_type = 'calibration'
    AND soi.certificate_number LIKE v_prefix || '%';

  v_email := public.get_user_email(v_uid);

  FOR v_item IN
    SELECT soi.id, soi.certificate_number, soi.certificate_issued_at
    FROM public.sales_order_items soi
    WHERE soi.sales_order_id = p_so_id
      AND soi.item_type = 'calibration'
    ORDER BY soi.created_at ASC, soi.id ASC
  LOOP
    IF v_item.certificate_number IS NULL THEN
      LOOP
        v_number := v_prefix || lpad(v_sequence::text, 3, '0');
        v_sequence := v_sequence + 1;
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM public.sales_order_items existing
          WHERE existing.certificate_number = v_number
        );
      END LOOP;

      UPDATE public.sales_order_items AS soi
      SET certificate_number = v_number,
          certificate_issued_at = now(),
          certificate_verify_token = COALESCE(
            soi.certificate_verify_token,
            replace(gen_random_uuid()::text, '-', '') || substr(md5(clock_timestamp()::text || random()::text), 1, 8)
          )
      WHERE soi.id = v_item.id
      RETURNING soi.id, soi.certificate_number, soi.certificate_issued_at
      INTO v_item_id, v_number, v_issued_at;

      item_id := v_item_id;
      certificate_number := v_number;
      certificate_issued_at := v_issued_at;

      INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, new_data)
      VALUES (
        v_uid, v_email, 'ISSUE', 'Calibration Certificate', 'sales_order_items', v_item_id, v_number,
        jsonb_build_object(
          'sales_order_id', p_so_id,
          'sales_order_number', v_order.sales_order_number,
          'certificate_issued_at', v_issued_at
        )
      );

      RETURN NEXT;
    ELSE
      item_id := v_item.id;
      certificate_number := v_item.certificate_number;
      certificate_issued_at := v_item.certificate_issued_at;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

-- 2) Label kartu Request Delivery bisa dilihat semua role internal (read-only)
DROP POLICY IF EXISTS read_card_labels ON public.delivery_card_labels;
CREATE POLICY read_card_labels ON public.delivery_card_labels
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'sales'::app_role,'warehouse'::app_role,'finance'::app_role,'purchasing'::app_role,'viewer'::app_role]));

DROP POLICY IF EXISTS read_labels ON public.delivery_labels;
CREATE POLICY read_labels ON public.delivery_labels
FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'sales'::app_role,'warehouse'::app_role,'finance'::app_role,'purchasing'::app_role,'viewer'::app_role]));