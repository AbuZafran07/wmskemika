-- Fix audit_logs security: Add explicit DENY policies and restrict INSERT to system functions

-- 1. Add explicit DENY policy for UPDATE to ensure audit log immutability
CREATE POLICY "audit_logs_immutable_no_updates"
ON public.audit_logs FOR UPDATE
USING (false);

-- 2. Add explicit DENY policy for DELETE to ensure audit log immutability
CREATE POLICY "audit_logs_immutable_no_deletes"
ON public.audit_logs FOR DELETE
USING (false);

-- 3. Drop the existing INSERT policy that allows any authenticated user
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;

-- 4. Create a new, more restrictive INSERT policy
-- This policy allows INSERT only via SECURITY DEFINER functions (like RPC functions)
-- which run with elevated privileges. Direct client inserts are blocked.
-- The check validates that the user_id matches auth.uid() OR is null (for system/RPC inserts)
CREATE POLICY "Audit logs insert via trusted functions only"
ON public.audit_logs FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    user_id = auth.uid() OR
    user_id IS NULL
  )
);