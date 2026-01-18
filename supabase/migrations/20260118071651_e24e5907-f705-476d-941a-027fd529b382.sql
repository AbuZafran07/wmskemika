-- Fix chat attachments storage policy to link access to message access
-- This ensures users can only access attachments from messages they have access to

-- First, drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view chat attachments" ON storage.objects;

-- Create a new policy that links storage access to chat_messages access
-- Users can only view attachments if they:
-- 1. Sent the message containing the attachment
-- 2. Received the message (private chat)
-- 3. The message is global (global chat)
-- 4. Are mentioned in the message
-- Note: file_url in chat_messages stores the full path as: {sender_user_id}/{timestamp}.{extension}
CREATE POLICY "Users can view chat attachments for accessible messages"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments' 
  AND auth.uid() IS NOT NULL
  AND (
    -- Owner can always access their own uploads (file path starts with user ID)
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Check if user has access to any message that references this attachment
    EXISTS (
      SELECT 1 FROM public.chat_messages cm
      WHERE cm.file_url LIKE '%' || name || '%'
      AND (
        cm.sender_id = auth.uid()
        OR cm.receiver_id = auth.uid()
        OR cm.is_global = true
        OR auth.uid() = ANY(cm.mentions)
      )
    )
  )
);