CREATE TABLE public.sales_pulse_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sales_order_id UUID NULL REFERENCES public.sales_order_headers(id) ON DELETE SET NULL,
  reference_number TEXT NULL,
  endpoint TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST',
  direction TEXT NOT NULL DEFAULT 'wms_to_sales_pulse',
  status TEXT NOT NULL DEFAULT 'pending',
  status_code INTEGER NULL,
  request_payload JSONB NULL,
  response_payload JSONB NULL,
  error_message TEXT NULL,
  triggered_by UUID NULL,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sales_pulse_sync_logs_created_at ON public.sales_pulse_sync_logs (created_at DESC);
CREATE INDEX idx_sales_pulse_sync_logs_reference_number ON public.sales_pulse_sync_logs (reference_number);
CREATE INDEX idx_sales_pulse_sync_logs_sales_order_id ON public.sales_pulse_sync_logs (sales_order_id);

ALTER TABLE public.sales_pulse_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view Sales Pulse sync logs"
ON public.sales_pulse_sync_logs
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::public.app_role[]));