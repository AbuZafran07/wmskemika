ALTER TABLE public.stock_out_headers 
ADD COLUMN delivery_number text DEFAULT NULL,
ADD COLUMN delivery_actual_date date DEFAULT NULL;