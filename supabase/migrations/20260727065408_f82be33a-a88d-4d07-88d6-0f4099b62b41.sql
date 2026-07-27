CREATE TABLE public.calibration_document_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('spk','certificate','bast')),
  document_number text,
  file_url text,
  generated_by uuid REFERENCES auth.users(id),
  generated_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_calibration_document_logs_so ON public.calibration_document_logs(sales_order_id, created_at DESC);

GRANT SELECT, INSERT ON public.calibration_document_logs TO authenticated;
GRANT ALL ON public.calibration_document_logs TO service_role;

ALTER TABLE public.calibration_document_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_doc_logs_select_authenticated"
  ON public.calibration_document_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "cal_doc_logs_insert_authenticated"
  ON public.calibration_document_logs FOR INSERT
  TO authenticated
  WITH CHECK (generated_by = auth.uid());

CREATE POLICY "cal_doc_logs_delete_super_admin"
  ON public.calibration_document_logs FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));