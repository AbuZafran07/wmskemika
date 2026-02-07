-- Make product-photos bucket public for viewing
-- This allows all authenticated users to view product images without signed URLs
-- which improves performance and reduces complexity

-- First, update the bucket to be public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'product-photos';

-- Keep existing RLS policies for upload/delete but add a simpler public SELECT policy
-- Drop the old view policy that requires role check (it's redundant if bucket is public)
DROP POLICY IF EXISTS "Authorized roles can view product photos" ON storage.objects;

-- Add a simpler policy that allows public read access to product photos
-- This is safe because product photos should be viewable by anyone accessing the system
CREATE POLICY "Public can view product photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-photos');