ALTER TABLE public.proforma_invoices
  DROP CONSTRAINT proforma_invoices_delivery_request_id_fkey,
  ADD CONSTRAINT proforma_invoices_delivery_request_id_fkey
    FOREIGN KEY (delivery_request_id) REFERENCES public.delivery_requests(id) ON DELETE SET NULL;