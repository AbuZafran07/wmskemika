-- Make product-photos bucket private and update policy to require authentication
UPDATE storage.buckets SET public = false WHERE id = 'product-photos';

-- Drop the existing public policy
DROP POLICY IF EXISTS "Public can view product photos" ON storage.objects;

-- Create new policy requiring authentication for viewing product photos
CREATE POLICY "Authenticated users can view product photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'product-photos');