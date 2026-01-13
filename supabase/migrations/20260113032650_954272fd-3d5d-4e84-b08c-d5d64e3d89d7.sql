-- Add finance role to suppliers SELECT policy
DROP POLICY IF EXISTS "Authorized users can view suppliers" ON suppliers;
CREATE POLICY "Authorized users can view suppliers" 
ON suppliers 
FOR SELECT 
USING (
  (auth.uid() IS NOT NULL) 
  AND (deleted_at IS NULL) 
  AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'finance'::app_role])
);