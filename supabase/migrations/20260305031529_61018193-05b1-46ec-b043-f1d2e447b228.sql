
-- Labels master table
CREATE TABLE public.delivery_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction table: card <-> label
CREATE TABLE public.delivery_card_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id UUID NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.delivery_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(delivery_request_id, label_id)
);

-- Comments & activity
CREATE TABLE public.delivery_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id UUID NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'comment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.delivery_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_card_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_comments ENABLE ROW LEVEL SECURITY;

-- Labels policies
CREATE POLICY "read_labels" ON public.delivery_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_labels" ON public.delivery_labels FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
CREATE POLICY "update_labels" ON public.delivery_labels FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
CREATE POLICY "delete_labels" ON public.delivery_labels FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Card labels policies
CREATE POLICY "read_card_labels" ON public.delivery_card_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_card_labels" ON public.delivery_card_labels FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'sales'::public.app_role) OR public.has_role(auth.uid(), 'warehouse'::public.app_role)
);
CREATE POLICY "delete_card_labels" ON public.delivery_card_labels FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'sales'::public.app_role) OR public.has_role(auth.uid(), 'warehouse'::public.app_role)
);

-- Comments policies
CREATE POLICY "read_comments" ON public.delivery_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_comments" ON public.delivery_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_comments" ON public.delivery_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "delete_comments" ON public.delivery_comments FOR DELETE TO authenticated USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_comments;
