-- Drop duplicate functions that use 'json' type (keeping 'jsonb' versions)
-- These duplicates cause ambiguous function call errors

-- Drop plan_order_update with json parameters
DROP FUNCTION IF EXISTS public.plan_order_update(uuid, json, json);

-- Drop sales_order_update with json parameters
DROP FUNCTION IF EXISTS public.sales_order_update(uuid, json, json);

-- Drop stock_adjustment_update with json parameters
DROP FUNCTION IF EXISTS public.stock_adjustment_update(uuid, json, json);