-- Create a secure view for chat functionality that excludes email
-- This view only exposes data needed for chat (id, name, avatar)
CREATE OR REPLACE VIEW public.profiles_chat_view
WITH (security_invoker = on) AS
SELECT 
  id,
  full_name,
  avatar_url,
  is_active
FROM public.profiles
WHERE is_active = true;

-- Grant access to the view for authenticated users
GRANT SELECT ON public.profiles_chat_view TO authenticated;

-- Drop the overly permissive policy that exposes emails to all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view profiles for chat" ON public.profiles;