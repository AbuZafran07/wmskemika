-- Add is_pinned and edited_at columns for pin message and edit message features
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone DEFAULT null;

-- Create index for pinned messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON public.chat_messages (is_pinned) WHERE is_pinned = true;