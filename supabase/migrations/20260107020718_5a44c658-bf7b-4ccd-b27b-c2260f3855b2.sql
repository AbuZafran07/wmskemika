-- =====================================================
-- Security Hardening: Fix Warning-Level Issues
-- =====================================================

-- 1. Fix settings table policies (issues: SUPA_rls_policy_always_true and settings_table_public_read)
-- Remove overly permissive SELECT policy that uses USING (true)
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.settings;

-- Create restricted SELECT policy - only admin roles can view settings
CREATE POLICY "Admin roles can view settings"
ON public.settings FOR SELECT
USING (has_any_role(auth.uid(), ARRAY['super_admin', 'admin']::app_role[]));

-- 2. Fix storage bucket policies (issue: storage_buckets_overly_permissive)
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view product photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;

-- Create role-based product-photos access policy
-- Roles: super_admin, admin, purchasing, warehouse, sales need product photo access
CREATE POLICY "Authorized roles can view product photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'product-photos' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales']::app_role[])
  )
);

-- Create role-based documents access policy
-- Roles: super_admin, admin, purchasing, warehouse, sales, finance need document access
CREATE POLICY "Authorized roles can view documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY(ARRAY['super_admin', 'admin', 'purchasing', 'warehouse', 'sales', 'finance']::app_role[])
  )
);

-- 3. Restrict audit_logs to super_admin only for comprehensive access
-- Drop the existing policy that allows all admins
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

-- Create more restrictive policy - super_admin gets full access, admin gets limited access to non-financial modules
CREATE POLICY "Super admins can view all audit logs"
ON public.audit_logs FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Allow admin role to view audit logs for non-sensitive modules only
CREATE POLICY "Admins can view non-financial audit logs"
ON public.audit_logs FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) AND
  module NOT IN ('user-management', 'settings')
);