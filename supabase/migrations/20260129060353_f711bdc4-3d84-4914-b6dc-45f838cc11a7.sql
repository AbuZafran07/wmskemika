-- Update policy to include viewer role for viewing product photos
DROP POLICY IF EXISTS "Authorized roles can view product photos" ON storage.objects;

CREATE POLICY "Authorized roles can view product photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'product-photos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('super_admin', 'admin', 'purchasing', 'warehouse', 'sales', 'finance', 'viewer')
  )
);