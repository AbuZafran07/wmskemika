-- Drop the existing SELECT policy for chat_messages
DROP POLICY IF EXISTS "Users can view their own messages" ON public.chat_messages;

-- Create an improved SELECT policy that also includes mentioned users
CREATE POLICY "Users can view accessible messages"
ON public.chat_messages
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (
    auth.uid() = sender_id 
    OR auth.uid() = receiver_id 
    OR is_global = true
    OR auth.uid() = ANY(mentions)
  )
);

-- Also ensure there's no UPDATE policy gap - users should only update their own sent messages
-- Drop existing update policy
DROP POLICY IF EXISTS "Users can update read status of received messages" ON public.chat_messages;

-- Create separate policies for updating messages:
-- 1. Senders can edit their own messages (for editing feature)
CREATE POLICY "Senders can update their own messages"
ON public.chat_messages
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = sender_id)
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = sender_id);

-- 2. Receivers can update read_at status
CREATE POLICY "Receivers can update read status"
ON public.chat_messages
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = receiver_id)
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = receiver_id);