-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  receiver_id UUID,
  message TEXT NOT NULL,
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own messages"
ON public.chat_messages
FOR SELECT
USING (
  auth.uid() = sender_id 
  OR auth.uid() = receiver_id 
  OR is_global = true
);

CREATE POLICY "Authenticated users can send messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update read status of received messages"
ON public.chat_messages
FOR UPDATE
USING (auth.uid() = receiver_id);

-- Create index for faster queries
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX idx_chat_messages_sender ON public.chat_messages(sender_id);
CREATE INDEX idx_chat_messages_receiver ON public.chat_messages(receiver_id);

-- Create function to cleanup old messages (older than 3 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.chat_messages
  WHERE created_at < NOW() - INTERVAL '3 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a trigger function that runs cleanup on every insert
CREATE OR REPLACE FUNCTION public.trigger_cleanup_old_messages()
RETURNS TRIGGER AS $$
BEGIN
  -- Run cleanup only occasionally (roughly 1% of inserts)
  IF random() < 0.01 THEN
    PERFORM public.cleanup_old_chat_messages();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
CREATE TRIGGER cleanup_chat_messages_trigger
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_cleanup_old_messages();

-- Enable realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;