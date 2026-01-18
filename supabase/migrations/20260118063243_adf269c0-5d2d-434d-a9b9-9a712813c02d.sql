-- Fix chat_messages SELECT policy: require authentication for all access
-- Currently allows unauthenticated users to read global messages

DROP POLICY IF EXISTS "Users can view their own messages" ON public.chat_messages;

CREATE POLICY "Users can view their own messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR is_global = true
  )
);

-- Fix chat_reactions SELECT policy: require authentication first
DROP POLICY IF EXISTS "Users can view reactions on accessible messages" ON public.chat_reactions;

CREATE POLICY "Users can view reactions on accessible messages"
ON public.chat_reactions
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM chat_messages m
    WHERE m.id = chat_reactions.message_id
    AND (
      m.sender_id = auth.uid()
      OR m.receiver_id = auth.uid()
      OR m.is_global = true
    )
  )
);