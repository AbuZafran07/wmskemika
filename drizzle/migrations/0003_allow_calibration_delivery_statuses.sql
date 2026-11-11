ALTER TABLE public.sales_order_headers
  DROP CONSTRAINT sales_order_headers_calibration_status_check;
ALTER TABLE public.sales_order_headers
  ADD CONSTRAINT sales_order_headers_calibration_status_check
  CHECK (calibration_status IS NULL OR calibration_status IN (
    'draft', 'pending_receipt', 'received', 'spk_issued', 'spk_confirmed',
    'in_calibration', 'completed', 'returned', 'rejected', 'cancelled',
    'delivered', 'in_progress'
  ));
COMMENT ON CONSTRAINT sales_order_headers_calibration_status_check ON public.sales_order_headers
  IS 'Preserves existing calibration statuses and permits delivered/in_progress used by sync_calibration_delivered; standard SO status rules are unchanged.';