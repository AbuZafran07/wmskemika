
-- Create delivery_requests table for Kanban board
CREATE TABLE public.delivery_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_order_id UUID NOT NULL REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  board_status TEXT NOT NULL DEFAULT 'new_order',
  notes TEXT,
  assigned_to UUID,
  delivery_date_target DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  moved_by UUID,
  moved_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(sales_order_id)
);

-- Add constraint for valid board statuses
ALTER TABLE public.delivery_requests ADD CONSTRAINT valid_board_status 
  CHECK (board_status IN (
    'new_order', 'checking', 'on_hold_delivery', 'approval_delivery',
    'pengiriman_senin', 'pengiriman_selasa', 'pengiriman_rabu', 
    'pengiriman_kamis', 'pengiriman_jumat', 'delivered', 'delivered_sample'
  ));

-- Enable RLS
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "All authenticated users can view delivery requests"
  ON public.delivery_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin, super_admin, sales, warehouse can manage
CREATE POLICY "Authorized users can manage delivery requests"
  ON public.delivery_requests FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'warehouse']::app_role[])
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_requests;
