
-- Create delivery_checklists table for card automation
CREATE TABLE public.delivery_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_request_id UUID NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  checked_by UUID NULL,
  checked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_checklists ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "read_checklists" ON public.delivery_checklists
  FOR SELECT TO authenticated USING (true);

-- Only purchasing, finance, super_admin can update (check/uncheck)
CREATE POLICY "update_checklists" ON public.delivery_checklists
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'purchasing'::app_role, 'finance'::app_role]));

-- Insert via system (super_admin, admin, sales, warehouse - those who can add cards)
CREATE POLICY "insert_checklists" ON public.delivery_checklists
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role]));

-- Only super_admin can delete
CREATE POLICY "delete_checklists" ON public.delivery_checklists
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_checklists;
