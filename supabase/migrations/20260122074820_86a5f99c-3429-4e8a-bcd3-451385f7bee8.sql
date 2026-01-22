-- Fix profiles table: Update policy missing auth.uid() IS NOT NULL check
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() IS NOT NULL AND auth.uid() = id);

-- Fix profiles_chat_view: Recreate as security invoker view with proper RLS
-- First drop the existing view
DROP VIEW IF EXISTS public.profiles_chat_view;

-- Recreate the view with security_invoker = true
-- This ensures the view uses the permissions of the querying user, not the view creator
CREATE VIEW public.profiles_chat_view 
WITH (security_invoker = true) AS
SELECT 
    id,
    full_name,
    avatar_url,
    is_active
FROM public.profiles
WHERE is_active = true;

-- Grant access to authenticated users (the underlying profiles table RLS will enforce security)
GRANT SELECT ON public.profiles_chat_view TO authenticated;

-- Revoke public access
REVOKE ALL ON public.profiles_chat_view FROM anon;
REVOKE ALL ON public.profiles_chat_view FROM public;