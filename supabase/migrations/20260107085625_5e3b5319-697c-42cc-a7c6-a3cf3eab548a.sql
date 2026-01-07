-- Fix overly permissive storage policies for product-photos and documents buckets
-- Replace INSERT/UPDATE/DELETE policies with role-based restrictions

-- =============================================
-- PRODUCT-PHOTOS BUCKET POLICIES
-- =============================================

-- Drop existing overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload product photos" ON storage.objects;

-- Create role-based INSERT policy for product-photos (purchasing, warehouse can upload)
CREATE POLICY "Authorized roles can upload product photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-photos' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin', 'purchasing', 'warehouse']::app_role[])
  )
);

-- Drop existing overly permissive UPDATE policy
DROP POLICY IF EXISTS "Authenticated users can update product photos" ON storage.objects;

-- Create role-based UPDATE policy for product-photos (owner or admin can update)
CREATE POLICY "Owners and admins can update product photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-photos' AND
  (owner = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin']::app_role[])
  ))
);

-- Drop existing overly permissive DELETE policy
DROP POLICY IF EXISTS "Authenticated users can delete product photos" ON storage.objects;

-- Create role-based DELETE policy for product-photos (only admins can delete)
CREATE POLICY "Only admins can delete product photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-photos' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin']::app_role[])
  )
);

-- =============================================
-- DOCUMENTS BUCKET POLICIES
-- =============================================

-- Drop existing overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;

-- Create role-based INSERT policy for documents (broader access for business docs)
CREATE POLICY "Authorized roles can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales', 'finance']::app_role[])
  )
);

-- Drop existing overly permissive UPDATE policy
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;

-- Create role-based UPDATE policy for documents (owner or admin can update)
CREATE POLICY "Owners and admins can update documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'documents' AND
  (owner = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin']::app_role[])
  ))
);

-- Drop existing overly permissive DELETE policy
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;

-- Create role-based DELETE policy for documents (only admins can delete)
CREATE POLICY "Only admins can delete documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin']::app_role[])
  )
);