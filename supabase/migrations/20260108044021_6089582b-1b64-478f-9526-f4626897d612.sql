-- Add reply_to_id column for reply functionality
ALTER TABLE public.chat_messages 
ADD COLUMN reply_to_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL;

-- Add mentions column to store mentioned user IDs
ALTER TABLE public.chat_messages 
ADD COLUMN mentions UUID[] DEFAULT '{}';

-- Create index for faster reply lookups
CREATE INDEX idx_chat_messages_reply_to ON public.chat_messages(reply_to_id);

-- Create index for mentions
CREATE INDEX idx_chat_messages_mentions ON public.chat_messages USING GIN(mentions);