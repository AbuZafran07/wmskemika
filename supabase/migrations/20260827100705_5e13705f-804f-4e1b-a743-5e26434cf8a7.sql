ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS calibration_date date;