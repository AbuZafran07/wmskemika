-- Update product-photos bucket metadata to reflect actual private access controls
-- The RLS policies already enforce private access, this makes the metadata consistent
UPDATE storage.buckets 
SET public = false 
WHERE id = 'product-photos';