UPDATE public.delivery_requests 
SET board_status = 'archived', moved_at = now() 
WHERE sales_order_id IN (
  SELECT id FROM public.sales_order_headers WHERE status = 'cancelled'
) AND board_status != 'archived'