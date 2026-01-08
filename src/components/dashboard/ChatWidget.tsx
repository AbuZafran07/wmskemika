import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MessageCircle, Send, X, Maximize2, Minimize2, Clock, Smile } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { useTheme } from '@/contexts/ThemeContext';

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

interface TypingUser {
  id: string;
  name: string;
  isTyping: boolean;
  chatTarget: string | null; // null = global, otherwise user id
}

interface ChatWidgetProps {
  onlineUsers?: OnlineUser[];
}

export const ChatWidget = ({ onlineUsers = [] }: ChatWidgetProps) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch messages
  const fetchMessages = async () => {
    if (!user) return;

    let query = supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (selectedUser) {
      query = query.or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`
      );
    } else {
      query = query.eq('is_global', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

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

    const unread = messagesWithSender.filter(
      (m) => m.receiver_id === user.id && !m.read_at
    ).length;
    setUnreadCount(unread);
  };

  // Setup typing indicator presence channel
  useEffect(() => {
    if (!user) return;

    const typingChannel = supabase.channel('typing-indicators', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    typingChannel
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannel.presenceState();
        const typing: TypingUser[] = [];
        
        Object.keys(state).forEach((key) => {
          if (key === user.id) return;
          const presences = state[key] as unknown as TypingUser[];
          if (presences && presences.length > 0 && presences[0].isTyping) {
            typing.push(presences[0]);
          }
        });
        
        setTypingUsers(typing);
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      typingChannel.unsubscribe();
    };
  }, [user]);

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

  // Handle typing indicator
  const updateTypingStatus = useCallback(async (isTyping: boolean) => {
    if (!user || !typingChannelRef.current) return;

    await typingChannelRef.current.track({
      id: user.id,
      name: user.name || user.email,
      isTyping,
      chatTarget: selectedUser?.id || null,
    });
  }, [user, selectedUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    // Update typing status
    updateTypingStatus(true);
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
    }, 2000);
  };

  const sendMessage = async () => {
    if (!user || !newMessage.trim()) return;

    // Stop typing indicator
    updateTypingStatus(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

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

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
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

  // Get typing users for current chat
  const activeTypingUsers = typingUsers.filter((t) => {
    if (selectedUser) {
      return t.chatTarget === user?.id || t.id === selectedUser.id;
    }
    return t.chatTarget === null;
  });

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

            {/* Typing indicator */}
            {activeTypingUsers.length > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex -space-x-1">
                  {activeTypingUsers.slice(0, 3).map((t) => (
                    <Avatar key={t.id} className="h-5 w-5 border-2 border-background">
                      <AvatarFallback className="text-[8px]">
                        {getInitials(t.name)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs">
                    {activeTypingUsers.length === 1
                      ? `${activeTypingUsers[0].name.split(' ')[0]} sedang mengetik`
                      : `${activeTypingUsers.length} orang sedang mengetik`}
                  </span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input with emoji picker */}
        <div className="flex gap-2 mt-2">
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
              >
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              side="top" 
              align="start" 
              className="w-auto p-0 border-0"
              sideOffset={8}
            >
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                width={300}
                height={350}
                searchPlaceholder="Cari emoji..."
                previewConfig={{ showPreview: false }}
              />
            </PopoverContent>
          </Popover>
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={handleInputChange}
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
