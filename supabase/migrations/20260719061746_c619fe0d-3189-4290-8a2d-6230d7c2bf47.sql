DO $$
DECLARE
  r record;
  def text;
  new_def text;
  guard text;
  ret_builder text;
  roles_literal text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('plan_order_create'::text,        'jsonb'::text, ARRAY['super_admin','admin','purchasing']),
      ('plan_order_update',        'jsonb', ARRAY['super_admin','admin','purchasing']),
      ('plan_order_cancel',        'json',  ARRAY['super_admin','admin','purchasing']),
      ('plan_order_soft_delete',   'json',  ARRAY['super_admin','admin','purchasing']),
      ('sales_order_create',       'jsonb', ARRAY['super_admin','admin','sales']),
      ('sales_order_update',       'jsonb', ARRAY['super_admin','admin','sales']),
      ('sales_order_cancel',       'json',  ARRAY['super_admin','admin','sales']),
      ('sales_order_soft_delete',  'json',  ARRAY['super_admin','admin','sales']),
      ('stock_adjustment_create',  'jsonb', ARRAY['super_admin','admin','warehouse']),
      ('stock_adjustment_update',  'jsonb', ARRAY['super_admin','admin','warehouse']),
      ('stock_adjustment_soft_delete','json',ARRAY['super_admin','admin','warehouse']),
      ('stock_in_create',          'jsonb', ARRAY['super_admin','admin','warehouse','purchasing'])
    ) AS t(fn_name, ret_kind, roles)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p
    WHERE p.proname = r.fn_name AND p.pronamespace = 'public'::regnamespace
    LIMIT 1;

    IF def IS NULL THEN
      RAISE NOTICE 'Function % not found', r.fn_name;
      CONTINUE;
    END IF;

    IF def ILIKE '%has_any_role(auth.uid()%'
       OR def ILIKE '%has_any_role(v_user_id%'
       OR def ILIKE '%has_any_role(user_id%' THEN
      RAISE NOTICE 'Function % already guarded', r.fn_name;
      CONTINUE;
    END IF;

    ret_builder := CASE WHEN r.ret_kind = 'jsonb' THEN 'jsonb_build_object' ELSE 'json_build_object' END;

    SELECT 'ARRAY[' || string_agg(quote_literal(x) || '::app_role', ',') || ']'
      INTO roles_literal
    FROM unnest(r.roles) AS x;

    guard := format(
      E'  IF NOT public.has_any_role(auth.uid(), %s) THEN RETURN %s(''success'', false, ''error'', ''Insufficient privileges''); END IF;\n',
      roles_literal, ret_builder
    );

    new_def := regexp_replace(def, E'\nBEGIN\n', E'\nBEGIN\n' || guard, 'n');

    EXECUTE new_def;
    RAISE NOTICE 'Guarded %', r.fn_name;
  END LOOP;
END
$$;