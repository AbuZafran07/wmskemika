CREATE OR REPLACE FUNCTION public.list_backup_tables()
RETURNS TABLE(table_name text, primary_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.relname::text AS table_name,
    COALESCE((
      SELECT a.attname::text
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = c.oid
        AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
      LIMIT 1
    ), 'id'::text) AS primary_key
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY c.relname;
$$;

REVOKE ALL ON FUNCTION public.list_backup_tables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_backup_tables() FROM anon;
REVOKE ALL ON FUNCTION public.list_backup_tables() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_backup_tables() TO service_role;

COMMENT ON FUNCTION public.list_backup_tables() IS 'Internal backup discovery: all public base tables and their first primary-key column; service_role only.';