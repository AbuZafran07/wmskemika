import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  type: 'low_stock' | 'expiring_soon' | 'expired' | 'info' | 'approval_pending' | 'approved' | 'cancelled' | 'new_order' | 'revision_requested' | 'urgent_request' | 'urgent_approved' | 'urgent_rejected';
  title: string;
  message: string;
  productId?: string;
  productName?: string;
  batchNo?: string;
  module?: string;
  refId?: string;
  refNo?: string;
  createdAt: Date;
  read: boolean;
}

// Sound notification utility
const playNotificationSound = (type: 'critical' | 'warning' | 'info') => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'critical') {
      oscillator.frequency.value = 880;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
      
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 880;
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.15);
      }, 200);
    } else if (type === 'warning') {
      oscillator.frequency.value = 660;
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } else {
      oscillator.frequency.value = 520;
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    }
  } catch (error) {
    console.log('Audio not supported');
  }
};

// Browser push notification utility
const sendBrowserNotification = async (
  title: string, 
  body: string, 
  options?: { tag?: string; requireInteraction?: boolean }
) => {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: '/logo-kemika.png',
      tag: options?.tag,
      requireInteraction: options?.requireInteraction ?? false,
    });
    
    if (!options?.requireInteraction) {
      setTimeout(() => notification.close(), 5000);
    }
    
    return notification;
  }
};

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('notification_sound_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [pushEnabled, setPushEnabled] = useState(() => {
    const saved = localStorage.getItem('push_notifications_enabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const previousNotifIds = useRef<Set<string>>(new Set());

  const toggleSound = useCallback((enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem('notification_sound_enabled', JSON.stringify(enabled));
  }, []);

  const togglePush = useCallback((enabled: boolean) => {
    setPushEnabled(enabled);
    localStorage.setItem('push_notifications_enabled', JSON.stringify(enabled));
  }, []);

  const requestPushPermission = useCallback(async () => {
    if (!('Notification' in window)) return false;
    
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const notifs: Notification[] = [];
      const now = new Date();

      // Fetch products with low stock
      const { data: products } = await supabase
        .from('products')
        .select(`
          id, name, sku, min_stock,
          category:categories(name),
          unit:units(name)
        `)
        .is('deleted_at', null)
        .eq('is_active', true);

      // Fetch all inventory batches
      const { data: batches } = await supabase
        .from('inventory_batches')
        .select('id, product_id, batch_no, qty_on_hand, expired_date')
        .gt('qty_on_hand', 0);

      if (products && batches) {
        // Check for low stock
        products.forEach((product: any) => {
          const productBatches = batches.filter((b: any) => b.product_id === product.id);
          const totalStock = productBatches.reduce((sum: number, b: any) => sum + (b.qty_on_hand || 0), 0);
          
          if (totalStock > 0 && totalStock <= (product.min_stock || 0)) {
            notifs.push({
              id: `low_stock_${product.id}`,
              type: 'low_stock',
              title: 'Low Stock Alert',
              message: `${product.name} has only ${totalStock} units left (min: ${product.min_stock})`,
              productId: product.id,
              productName: product.name,
              createdAt: now,
              read: false,
            });
          }
        });

        // Check for expiring batches (within 30 days)
        batches.forEach((batch: any) => {
          if (!batch.expired_date) return;
          
          const expiryDate = new Date(batch.expired_date);
          const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          const product = products.find((p: any) => p.id === batch.product_id);
          if (!product) return;

          if (diffDays <= 0) {
            notifs.push({
              id: `expired_${batch.id}`,
              type: 'expired',
              title: 'Expired Batch',
              message: `${product.name} batch ${batch.batch_no} has expired`,
              productId: product.id,
              productName: product.name,
              batchNo: batch.batch_no,
              createdAt: now,
              read: false,
            });
          } else if (diffDays <= 30) {
            notifs.push({
              id: `expiring_${batch.id}`,
              type: 'expiring_soon',
              title: 'Expiring Soon',
              message: `${product.name} batch ${batch.batch_no} expires in ${diffDays} days`,
              productId: product.id,
              productName: product.name,
              batchNo: batch.batch_no,
              createdAt: now,
              read: false,
            });
          }
        });
      }

      // Fetch pending approval orders (Plan Orders, Sales Orders, Stock Adjustments)
      const { data: pendingPlanOrders } = await supabase
        .from('plan_order_headers')
        .select('id, plan_number, created_at, status, suppliers(name)')
        .in('status', ['pending', 'revision_requested'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: pendingSalesOrders } = await supabase
        .from('sales_order_headers')
        .select('id, sales_order_number, created_at, status, customers(name)')
        .in('status', ['pending', 'revision_requested'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: pendingAdjustments } = await supabase
        .from('stock_adjustments')
        .select('id, adjustment_number, created_at, status, reason')
        .eq('status', 'pending')
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      // Add approval pending & revision request notifications
      pendingPlanOrders?.forEach((order: any) => {
        const isRevision = order.status === 'revision_requested';
        notifs.push({
          id: `${isRevision ? 'revision' : 'pending'}_po_${order.id}`,
          type: isRevision ? 'revision_requested' : 'approval_pending',
          title: isRevision ? 'Plan Order Revision Request' : 'Plan Order Pending Approval',
          message: isRevision 
            ? `${order.plan_number} from ${order.suppliers?.name || 'Unknown'} requests revision`
            : `${order.plan_number} from ${order.suppliers?.name || 'Unknown'} awaits approval`,
          module: 'plan_order',
          refId: order.id,
          refNo: order.plan_number,
          createdAt: new Date(order.created_at),
          read: false,
        });
      });

      pendingSalesOrders?.forEach((order: any) => {
        const isRevision = order.status === 'revision_requested';
        notifs.push({
          id: `${isRevision ? 'revision' : 'pending'}_so_${order.id}`,
          type: isRevision ? 'revision_requested' : 'approval_pending',
          title: isRevision ? 'Sales Order Revision Request' : 'Sales Order Pending Approval',
          message: isRevision
            ? `${order.sales_order_number} for ${order.customers?.name || 'Unknown'} requests revision`
            : `${order.sales_order_number} for ${order.customers?.name || 'Unknown'} awaits approval`,
          module: 'sales_order',
          refId: order.id,
          refNo: order.sales_order_number,
          createdAt: new Date(order.created_at),
          read: false,
        });
      });

      pendingAdjustments?.forEach((adj: any) => {
        notifs.push({
          id: `pending_adj_${adj.id}`,
          type: 'approval_pending',
          title: 'Stock Adjustment Pending Approval',
          message: `${adj.adjustment_number} - ${adj.reason} awaits approval`,
          module: 'stock_adjustment',
          refId: adj.id,
          refNo: adj.adjustment_number,
          createdAt: new Date(adj.created_at),
          read: false,
        });
      });

      // Fetch pending Urgent/Cito label requests (for warehouse & finance)
      const userRole = user?.role;
      if (userRole && ['super_admin', 'warehouse', 'finance'].includes(userRole)) {
        const { data: urgentRequests } = await supabase
          .from('delivery_comments')
          .select('id, delivery_request_id, user_id, message, created_at')
          .eq('approval_status', 'pending')
          .order('created_at', { ascending: false })
          .limit(20);

        if (urgentRequests && urgentRequests.length > 0) {
          const requesterIds = [...new Set(urgentRequests.map(r => r.user_id))];
          const { data: requesterProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', requesterIds);

          urgentRequests.forEach((req: any) => {
            const requesterName = requesterProfiles?.find(p => p.id === req.user_id)?.full_name || 'Unknown';
            notifs.push({
              id: `urgent_req_${req.id}`,
              type: 'urgent_request',
              title: '🚨 Permintaan Label Urgent/Cito',
              message: `${requesterName}: ${req.message.substring(0, 100)}${req.message.length > 100 ? '...' : ''}`,
              module: 'delivery',
              refId: req.delivery_request_id,
              createdAt: new Date(req.created_at),
              read: false,
            });
          });
        }
      }

      // Fetch approved/rejected Urgent/Cito requests for the requester (sales notification)
      if (user?.id) {
        const { data: resolvedRequests } = await supabase
          .from('delivery_comments')
          .select('id, delivery_request_id, user_id, message, approved_by, approved_at, approval_status, rejected_reason, label_request_id')
          .eq('user_id', user.id)
          .in('approval_status', ['approved', 'rejected'])
          .not('approved_at', 'is', null)
          .order('approved_at', { ascending: false })
          .limit(20);

        if (resolvedRequests && resolvedRequests.length > 0) {
          const approverIds = [...new Set(resolvedRequests.map(r => r.approved_by).filter(Boolean))];
          const { data: approverProfiles } = approverIds.length > 0
            ? await supabase.from('profiles').select('id, full_name').in('id', approverIds)
            : { data: [] };

          resolvedRequests.forEach((req: any) => {
            const approverName = approverProfiles?.find((p: any) => p.id === req.approved_by)?.full_name || 'Unknown';
            const isApproved = req.approval_status === 'approved';
            const approvedAt = req.approved_at ? new Date(req.approved_at) : new Date(req.created_at);
            // Only show notifications from last 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            if (approvedAt < sevenDaysAgo) return;

            notifs.push({
              id: `urgent_${req.approval_status}_${req.id}`,
              type: isApproved ? 'urgent_approved' : 'urgent_rejected',
              title: isApproved ? '✅ Permintaan Urgent/Cito Disetujui' : '❌ Permintaan Urgent/Cito Ditolak',
              message: isApproved
                ? `Disetujui oleh ${approverName}`
                : `Ditolak oleh ${approverName}${req.rejected_reason ? `: ${req.rejected_reason}` : ''}`,
              module: 'delivery',
              refId: req.delivery_request_id,
              createdAt: approvedAt,
              read: false,
            });
          });
        }
      }

      // Sort by priority and date
      notifs.sort((a, b) => {
        const priority: Record<string, number> = { 
          expired: 0, 
          urgent_request: 1,
          urgent_rejected: 2,
          urgent_approved: 3,
          revision_requested: 4,
          approval_pending: 5, 
          expiring_soon: 6, 
          low_stock: 7, 
          new_order: 8,
          approved: 9,
          cancelled: 10,
          info: 11 
        };
        const priorityDiff = priority[a.type] - priority[b.type];
        if (priorityDiff !== 0) return priorityDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      // Check for new notifications and play sound / push notification
      const currentIds = new Set(notifs.map(n => n.id));
      const newNotifs = notifs.filter(n => !previousNotifIds.current.has(n.id));
      
      if (newNotifs.length > 0 && previousNotifIds.current.size > 0) {
        // Determine sound type based on notification priority
        const hasCritical = newNotifs.some(n => n.type === 'expired' || n.type === 'low_stock' || n.type === 'urgent_request' || n.type === 'urgent_rejected');
        const hasWarning = newNotifs.some(n => n.type === 'expiring_soon' || n.type === 'approval_pending' || n.type === 'revision_requested' || n.type === 'urgent_approved');
        
        if (soundEnabled) {
          if (hasCritical) {
            playNotificationSound('critical');
          } else if (hasWarning) {
            playNotificationSound('warning');
          } else {
            playNotificationSound('info');
          }
        }

        // Send browser push notifications for critical alerts
        if (pushEnabled && 'Notification' in window && Notification.permission === 'granted') {
          newNotifs.forEach(n => {
            if (n.type === 'expired' || n.type === 'low_stock' || n.type === 'approval_pending' || n.type === 'revision_requested' || n.type === 'urgent_request') {
              const icon = n.type === 'urgent_request' ? '🚨' : n.type === 'expired' ? '🚨' : n.type === 'low_stock' ? '⚠️' : n.type === 'revision_requested' ? '📝' : '🔔';
              sendBrowserNotification(
                `${icon} ${n.title}`,
                n.message,
                { 
                  tag: n.id, 
                  requireInteraction: n.type === 'expired' || n.type === 'approval_pending' 
                }
              );
            }
          });
        }
      }
      
      previousNotifIds.current = currentIds;
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
    setLoading(false);
  }, [soundEnabled, pushEnabled, user?.role]);

  // Setup real-time subscriptions
  useEffect(() => {
    fetchNotifications();

    // Subscribe to plan_order_headers changes
    const planOrderChannel = supabase
      .channel('plan-order-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plan_order_headers' },
        () => {
          console.log('Plan order change detected');
          fetchNotifications();
        }
      )
      .subscribe();

    // Subscribe to sales_order_headers changes
    const salesOrderChannel = supabase
      .channel('sales-order-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_order_headers' },
        () => {
          console.log('Sales order change detected');
          fetchNotifications();
        }
      )
      .subscribe();

    // Subscribe to stock_adjustments changes
    const adjustmentChannel = supabase
      .channel('stock-adjustment-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_adjustments' },
        () => {
          console.log('Stock adjustment change detected');
          fetchNotifications();
        }
      )
      .subscribe();

    // Subscribe to inventory_batches changes (for expiry/stock alerts)
    const batchChannel = supabase
      .channel('inventory-batch-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_batches' },
        () => {
          console.log('Inventory batch change detected');
          fetchNotifications();
        }
      )
      .subscribe();

    // Subscribe to stock_in_headers changes
    const stockInChannel = supabase
      .channel('stock-in-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_in_headers' },
        () => {
          console.log('Stock in change detected');
          fetchNotifications();
        }
      )
      .subscribe();

    // Subscribe to stock_out_headers changes
    const stockOutChannel = supabase
      .channel('stock-out-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_out_headers' },
        () => {
          console.log('Stock out change detected');
          fetchNotifications();
        }
      )
      .subscribe();

    // Subscribe to delivery_comments changes (for urgent/cito approval requests)
    const deliveryCommentsChannel = supabase
      .channel('delivery-comments-urgent')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_comments' },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    // Also keep the polling as fallback (every 5 minutes)
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(planOrderChannel);
      supabase.removeChannel(salesOrderChannel);
      supabase.removeChannel(adjustmentChannel);
      supabase.removeChannel(batchChannel);
      supabase.removeChannel(stockInChannel);
      supabase.removeChannel(stockOutChannel);
      supabase.removeChannel(deliveryCommentsChannel);
    };
  }, [fetchNotifications]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return {
    notifications,
    loading,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    soundEnabled,
    toggleSound,
    pushEnabled,
    togglePush,
    requestPushPermission,
    playNotificationSound,
  };
}
