import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { requestFCMToken, onFCMMessage } from '@/lib/firebase';
import { toast } from 'sonner';
import { setBadgeCount } from '@/lib/badgeUtils';

export function useWebPush() {
  const { user, session } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Register FCM token and save to database
  const subscribe = useCallback(async () => {
    if (!user?.id || !session) return false;
    setIsLoading(true);

    try {
      const token = await requestFCMToken();
      if (!token) {
        setIsLoading(false);
        return false;
      }

      // Save token to push_tokens table (upsert)
      const { error } = await supabase
        .from('push_tokens' as any)
        .upsert(
          { user_id: user.id, token, device_type: 'web', updated_at: new Date().toISOString() },
          { onConflict: 'user_id,token' }
        );

      if (error) {
        console.error('Error saving push token:', error);
        setIsLoading(false);
        return false;
      }

      setIsSubscribed(true);
      console.log('Web Push subscribed successfully');
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error subscribing to web push:', error);
      setIsLoading(false);
      return false;
    }
  }, [user?.id, session]);

  // Unsubscribe - remove token from database
  const unsubscribe = useCallback(async () => {
    if (!user?.id) return;

    try {
      await supabase
        .from('push_tokens' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('device_type', 'web');

      setIsSubscribed(false);
    } catch (error) {
      console.error('Error unsubscribing:', error);
    }
  }, [user?.id]);

  // Listen for foreground messages
  useEffect(() => {
    if (!isSubscribed) return;

    const setupForegroundListener = async () => {
      const { getFirebaseMessaging } = await import('@/lib/firebase');
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;

      const unsub = onFCMMessage((payload) => {
        // Show toast for foreground messages
        const title = payload.notification?.title || 'Notifikasi';
        const body = payload.notification?.body || '';
        toast(title, { description: body });
      });

      if (unsub) {
        unsubscribeRef.current = unsub;
      }
    };

    setupForegroundListener();

    return () => {
      unsubscribeRef.current?.();
    };
  }, [isSubscribed]);

  // Auto-subscribe on login
  useEffect(() => {
    if (user?.id && session && !isSubscribed) {
      // Check if we have permission already
      if ('Notification' in window && Notification.permission === 'granted') {
        subscribe();
      }
    }
  }, [user?.id, session]);

  return {
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
