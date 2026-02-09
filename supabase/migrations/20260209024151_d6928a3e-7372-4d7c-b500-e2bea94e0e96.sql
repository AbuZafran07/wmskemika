-- Fix 1: Restrict suppliers SELECT policy - remove 'viewer' role
-- Viewers should not have access to supplier contact information (phone, email, NPWP)
DROP POLICY IF EXISTS "Authorized users can view suppliers" ON public.suppliers;

CREATE POLICY "Authorized users can view suppliers" 
ON public.suppliers 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) AND 
  (deleted_at IS NULL) AND 
  has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role])
);

-- Fix 2: Create a view for suppliers that excludes sensitive contact information for viewer role
-- This allows viewers to see supplier names (for display purposes) without sensitive data
CREATE OR REPLACE VIEW public.suppliers_public_view
WITH (security_invoker=on) AS
  SELECT 
    id,
    code,
    name,
    is_active,
    city,
    created_at,
    updated_at
    -- Excludes: contact_person, phone, email, npwp, terms_payment, address, notes
  FROM public.suppliers
  WHERE deleted_at IS NULL;

-- Grant SELECT on the view to authenticated users (inherits RLS from base table)
GRANT SELECT ON public.suppliers_public_view TO authenticated;