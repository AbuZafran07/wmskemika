REVOKE EXECUTE ON FUNCTION public.plan_order_request_short_close(uuid, text, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.plan_order_approve_short_close(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.plan_order_reject_short_close(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.plan_order_request_short_close(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_order_approve_short_close(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_order_reject_short_close(uuid, text) TO authenticated;