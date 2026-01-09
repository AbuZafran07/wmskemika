import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Send,
  X,
  Maximize2,
  Minimize2,
  Clock,
  Smile,
  Reply,
  AtSign,
  Paperclip,
  Image,
  FileText,
  Download,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "@/contexts/ThemeContext";
import ktalkIcon from "@/assets/ktalk-icon.png";

interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message: string;
  is_global: boolean;
  created_at: string;
  read_at: string | null;
  reply_to_id: string | null;
  mentions: string[] | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  sender?: {
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  reply_to?: ChatMessage | null;
  reactions?: ChatReaction[];
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
  chatTarget: string | null;
}

interface ChatWidgetProps {
  onlineUsers?: OnlineUser[];
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export const ChatWidget = ({ onlineUsers = [] }: ChatWidgetProps) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [allUsers, setAllUsers] = useState<OnlineUser[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch all users for mentions
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from("profiles").select("id, email, full_name, avatar_url").eq("is_active", true);

      if (data) {
        setAllUsers(
          data.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.full_name || u.email,
            avatar_url: u.avatar_url,
          })),
        );
      }
    };
    fetchUsers();
  }, []);

  const filteredMentionUsers = useMemo(() => {
    if (!mentionSearch) return allUsers.filter((u) => u.id !== user?.id);
    const search = mentionSearch.toLowerCase();
    return allUsers.filter(
      (u) => u.id !== user?.id && (u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)),
    );
  }, [allUsers, mentionSearch, user?.id]);

  // Fetch messages with reactions
  const fetchMessages = async () => {
    if (!user) return;

    let query = supabase.from("chat_messages").select("*").order("created_at", { ascending: true });

    if (selectedUser) {
      query = query.or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${user.id})`,
      );
    } else {
      query = query.eq("is_global", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching messages:", error);
      return;
    }

    const messageIds = data?.map((m) => m.id) || [];
    const senderIds = [...new Set(data?.map((m) => m.sender_id) || [])];
    const replyIds = [...new Set(data?.filter((m) => m.reply_to_id).map((m) => m.reply_to_id) || [])];

    // Fetch profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name, avatar_url")
      .in("id", senderIds);

    // Fetch reactions
    let reactions: ChatReaction[] = [];
    if (messageIds.length > 0) {
      const { data: reactionsData } = await supabase.from("chat_reactions").select("*").in("message_id", messageIds);
      reactions = reactionsData || [];
    }

    // Fetch replied messages
    let repliedMessages: ChatMessage[] = [];
    if (replyIds.length > 0) {
      const { data: replies } = await supabase
        .from("chat_messages")
        .select("*")
        .in("id", replyIds as string[]);

      if (replies) {
        const replySenderIds = [...new Set(replies.map((r) => r.sender_id))];
        const { data: replyProfiles } = await supabase
          .from("profiles")
          .select("id, email, full_name, avatar_url")
          .in("id", replySenderIds);

        repliedMessages = replies.map((msg) => ({
          ...msg,
          sender: replyProfiles?.find((p) => p.id === msg.sender_id),
        }));
      }
    }

    const messagesWithSender =
      data?.map((msg) => ({
        ...msg,
        sender: profiles?.find((p) => p.id === msg.sender_id),
        reply_to: repliedMessages.find((r) => r.id === msg.reply_to_id) || null,
        reactions: reactions.filter((r) => r.message_id === msg.id),
      })) || [];

    setMessages(messagesWithSender);

    const unread = messagesWithSender.filter((m) => m.receiver_id === user.id && !m.read_at).length;
    setUnreadCount(unread);
  };

  // Setup typing indicator
  useEffect(() => {
    if (!user) return;

    const typingChannel = supabase.channel("typing-indicators", {
      config: { presence: { key: user.id } },
    });

    typingChannel
      .on("presence", { event: "sync" }, () => {
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
      .channel("chat-realtime-combined")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (payload) => {
        const newMsg = payload.new as any;
        if (payload.eventType === "INSERT" && newMsg.mentions?.includes(user.id) && newMsg.sender_id !== user.id) {
          try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 800;
            gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
          } catch (e) {}
          toast.info("Anda dimention dalam chat!");
        }
        fetchMessages();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedUser]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMinimized]);

  const updateTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!user || !typingChannelRef.current) return;
      await typingChannelRef.current.track({
        id: user.id,
        name: user.name || user.email,
        isTyping,
        chatTarget: selectedUser?.id || null,
      });
    },
    [user, selectedUser],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    setNewMessage(value);

    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(" ")) {
        setShowMentionList(true);
        setMentionStartIndex(lastAtIndex);
        setMentionSearch(textAfterAt);
      } else {
        setShowMentionList(false);
        setMentionStartIndex(-1);
        setMentionSearch("");
      }
    } else {
      setShowMentionList(false);
      setMentionStartIndex(-1);
      setMentionSearch("");
    }

    updateTypingStatus(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => updateTypingStatus(false), 2000);
  };

  const insertMention = (mentionUser: OnlineUser) => {
    if (mentionStartIndex === -1) return;

    const beforeMention = newMessage.slice(0, mentionStartIndex);
    const afterMention = newMessage.slice(mentionStartIndex + mentionSearch.length + 1);
    const mentionText = `@${mentionUser.name.split(" ")[0]} `;

    setNewMessage(beforeMention + mentionText + afterMention);
    setShowMentionList(false);
    setMentionStartIndex(-1);
    setMentionSearch("");
    inputRef.current?.focus();
  };

  const extractMentions = (text: string): string[] => {
    const mentionedIds: string[] = [];
    const mentionRegex = /@(\S+)/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionName = match[1].toLowerCase();
      const mentionedUser = allUsers.find(
        (u) =>
          u.name.split(" ")[0].toLowerCase() === mentionName || u.email.split("@")[0].toLowerCase() === mentionName,
      );
      if (mentionedUser && !mentionedIds.includes(mentionedUser.id)) {
        mentionedIds.push(mentionedUser.id);
      }
    }

    return mentionedIds;
  };

  // File upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File terlalu besar. Maksimal 10MB");
      return;
    }

    setSelectedFile(file);
  };

  const uploadFile = async (): Promise<{ url: string; name: string; type: string; size: number } | null> => {
    if (!selectedFile || !user) return null;

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(fileName, selectedFile);

      if (uploadError) throw uploadError;

      return {
        url: fileName,
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
      };
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Gagal mengupload file");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    if (!user || (!newMessage.trim() && !selectedFile)) return;

    updateTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    let fileData = null;
    if (selectedFile) {
      fileData = await uploadFile();
      if (!fileData && !newMessage.trim()) return;
    }

    const mentions = extractMentions(newMessage);

    const messageData: any = {
      sender_id: user.id,
      receiver_id: selectedUser?.id || null,
      message: newMessage.trim() || (fileData ? `📎 ${fileData.name}` : ""),
      is_global: !selectedUser,
      reply_to_id: replyingTo?.id || null,
      mentions: mentions.length > 0 ? mentions : null,
      file_url: fileData?.url || null,
      file_name: fileData?.name || null,
      file_type: fileData?.type || null,
      file_size: fileData?.size || null,
    };

    const { error } = await supabase.from("chat_messages").insert(messageData);

    if (error) {
      console.error("Error sending message:", error);
      toast.error("Gagal mengirim pesan");
      return;
    }

    setNewMessage("");
    setReplyingTo(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Reaction handlers
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    const message = messages.find((m) => m.id === messageId);
    const existingReaction = message?.reactions?.find((r) => r.user_id === user.id && r.emoji === emoji);

    if (existingReaction) {
      await supabase.from("chat_reactions").delete().eq("id", existingReaction.id);
    } else {
      await supabase.from("chat_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });
    }

    setShowReactionPicker(null);
  };

  const getFileSignedUrl = async (filePath: string): Promise<string | null> => {
    const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (showMentionList && filteredMentionUsers.length > 0) {
        insertMention(filteredMentionUsers[0]);
      } else {
        sendMessage();
      }
    } else if (e.key === "Escape") {
      setShowMentionList(false);
      setReplyingTo(null);
      setSelectedFile(null);
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) return format(date, "HH:mm");
    return format(date, "dd/MM HH:mm");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMessageContent = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const mentionName = part.slice(1).toLowerCase();
        const isMentionedUser = allUsers.some(
          (u) =>
            u.name.split(" ")[0].toLowerCase() === mentionName || u.email.split("@")[0].toLowerCase() === mentionName,
        );
        const isCurrentUser =
          user &&
          (user.name?.split(" ")[0].toLowerCase() === mentionName ||
            user.email?.split("@")[0].toLowerCase() === mentionName);

        if (isMentionedUser) {
          return (
            <span
              key={i}
              className={`font-semibold ${isCurrentUser ? "bg-primary/20 text-primary px-1 rounded" : "text-primary"}`}
            >
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };

  const activeTypingUsers = typingUsers.filter((t) => {
    if (selectedUser) return t.chatTarget === user?.id || t.id === selectedUser.id;
    return t.chatTarget === null;
  });

  const groupReactions = (reactions: ChatReaction[]) => {
    const grouped: Record<string, { count: number; users: string[]; hasOwn: boolean }> = {};
    reactions.forEach((r) => {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { count: 0, users: [], hasOwn: false };
      }
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.user_id);
      if (r.user_id === user?.id) grouped[r.emoji].hasOwn = true;
    });
    return grouped;
  };

  if (isMinimized) {
    return (
      <Button
        onClick={() => setIsMinimized(false)}
        className={`fixed bottom-4 right-4 h-16 w-16 rounded-full shadow-lg z-50 p-0 overflow-hidden bg-white border border-gray-200 transition-all duration-300 ease-out hover:scale-110 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] ${unreadCount > 0 ? "animate-bounce" : ""}`}
        size="icon"
      >
        <img src={ktalkIcon} alt="K'talk" className="h-full w-full object-contain" />
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
      className={`fixed bottom-4 right-4 shadow-xl z-50 transition-all duration-300 ${isExpanded ? "w-[500px] h-[600px]" : "w-[350px] h-[450px]"}`}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <img src={ktalkIcon} alt="K'talk" className="h-6 w-6 object-contain" />
          {selectedUser ? (
            <span className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                {selectedUser.avatar_url && <AvatarImage src={selectedUser.avatar_url} />}
                <AvatarFallback className="text-xs">
                  {getInitials(selectedUser.name || selectedUser.email)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate max-w-[120px]">{selectedUser.name || selectedUser.email}</span>
            </span>
          ) : (
            "Chat Global"
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <Clock className="h-3 w-3" />
            <span>Auto-hapus 3 hari</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(true)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col h-[calc(100%-60px)] p-3 pt-0">
        {/* Online users tabs */}
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
          <Button
            variant={selectedUser === null ? "default" : "outline"}
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
                variant={selectedUser?.id === onlineUser.id ? "default" : "outline"}
                size="sm"
                className="shrink-0 text-xs h-7"
                onClick={() => setSelectedUser(onlineUser)}
              >
                {onlineUser.name?.split(" ")[0] || onlineUser.email.split("@")[0]}
              </Button>
            ))}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada pesan. Mulai percakapan!</p>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.sender_id === user?.id;
                const groupedReactions = groupReactions(msg.reactions || []);

                return (
                  <div key={msg.id} className={`flex gap-2 ${isOwnMessage ? "flex-row-reverse" : ""} group`}>
                    {!isOwnMessage && (
                      <Avatar className="h-7 w-7 shrink-0">
                        {msg.sender?.avatar_url && <AvatarImage src={msg.sender.avatar_url} />}
                        <AvatarFallback className="text-xs">
                          {getInitials(msg.sender?.full_name || msg.sender?.email || "U")}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`max-w-[75%] ${isOwnMessage ? "text-right" : ""}`}>
                      {!isOwnMessage && (
                        <p className="text-xs text-muted-foreground mb-0.5">
                          {msg.sender?.full_name || msg.sender?.email?.split("@")[0] || "User"}
                        </p>
                      )}

                      {/* Reply preview */}
                      {msg.reply_to && (
                        <div
                          className={`text-xs bg-muted/50 rounded px-2 py-1 mb-1 border-l-2 border-primary ${isOwnMessage ? "ml-auto" : ""}`}
                        >
                          <p className="text-muted-foreground font-medium">
                            {msg.reply_to.sender?.full_name || "User"}
                          </p>
                          <p className="truncate text-muted-foreground">
                            {msg.reply_to.message.slice(0, 50)}
                            {msg.reply_to.message.length > 50 ? "..." : ""}
                          </p>
                        </div>
                      )}

                      <div className="relative">
                        <div
                          className={`rounded-lg px-3 py-2 text-sm ${isOwnMessage ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >
                          {/* File attachment */}
                          {msg.file_url && (
                            <div
                              className={`mb-2 ${msg.message && msg.message !== `📎 ${msg.file_name}` ? "pb-2 border-b border-current/20" : ""}`}
                            >
                              {msg.file_type?.startsWith("image/") ? (
                                <button
                                  className="block rounded overflow-hidden max-w-[200px]"
                                  onClick={async () => {
                                    const url = await getFileSignedUrl(msg.file_url!);
                                    if (url) window.open(url, "_blank");
                                  }}
                                >
                                  <div className="flex items-center gap-2 text-xs opacity-80 mb-1">
                                    <Image className="h-3 w-3" />
                                    <span className="truncate">{msg.file_name}</span>
                                  </div>
                                </button>
                              ) : (
                                <button
                                  className="flex items-center gap-2 p-2 rounded bg-background/20 hover:bg-background/30 transition-colors"
                                  onClick={async () => {
                                    const url = await getFileSignedUrl(msg.file_url!);
                                    if (url) window.open(url, "_blank");
                                  }}
                                >
                                  <FileText className="h-5 w-5 shrink-0" />
                                  <div className="text-left min-w-0">
                                    <p className="text-xs font-medium truncate">{msg.file_name}</p>
                                    <p className="text-[10px] opacity-70">{formatFileSize(msg.file_size || 0)}</p>
                                  </div>
                                  <Download className="h-4 w-4 shrink-0" />
                                </button>
                              )}
                            </div>
                          )}
                          {msg.message && msg.message !== `📎 ${msg.file_name}` && renderMessageContent(msg.message)}
                        </div>

                        {/* Action buttons */}
                        <div
                          className={`absolute -top-1 ${isOwnMessage ? "-left-16" : "-right-16"} flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}
                        >
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyingTo(msg)}>
                            <Reply className="h-3 w-3" />
                          </Button>
                          <Popover
                            open={showReactionPicker === msg.id}
                            onOpenChange={(open) => setShowReactionPicker(open ? msg.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <Smile className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent side="top" className="w-auto p-2">
                              <div className="flex gap-1">
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    className="text-lg hover:scale-125 transition-transform"
                                    onClick={() => toggleReaction(msg.id, emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Reactions display */}
                        {Object.keys(groupedReactions).length > 0 && (
                          <div
                            className={`flex flex-wrap gap-1 mt-1 ${isOwnMessage ? "justify-end" : "justify-start"}`}
                          >
                            {Object.entries(groupedReactions).map(([emoji, data]) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${data.hasOwn ? "bg-primary/20 border border-primary/40" : "bg-muted hover:bg-muted/80"}`}
                              >
                                <span>{emoji}</span>
                                <span className="text-muted-foreground">{data.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <p className="text-[10px] text-muted-foreground mt-0.5">{formatMessageTime(msg.created_at)}</p>
                    </div>
                  </div>
                );
              })
            )}

            {activeTypingUsers.length > 0 && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex -space-x-1">
                  {activeTypingUsers.slice(0, 3).map((t) => (
                    <Avatar key={t.id} className="h-5 w-5 border-2 border-background">
                      <AvatarFallback className="text-[8px]">{getInitials(t.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs">
                    {activeTypingUsers.length === 1
                      ? `${activeTypingUsers[0].name.split(" ")[0]} sedang mengetik`
                      : `${activeTypingUsers.length} orang sedang mengetik`}
                  </span>
                  <span className="flex gap-0.5">
                    <span
                      className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Reply preview */}
        {replyingTo && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-t-lg border-l-2 border-primary mt-2">
            <Reply className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Membalas {replyingTo.sender?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {replyingTo.message.slice(0, 50)}
                {replyingTo.message.length > 50 ? "..." : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyingTo(null)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Selected file preview */}
        {selectedFile && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-t-lg mt-2">
            <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Mention autocomplete */}
        {showMentionList && filteredMentionUsers.length > 0 && (
          <div className="absolute bottom-20 left-3 right-3 bg-popover border rounded-lg shadow-lg max-h-32 overflow-y-auto z-10">
            {filteredMentionUsers.slice(0, 5).map((mentionUser) => (
              <button
                key={mentionUser.id}
                className="w-full flex items-center gap-2 p-2 hover:bg-muted transition-colors text-left"
                onClick={() => insertMention(mentionUser)}
              >
                <Avatar className="h-6 w-6">
                  {mentionUser.avatar_url && <AvatarImage src={mentionUser.avatar_url} />}
                  <AvatarFallback className="text-xs">{getInitials(mentionUser.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{mentionUser.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{mentionUser.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className={`flex gap-2 ${replyingTo || selectedFile ? "" : "mt-2"}`}>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          />

          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-auto p-0 border-0" sideOffset={8}>
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                width={300}
                height={350}
                searchPlaceholder="Cari emoji..."
                previewConfig={{ showPreview: false }}
              />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => {
              setNewMessage((prev) => prev + "@");
              setShowMentionList(true);
              setMentionStartIndex(newMessage.length);
              setMentionSearch("");
              inputRef.current?.focus();
            }}
          >
            <AtSign className="h-5 w-5" />
          </Button>

          <Input
            ref={inputRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder={replyingTo ? "Ketik balasan..." : "Ketik pesan..."}
            className="flex-1"
          />

          <Button size="icon" onClick={sendMessage} disabled={(!newMessage.trim() && !selectedFile) || uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
