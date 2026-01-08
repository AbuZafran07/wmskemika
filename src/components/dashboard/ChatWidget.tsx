import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Send, X, Maximize2, Minimize2, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message: string;
  is_global: boolean;
  created_at: string;
  read_at: string | null;
  sender?: {
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface OnlineUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

interface ChatWidgetProps {
  onlineUsers?: OnlineUser[];
}

export const ChatWidget = ({ onlineUsers = [] }: ChatWidgetProps) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch messages
  const fetchMessages = async () => {
    if (!user) return;

    let query = supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (selectedUser) {
      // Private chat
      query = query.or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`
      );
    } else {
      // Global chat
      query = query.eq('is_global', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    // Fetch sender profiles
    const senderIds = [...new Set(data?.map((m) => m.sender_id) || [])];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .in('id', senderIds);

    const messagesWithSender = data?.map((msg) => ({
      ...msg,
      sender: profiles?.find((p) => p.id === msg.sender_id),
    })) || [];

    setMessages(messagesWithSender);

    // Count unread
    const unread = messagesWithSender.filter(
      (m) => m.receiver_id === user.id && !m.read_at
    ).length;
    setUnreadCount(unread);
  };

  // Subscribe to realtime changes
  useEffect(() => {
    if (!user) return;

    fetchMessages();

    const channel = supabase
      .channel('chat-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedUser]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when expanded
  useEffect(() => {
    if (!isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMinimized]);

  const sendMessage = async () => {
    if (!user || !newMessage.trim()) return;

    const messageData = {
      sender_id: user.id,
      receiver_id: selectedUser?.id || null,
      message: newMessage.trim(),
      is_global: !selectedUser,
    };

    const { error } = await supabase.from('chat_messages').insert(messageData);

    if (error) {
      console.error('Error sending message:', error);
      toast.error('Gagal mengirim pesan');
      return;
    }

    setNewMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24) {
      return format(date, 'HH:mm');
    }
    return format(date, 'dd/MM HH:mm');
  };

  if (isMinimized) {
    return (
      <Button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <Card
      className={`fixed bottom-4 right-4 shadow-xl z-50 transition-all duration-300 ${
        isExpanded ? 'w-[500px] h-[600px]' : 'w-[350px] h-[450px]'
      }`}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-5 w-5 text-primary" />
          {selectedUser ? (
            <span className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                {selectedUser.avatar_url && (
                  <AvatarImage src={selectedUser.avatar_url} />
                )}
                <AvatarFallback className="text-xs">
                  {getInitials(selectedUser.name || selectedUser.email)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate max-w-[120px]">
                {selectedUser.name || selectedUser.email}
              </span>
            </span>
          ) : (
            'Chat Global'
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <Clock className="h-3 w-3" />
            <span>Auto-hapus 3 hari</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col h-[calc(100%-60px)] p-3 pt-0">
        {/* Online users tabs */}
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
          <Button
            variant={selectedUser === null ? 'default' : 'outline'}
            size="sm"
            className="shrink-0 text-xs h-7"
            onClick={() => setSelectedUser(null)}
          >
            Global
          </Button>
          {onlineUsers
            .filter((u) => u.id !== user?.id)
            .map((onlineUser) => (
              <Button
                key={onlineUser.id}
                variant={selectedUser?.id === onlineUser.id ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 text-xs h-7"
                onClick={() => setSelectedUser(onlineUser)}
              >
                {onlineUser.name?.split(' ')[0] || onlineUser.email.split('@')[0]}
              </Button>
            ))}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Belum ada pesan. Mulai percakapan!
              </p>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.sender_id === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                  >
                    {!isOwnMessage && (
                      <Avatar className="h-7 w-7 shrink-0">
                        {msg.sender?.avatar_url && (
                          <AvatarImage src={msg.sender.avatar_url} />
                        )}
                        <AvatarFallback className="text-xs">
                          {getInitials(
                            msg.sender?.full_name || msg.sender?.email || 'U'
                          )}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[75%] ${
                        isOwnMessage ? 'text-right' : ''
                      }`}
                    >
                      {!isOwnMessage && (
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {msg.sender?.full_name ||
                            msg.sender?.email?.split('@')[0] ||
                            'User'}
                        </p>
                      )}
                      <div
                        className={`rounded-lg px-3 py-2 text-sm ${
                          isOwnMessage
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        {msg.message}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatMessageTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2 mt-2">
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ketik pesan..."
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!newMessage.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
