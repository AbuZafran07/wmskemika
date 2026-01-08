import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Circle } from 'lucide-react';
import { RealtimeChannel } from '@supabase/supabase-js';

interface OnlineUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  online_at: string;
}

export const OnlinePresence = () => {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) return;

    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const users: OnlineUser[] = [];
        
        Object.keys(state).forEach((key) => {
          const presences = state[key] as unknown as OnlineUser[];
          if (presences && presences.length > 0) {
            users.push(presences[0]);
          }
        });
        
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar || null,
            online_at: new Date().toISOString(),
          });
        }
      });

    setChannel(presenceChannel);

    return () => {
      presenceChannel.unsubscribe();
    };
  }, [user]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    return `${Math.floor(diffHours / 24)} hari lalu`;
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-5 w-5 text-primary" />
          User Online
          <Badge variant="secondary" className="ml-auto">
            {onlineUsers.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {onlineUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Tidak ada user online
          </p>
        ) : (
          <div className="space-y-3 max-h-[200px] overflow-y-auto">
            {onlineUsers.map((onlineUser) => (
              <div
                key={onlineUser.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
              >
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    {onlineUser.avatar_url ? (
                      <AvatarImage src={onlineUser.avatar_url} alt={onlineUser.name} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {getInitials(onlineUser.name || onlineUser.email)}
                    </AvatarFallback>
                  </Avatar>
                  <Circle className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-green-500 text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {onlineUser.name || onlineUser.email}
                    {onlineUser.id === user?.id && (
                      <span className="text-muted-foreground ml-1">(Anda)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getTimeAgo(onlineUser.online_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
