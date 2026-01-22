-- Fix: Add 'finance' role to product photos upload policy
DROP POLICY IF EXISTS "Authorized roles can upload product photos" ON storage.objects;

CREATE POLICY "Authorized roles can upload product photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'product-photos' AND 
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'finance'::app_role])
  )
);

-- Also fix view policy for product photos to include finance
DROP POLICY IF EXISTS "Authorized roles can view product photos" ON storage.objects;

CREATE POLICY "Authorized roles can view product photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'product-photos' AND 
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'finance'::app_role])
  )
);