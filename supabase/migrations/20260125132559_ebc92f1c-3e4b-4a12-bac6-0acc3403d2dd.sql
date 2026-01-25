-- Drop the duplicate plan_order_create function with json type (keep jsonb version)
DROP FUNCTION IF EXISTS public.plan_order_create(json, json, json);

-- Drop the duplicate plan_order_update function with json type (keep jsonb version)  
DROP FUNCTION IF EXISTS public.plan_order_update(json, json, uuid);

-- Drop the duplicate sales_order_create function with json type (keep jsonb version)
DROP FUNCTION IF EXISTS public.sales_order_create(json, json, json);

-- Drop the duplicate sales_order_update function with json type (keep jsonb version)
DROP FUNCTION IF EXISTS public.sales_order_update(json, json, uuid);

-- Drop the duplicate stock_adjustment_create function with json type (keep jsonb version)
DROP FUNCTION IF EXISTS public.stock_adjustment_create(json, json, json);

-- Drop the duplicate stock_adjustment_update function with json type (keep jsonb version)
DROP FUNCTION IF EXISTS public.stock_adjustment_update(json, json, uuid);

-- Drop the duplicate stock_in_create function with json type (keep jsonb version)
DROP FUNCTION IF EXISTS public.stock_in_create(json, json);

-- Drop the duplicate stock_out_create function with json type (keep jsonb version)
DROP FUNCTION IF EXISTS public.stock_out_create(json, json);