DROP POLICY IF EXISTS "Sales can create proforma invoices" ON public.proforma_invoices;
CREATE POLICY "Sales and finance can create proforma invoices"
ON public.proforma_invoices
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'sales'::app_role, 'finance'::app_role])
);

DROP POLICY IF EXISTS "Sales can create pi items" ON public.proforma_invoice_items;
CREATE POLICY "Sales and finance can create pi items"
ON public.proforma_invoice_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'sales'::app_role, 'finance'::app_role])
);