
-- Drop the old single-parameter overloads that cause PostgREST ambiguity
DROP FUNCTION IF EXISTS public.plan_order_approve(uuid);
DROP FUNCTION IF EXISTS public.sales_order_approve(uuid);
