ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_orders_status_check'
  ) THEN
    ALTER TABLE public.delivery_orders
      ADD CONSTRAINT delivery_orders_status_check CHECK (status IN ('pending','released'));
  END IF;
END $$;

UPDATE public.delivery_orders
  SET status = 'released', signed_at = COALESCE(signed_at, created_at)
  WHERE status = 'pending';

DROP POLICY IF EXISTS "Finance can release delivery orders" ON public.delivery_orders;
CREATE POLICY "Finance can release delivery orders"
  ON public.delivery_orders FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin','admin','finance']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin','admin','finance']::app_role[]));

GRANT UPDATE ON public.delivery_orders TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;