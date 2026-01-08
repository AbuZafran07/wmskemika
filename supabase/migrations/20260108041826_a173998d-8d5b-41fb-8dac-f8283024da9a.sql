-- Enable realtime for notification-related tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.plan_order_headers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_order_headers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_adjustments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_in_headers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_out_headers;