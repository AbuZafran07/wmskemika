
-- Table for storing generated Delivery Orders
CREATE TABLE public.delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  do_number text NOT NULL UNIQUE,
  stock_out_id uuid NOT NULL REFERENCES public.stock_out_headers(id),
  sales_order_id uuid NOT NULL REFERENCES public.sales_order_headers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  notes text
);

-- Enable RLS
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authorized users can view delivery orders"
  ON public.delivery_orders FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','sales','warehouse','purchasing','viewer']::app_role[]));

CREATE POLICY "Authorized users can create delivery orders"
  ON public.delivery_orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin','admin','sales','warehouse']::app_role[]));

CREATE POLICY "Authorized users can delete delivery orders"
  ON public.delivery_orders FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL AND has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));
