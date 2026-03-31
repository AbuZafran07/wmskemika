
-- Drop the old policy
DROP POLICY IF EXISTS "Authorized users can manage delivery requests" ON public.delivery_requests;

-- Recreate with purchasing included
CREATE POLICY "Authorized users can manage delivery requests"
  ON public.delivery_requests
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role, 'purchasing'::app_role, 'finance'::app_role])
  );
