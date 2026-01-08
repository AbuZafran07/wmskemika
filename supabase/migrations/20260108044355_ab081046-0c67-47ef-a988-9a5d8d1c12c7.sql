-- Add file attachment columns to chat_messages
ALTER TABLE public.chat_messages 
ADD COLUMN file_url TEXT,
ADD COLUMN file_name TEXT,
ADD COLUMN file_type TEXT,
ADD COLUMN file_size BIGINT;

-- Create chat_reactions table for emoji reactions
CREATE TABLE public.chat_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS on chat_reactions
ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat_reactions
CREATE POLICY "Users can view reactions on accessible messages"
ON public.chat_reactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages m 
    WHERE m.id = message_id 
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid() OR m.is_global = true)
  )
);

CREATE POLICY "Authenticated users can add reactions"
ON public.chat_reactions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reactions"
ON public.chat_reactions
FOR DELETE
USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_chat_reactions_message ON public.chat_reactions(message_id);
CREATE INDEX idx_chat_reactions_user ON public.chat_reactions(user_id);

-- Enable realtime for chat_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;

-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments', 
  'chat-attachments', 
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
);

-- Storage policies for chat-attachments bucket
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);