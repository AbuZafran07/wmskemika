-- Fix sales_order_headers status check constraint to include revision_requested
ALTER TABLE public.sales_order_headers DROP CONSTRAINT sales_order_headers_status_check;
ALTER TABLE public.sales_order_headers ADD CONSTRAINT sales_order_headers_status_check 
  CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'partially_delivered'::text, 'delivered'::text, 'cancelled'::text, 'revision_requested'::text, 'pending'::text, 'partial'::text]));

-- Fix plan_order_headers status check constraint to include revision_requested
ALTER TABLE public.plan_order_headers DROP CONSTRAINT plan_order_headers_status_check;
ALTER TABLE public.plan_order_headers ADD CONSTRAINT plan_order_headers_status_check 
  CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'partially_received'::text, 'received'::text, 'cancelled'::text, 'revision_requested'::text, 'pending'::text]));