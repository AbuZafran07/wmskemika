
-- Update proforma_invoices UPDATE policy to include admin
DROP POLICY IF EXISTS "Authorized users can update proforma invoices" ON public.proforma_invoices;

CREATE POLICY "Authorized users can update proforma invoices"
  ON public.proforma_invoices
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role])
  );
