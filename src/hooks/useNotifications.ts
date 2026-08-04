import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { setBadgeCount } from '@/lib/badgeUtils';
import { buildNotificationDeepLink } from '@/lib/notificationDeepLink';
import { logNotificationAudit } from '@/lib/notificationAudit';
import {
  computeKalibrasiColumn,
  COLUMN_CHECKLISTS,
  COLUMN_DEFS,
  CALIBRATION_STAGE_CHECKLIST_KEYS,
  KALIBRASI_CHECKLIST_LABELS,
  type KalibrasiV2Checklist,
} from '@/hooks/useTrackerKalibrasi';

export interface Notification {
  id: string;
  type: 'low_stock' | 'expiring_soon' | 'expired' | 'info' | 'approval_pending' | 'approved' | 'cancelled' | 'new_order' | 'revision_requested' | 'urgent_request' | 'urgent_approved' | 'urgent_rejected' | 'card_comment' | 'mention' | 'calibration_action' | 'calibration_event';
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
  commentIds?: string[];
  count?: number;
}

// Persisted set of comment IDs that the current user has acknowledged (clicked).
const READ_CARD_COMMENTS_KEY = 'read_card_comment_ids_v1';
const MAX_READ_IDS = 500;

function loadReadCommentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_CARD_COMMENTS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveReadCommentIds(set: Set<string>) {
  try {
    // Cap to most recent N to avoid unbounded growth
    const arr = Array.from(set).slice(-MAX_READ_IDS);
    localStorage.setItem(READ_CARD_COMMENTS_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

// Persisted set of acknowledged notification keys (type:refId or type:productId).
// Used so that opening a deep-linked target page auto-marks the corresponding
// notification as read across reloads/sessions.
const READ_NOTIF_KEYS_KEY = 'read_notif_keys_v1';
const MAX_NOTIF_KEYS = 1000;

function loadReadNotifKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_NOTIF_KEYS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveReadNotifKeys(set: Set<string>) {
  try {
    const arr = Array.from(set).slice(-MAX_NOTIF_KEYS);
    localStorage.setItem(READ_NOTIF_KEYS_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

// Compose canonical key for a notification.
function notifKey(n: { type: string; refId?: string; productId?: string }): string | null {
  const id = n.refId || n.productId;
  if (!id) return null;
  return `${n.type}:${id}`;
}

// Detect whether a comment mentions the given user by display name / email local part.
function messageMentionsUser(message: string, displayName?: string, email?: string): boolean {
  if (!message) return false;
  const mentions = (message.match(/@[\w\s.\-']+/g) || []).map(m => m.slice(1).trim().toLowerCase());
  if (!mentions.length) return false;
  const candidates: string[] = [];
  if (displayName) candidates.push(displayName.toLowerCase());
  if (email) {
    candidates.push(email.toLowerCase());
    candidates.push(email.split('@')[0].toLowerCase());
  }
  return mentions.some(m => candidates.some(c => c && (m === c || m.startsWith(c) || c.startsWith(m))));
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
  // Cache of card IDs the current user is involved in (created/assigned/commented)
  // Used to short-circuit realtime INSERT checks without extra DB queries.
  const involvedCardIdsRef = useRef<Set<string>>(new Set());
  // SO numbers per delivery_request_id (for toast labels)
  const cardSoMapRef = useRef<Record<string, string>>({});
  // Persisted read state for card comments
  const readCommentIdsRef = useRef<Set<string>>(loadReadCommentIds());
  // Persisted read state for any notification keyed by type+refId/productId
  const readNotifKeysRef = useRef<Set<string>>(loadReadNotifKeys());
  const location = useLocation();

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

      // Throttle stock/expiry alerts based on schedule setting
      const STOCK_ALERT_KEY = 'stock_alert_last_shown';
      const STOCK_ALERT_SCHEDULE_KEY = 'stock_alert_schedule';
      const lastShown = localStorage.getItem(STOCK_ALERT_KEY);
      
      // Read schedule from settings (cached in localStorage, refreshed on Settings save)
      let scheduleMs = 7 * 24 * 60 * 60 * 1000; // default weekly
      const cachedSchedule = localStorage.getItem(STOCK_ALERT_SCHEDULE_KEY);
      if (cachedSchedule === 'daily') {
        scheduleMs = 24 * 60 * 60 * 1000;
      } else if (cachedSchedule === 'monthly') {
        scheduleMs = 30 * 24 * 60 * 60 * 1000;
      }
      
      // Fetch schedule from DB if not cached
      if (!cachedSchedule) {
        const { data: schedData } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'stock_alert_schedule')
          .maybeSingle();
        if (schedData?.value) {
          const val = typeof schedData.value === 'string' ? schedData.value : 'weekly';
          localStorage.setItem(STOCK_ALERT_SCHEDULE_KEY, val);
          if (val === 'daily') scheduleMs = 24 * 60 * 60 * 1000;
          else if (val === 'monthly') scheduleMs = 30 * 24 * 60 * 60 * 1000;
        }
      }
      
      const shouldShowStockAlerts = !lastShown || (now.getTime() - parseInt(lastShown, 10)) >= scheduleMs;

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

      if (products && batches && shouldShowStockAlerts) {
        // Mark timestamp so alerts won't show again for 1 week
        localStorage.setItem(STOCK_ALERT_KEY, now.getTime().toString());
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

      // Fetch calibration certificates expiring within 30 days (or already expired)
      const { data: certRows } = await supabase
        .from('sales_order_items')
        .select('id, certificate_number, certificate_issued_at, instrument_name, sales_order_headers!inner(sales_order_number, customers(name))')
        .eq('item_type', 'calibration')
        .not('certificate_number', 'is', null)
        .not('certificate_issued_at', 'is', null)
        .is('certificate_revoked_at', null);

      (certRows || []).forEach((it: any) => {
        if (!it.certificate_issued_at) return;
        const issued = new Date(it.certificate_issued_at);
        const expires = new Date(issued);
        expires.setFullYear(expires.getFullYear() + 1);
        const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const soNo = it.sales_order_headers?.sales_order_number || '-';
        const custName = it.sales_order_headers?.customers?.name || '-';
        const label = `${it.certificate_number} · ${it.instrument_name || 'Instrument'} · ${custName}`;
        if (daysLeft <= 0) {
          notifs.push({
            id: `cert_expired_${it.id}`,
            type: 'expired',
            title: 'Sertifikat Kalibrasi Expired',
            message: `${label} — masa berlaku habis pada ${expires.toLocaleDateString('id-ID')}`,
            module: 'calibration',
            refId: it.id,
            refNo: it.certificate_number,
            createdAt: now,
            read: false,
          });
        } else if (daysLeft <= 30) {
          notifs.push({
            id: `cert_expiring_${it.id}`,
            type: 'expiring_soon',
            title: 'Sertifikat Kalibrasi Akan Expired',
            message: `${label} — ${daysLeft} hari lagi (SO ${soNo})`,
            module: 'calibration',
            refId: it.id,
            refNo: it.certificate_number,
            createdAt: now,
            read: false,
          });
        }
      });

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
          const readSet = readCommentIdsRef.current;
          const filteredUrgent = urgentRequests.filter((r: any) => !readSet.has(r.id));
          const requesterIds = [...new Set(filteredUrgent.map((r: any) => r.user_id))];
          const deliveryRequestIds = [...new Set(filteredUrgent.map((r: any) => r.delivery_request_id))];
          
          const [{ data: requesterProfiles }, { data: deliveryRequests }] = await Promise.all([
            supabase.from('profiles').select('id, full_name').in('id', requesterIds),
            supabase.from('delivery_requests').select('id, sales_order_id, sales_order_headers!inner(sales_order_number)').in('id', deliveryRequestIds),
          ]);

          const soMap: Record<string, string> = {};
          deliveryRequests?.forEach((dr: any) => {
            soMap[dr.id] = dr.sales_order_headers?.sales_order_number || '';
          });

          filteredUrgent.forEach((req: any) => {
            const requesterName = requesterProfiles?.find(p => p.id === req.user_id)?.full_name || 'Unknown';
            const soNumber = soMap[req.delivery_request_id] || '';
            const soLabel = soNumber ? ` [${soNumber}]` : '';
            notifs.push({
              id: `urgent_req_${req.id}`,
              type: 'urgent_request',
              title: `🚨 Permintaan Label Urgent/Cito${soLabel}`,
              message: `${requesterName}: ${req.message.substring(0, 100)}${req.message.length > 100 ? '...' : ''}`,
              module: 'delivery',
              refId: req.delivery_request_id,
              refNo: soNumber,
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
          const readSet = readCommentIdsRef.current;
          const filteredResolved = resolvedRequests.filter((r: any) => !readSet.has(r.id));
          const approverIds = [...new Set(filteredResolved.map((r: any) => r.approved_by).filter(Boolean))];
          const resolvedDeliveryIds = [...new Set(filteredResolved.map((r: any) => r.delivery_request_id))];
          
          const [{ data: approverProfiles }, { data: resolvedDeliveryReqs }] = await Promise.all([
            approverIds.length > 0
              ? supabase.from('profiles').select('id, full_name').in('id', approverIds)
              : Promise.resolve({ data: [] as any[] }),
            supabase.from('delivery_requests').select('id, sales_order_id, sales_order_headers!inner(sales_order_number)').in('id', resolvedDeliveryIds),
          ]);

          const resolvedSoMap: Record<string, string> = {};
          resolvedDeliveryReqs?.forEach((dr: any) => {
            resolvedSoMap[dr.id] = dr.sales_order_headers?.sales_order_number || '';
          });

          filteredResolved.forEach((req: any) => {
            const approverName = approverProfiles?.find((p: any) => p.id === req.approved_by)?.full_name || 'Unknown';
            const isApproved = req.approval_status === 'approved';
            const approvedAt = req.approved_at ? new Date(req.approved_at) : new Date(req.created_at);
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            if (approvedAt < sevenDaysAgo) return;

            const resolvedSoNumber = resolvedSoMap[req.delivery_request_id] || '';
            const resolvedSoLabel = resolvedSoNumber ? ` [${resolvedSoNumber}]` : '';

            notifs.push({
              id: `urgent_${req.approval_status}_${req.id}`,
              type: isApproved ? 'urgent_approved' : 'urgent_rejected',
              title: isApproved ? `✅ Urgent/Cito Disetujui${resolvedSoLabel}` : `❌ Urgent/Cito Ditolak${resolvedSoLabel}`,
              message: isApproved
                ? `Disetujui oleh ${approverName}`
                : `Ditolak oleh ${approverName}${req.rejected_reason ? `: ${req.rejected_reason}` : ''}`,
              module: 'delivery',
              refId: req.delivery_request_id,
              refNo: resolvedSoNumber,
              createdAt: approvedAt,
              read: false,
            });
          });
        }
      }

      // Fetch recent card comments (last 7 days) on cards the user is involved in
      if (user?.id) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Show card comments in bell for all Kanban-related roles (matches push notification scope).
        // Fallback to "involved cards only" for other roles (e.g. viewer).
        const KANBAN_ROLES = ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales'];
        const isKanbanRole = !!user.role && KANBAN_ROLES.includes(user.role);

        let involvedIds = new Set<string>();
        if (!isKanbanRole) {
          const [{ data: ownedCards }, { data: commentedCards }] = await Promise.all([
            supabase
              .from('delivery_requests')
              .select('id')
              .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`),
            supabase
              .from('delivery_comments')
              .select('delivery_request_id')
              .eq('user_id', user.id)
              .gte('created_at', sevenDaysAgo.toISOString()),
          ]);
          involvedIds = new Set<string>([
            ...(ownedCards || []).map((c: any) => c.id),
            ...(commentedCards || []).map((c: any) => c.delivery_request_id),
          ]);
        }
        // Refresh involvement cache for realtime fast-path (used as hint, not gate, for kanban roles)
        involvedCardIdsRef.current = involvedIds;

        {
          // Selalu ambil komentar terbaru tanpa filter keterlibatan supaya
          // mention (@user) tetap terdeteksi walau user belum pernah terlibat
          // di kartu tersebut. Komentar biasa difilter di bawah.
          const q = supabase
            .from('delivery_comments')
            .select('id, delivery_request_id, user_id, message, created_at, type')
            .eq('type', 'comment')
            .neq('user_id', user.id)
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(50);
          const { data: recentComments } = await q;

          if (recentComments && recentComments.length > 0) {
            const senderIds = [...new Set(recentComments.map((c: any) => c.user_id))];
            const drIds = [...new Set(recentComments.map((c: any) => c.delivery_request_id))];
            const [{ data: senderProfiles }, { data: drList }] = await Promise.all([
              supabase.from('profiles').select('id, full_name').in('id', senderIds),
              supabase
                .from('delivery_requests')
                .select('id, sales_order_id, sales_order_headers!inner(sales_order_number)')
                .in('id', drIds),
            ]);

            const drSoMap: Record<string, string> = {};
            drList?.forEach((dr: any) => {
              drSoMap[dr.id] = dr.sales_order_headers?.sales_order_number || '';
            });
            // Merge into ref cache for realtime toast labels
            cardSoMapRef.current = { ...cardSoMapRef.current, ...drSoMap };

            // Group comments per card; one notification entry per card with count
            const readSet = readCommentIdsRef.current;
            const groups = new Map<string, any[]>();
            for (const c of recentComments as any[]) {
              if (readSet.has(c.id)) continue; // skip already-acknowledged
              // Mention → notifikasi prioritas terpisah (selalu tampil walau
              // user belum pernah terlibat di kartu ini)
              if (messageMentionsUser(c.message, user.name, (user as any).email)) {
                const soNumberM = drSoMap[c.delivery_request_id] || '';
                const senderNameM =
                  senderProfiles?.find((p: any) => p.id === c.user_id)?.full_name || 'Seseorang';
                notifs.push({
                  id: `mention_delivery_${c.id}`,
                  type: 'mention',
                  title: `🔔 Anda di-mention${soNumberM ? ` [${soNumberM}]` : ''}`,
                  message: `${senderNameM}: ${c.message.substring(0, 100)}`,
                  module: 'delivery',
                  refId: c.delivery_request_id,
                  refNo: soNumberM,
                  createdAt: new Date(c.created_at),
                  read: false,
                  commentIds: [c.id],
                });
                continue;
              }
              // Komentar biasa hanya untuk role kanban / user yang terlibat
              if (!isKanbanRole && !involvedIds.has(c.delivery_request_id)) continue;
              const arr = groups.get(c.delivery_request_id) || [];
              arr.push(c);
              groups.set(c.delivery_request_id, arr);
            }

            groups.forEach((cs, drId) => {
              // cs sorted desc by created_at (already from query)
              const latest = cs[0];
              const soNumber = drSoMap[drId] || '';
              const soLabel = soNumber ? ` [${soNumber}]` : '';
              const senderName = senderProfiles?.find((p: any) => p.id === latest.user_id)?.full_name || 'Seseorang';
              const preview = latest.message.length > 100
                ? `${latest.message.substring(0, 100)}...`
                : latest.message;
              const countLabel = cs.length > 1 ? ` (${cs.length} komentar)` : '';
              notifs.push({
                id: `card_comment_${drId}`,
                type: 'card_comment',
                title: `💬 Komentar baru${soLabel}${countLabel}`,
                message: `${senderName}: ${preview}`,
                module: 'delivery',
                refId: drId,
                refNo: soNumber,
                createdAt: new Date(latest.created_at),
                read: false,
                commentIds: cs.map((x: any) => x.id),
                count: cs.length,
              });
            });
          }
        }
      }

      // ── Delivery board: aktivitas checklist & perpindahan kolom ──
      try {
        if (user?.id) {
          const sevenDaysAgoDel = new Date();
          sevenDaysAgoDel.setDate(sevenDaysAgoDel.getDate() - 7);
          const sinceDel = sevenDaysAgoDel.toISOString();

          const [{ data: delChecks }, { data: delMoves }] = await Promise.all([
            (supabase as any)
              .from('delivery_checklists')
              .select('id, delivery_request_id, label, is_checked, checked_by, checked_at')
              .eq('is_checked', true)
              .gte('checked_at', sinceDel)
              .order('checked_at', { ascending: false })
              .limit(50),
            (supabase as any)
              .from('delivery_requests')
              .select('id, sales_order_id, board_status, moved_by, moved_at')
              .not('moved_at', 'is', null)
              .gte('moved_at', sinceDel)
              .order('moved_at', { ascending: false })
              .limit(50),
          ]);

          const drIdsAct = Array.from(
            new Set([
              ...((delChecks || []) as any[]).map((c) => c.delivery_request_id),
              ...((delMoves || []) as any[]).map((c) => c.id),
            ].filter(Boolean)),
          );

          if (drIdsAct.length) {
            const actorIds = Array.from(
              new Set([
                ...((delChecks || []) as any[]).map((c) => c.checked_by),
                ...((delMoves || []) as any[]).map((c) => c.moved_by),
              ].filter(Boolean)),
            );
            const [{ data: drRows }, { data: actors }] = await Promise.all([
              (supabase as any)
                .from('delivery_requests')
                .select('id, sales_order_headers!inner(sales_order_number)')
                .in('id', drIdsAct),
              actorIds.length
                ? (supabase as any).from('profiles').select('id, full_name, email').in('id', actorIds)
                : Promise.resolve({ data: [] as any[] }),
            ]);

            const drRefMap: Record<string, string> = {};
            ((drRows || []) as any[]).forEach((d) => {
              drRefMap[d.id] = d.sales_order_headers?.sales_order_number || '';
            });
            cardSoMapRef.current = { ...cardSoMapRef.current, ...drRefMap };
            const actorMap: Record<string, string> = {};
            ((actors || []) as any[]).forEach((p) => {
              actorMap[p.id] = p.full_name || p.email || 'Pengguna';
            });

            ((delChecks || []) as any[]).forEach((c) => {
              if (c.checked_by === user.id) return;
              const refNo = drRefMap[c.delivery_request_id] || '';
              notifs.push({
                id: `delivery_checklist_${c.id}_${c.checked_at}`,
                type: 'calibration_event',
                title: `✅ Checklist Delivery${refNo ? ` [${refNo}]` : ''}`,
                message: `"${c.label}" diselesaikan oleh ${
                  c.checked_by ? actorMap[c.checked_by] || 'Pengguna' : 'Sistem'
                }`,
                module: 'delivery',
                refId: c.delivery_request_id,
                refNo,
                createdAt: new Date(c.checked_at),
                read: false,
              });
            });

            ((delMoves || []) as any[]).forEach((d) => {
              if (d.moved_by === user.id) return;
              const refNo = drRefMap[d.id] || '';
              const colLabel = DELIVERY_COLUMN_LABELS[d.board_status] || String(d.board_status).replace(/_/g, ' ');
              notifs.push({
                id: `delivery_move_${d.id}_${d.moved_at}`,
                type: 'calibration_event',
                title: `🚚 Kartu pindah kolom${refNo ? ` [${refNo}]` : ''}`,
                message: `Dipindahkan ke "${colLabel}" oleh ${
                  d.moved_by ? actorMap[d.moved_by] || 'Pengguna' : 'Sistem'
                }`,
                module: 'delivery',
                refId: d.id,
                refNo,
                createdAt: new Date(d.moved_at),
                read: false,
              });
            });
          }
        }
      } catch (delErr) {
        console.error('Error building delivery board activity notifications:', delErr);
      }

      // ── Calibration tracker: cards awaiting THIS user's checklist action ──
      // Applies to the stages Scheduled → Instrument Received → Calibration In
      // Progress → Completed. Only shown to super_admin and users registered as
      // "Petugas Kalibrasi" in Settings.
      try {
        if (user?.id) {
          const { data: checkerSetting } = await (supabase as any)
            .from('settings')
            .select('value')
            .eq('key', 'calibration_checklist_users')
            .maybeSingle();
          const checkerIds: string[] = Array.isArray(checkerSetting?.value)
            ? (checkerSetting!.value as string[])
            : [];
          const isCalibrationChecker =
            user.role === 'super_admin' || checkerIds.includes(user.id);

          {
            const { data: calCards } = await (supabase as any)
              .from('sales_order_headers')
              .select('id, sales_order_number, spk_number, status, customer:customers(name)')
              .eq('order_type', 'calibration')
              .eq('is_deleted', false)
              .neq('status', 'cancelled')
              .order('created_at', { ascending: false })
              .limit(200);

            const cardIds = (calCards || []).map((c: any) => c.id);
            let checklistByCard: Record<string, KalibrasiV2Checklist[]> = {};
            if (cardIds.length) {
              const { data: calChecks } = await (supabase as any)
                .from('calibration_tracker_checklists')
                .select('id, sales_order_id, checklist_key, is_checked, checked_by, checked_at')
                .in('sales_order_id', cardIds);
              (calChecks || []).forEach((c: any) => {
                (checklistByCard[c.sales_order_id] ||= []).push(c);
              });
            }

            // Resolve actor names for transition events.
            const actorIds = Array.from(
              new Set(
                Object.values(checklistByCard)
                  .flat()
                  .filter((c) => c.is_checked && (c as any).checked_by)
                  .map((c) => (c as any).checked_by as string),
              ),
            );
            let actorNames: Record<string, string> = {};
            if (actorIds.length) {
              const { data: actors } = await (supabase as any)
                .from('profiles')
                .select('id, full_name, email')
                .in('id', actorIds);
              (actors || []).forEach((a: any) => {
                actorNames[a.id] = a.full_name || a.email || 'Pengguna';
              });
            }

            // ── Stage transition events (visible to all users) ──
            // Emitted whenever a card advances through the important stages:
            // Scheduled → Instrument Received → Calibration In Progress →
            // Completed → Delivered. Deep-links straight to the card.
            const EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            (calCards || []).forEach((card: any) => {
              const list = checklistByCard[card.id] || [];
              const refNo = card.spk_number || card.sales_order_number;
              const customer = card.customer?.name ? ` • ${card.customer.name}` : '';

              list
                .filter((c: any) => c.is_checked && c.checked_at)
                .filter((c: any) => now - new Date(c.checked_at).getTime() <= EVENT_WINDOW_MS)
                .forEach((c: any) => {
                  const label = KALIBRASI_CHECKLIST_LABELS[c.checklist_key] || c.checklist_key;
                  const nextColumn = computeKalibrasiColumn(
                    list.filter((x: any) =>
                      x.is_checked && x.checked_at
                        ? new Date(x.checked_at).getTime() <= new Date(c.checked_at).getTime()
                        : false,
                    ),
                    card.status,
                  );
                  const colLabel =
                    COLUMN_DEFS.find((col) => col.id === nextColumn)?.label || nextColumn;
                  const actor = c.checked_by ? actorNames[c.checked_by] || 'Pengguna' : 'Sistem';
                  notifs.push({
                    id: `calibration_event_${c.id}`,
                    type: 'calibration_event',
                    title: `🔄 ${label} — ${colLabel}`,
                    message: `${refNo}${customer}: ${label} diselesaikan oleh ${actor}`,
                    module: 'calibration',
                    refId: card.id,
                    refNo,
                    createdAt: new Date(c.checked_at),
                    read: false,
                  });
                });
            });

            if (isCalibrationChecker) (calCards || []).forEach((card: any) => {
              const list = checklistByCard[card.id] || [];
              const column = computeKalibrasiColumn(list, card.status);
              if (column === 'rejected' || column === 'delivered') return;

              const pending = (COLUMN_CHECKLISTS[column] || []).filter(
                (item) =>
                  CALIBRATION_STAGE_CHECKLIST_KEYS.has(item.key) &&
                  !list.some((c) => c.checklist_key === item.key && c.is_checked),
              );
              if (!pending.length) return;

              const colLabel =
                COLUMN_DEFS.find((c) => c.id === column)?.label || column;
              const latestAt = list
                .filter((c) => c.is_checked && c.checked_at)
                .reduce<string | null>(
                  (m, c) => (!m || (c.checked_at as string) > m ? (c.checked_at as string) : m),
                  null,
                );
              const refNo = card.spk_number || card.sales_order_number;

              notifs.push({
                id: `calibration_action_${card.id}_${column}`,
                type: 'calibration_action',
                title: `🧪 Checklist kalibrasi menunggu — ${colLabel}`,
                message: `${refNo}${card.customer?.name ? ` • ${card.customer.name}` : ''}: ${pending
                  .map((p) => p.label)
                  .join(', ')}`,
                module: 'calibration',
                refId: card.id,
                refNo,
                createdAt: latestAt ? new Date(latestAt) : new Date(),
                read: false,
              });
            });
          }
        }
      } catch (calErr) {
        console.error('Error building calibration checklist notifications:', calErr);
      }

      // ── Calibration card comments (chat) & document events ──
      try {
        if (user?.id) {
          const sevenDaysAgoCal = new Date();
          sevenDaysAgoCal.setDate(sevenDaysAgoCal.getDate() - 7);
          const sinceIso = sevenDaysAgoCal.toISOString();

          const [{ data: calComments }, { data: docLogs }, { data: revokedItems }] = await Promise.all([
            (supabase as any)
              .from('calibration_tracker_comments')
              .select('id, sales_order_id, user_id, message, created_at, type')
              .eq('type', 'comment')
              .neq('user_id', user.id)
              .gte('created_at', sinceIso)
              .order('created_at', { ascending: false })
              .limit(50),
            (supabase as any)
              .from('calibration_document_logs')
              .select('id, sales_order_id, document_type, document_number, generated_by, generated_by_email, created_at')
              .gte('created_at', sinceIso)
              .order('created_at', { ascending: false })
              .limit(50),
            (supabase as any)
              .from('sales_order_items')
              .select('id, sales_order_id, instrument_name, certificate_number, certificate_revoked_at, certificate_revoked_reason')
              .not('certificate_revoked_at', 'is', null)
              .gte('certificate_revoked_at', sinceIso)
              .order('certificate_revoked_at', { ascending: false })
              .limit(50),
          ]);

          const soIds = Array.from(
            new Set([
              ...((calComments || []) as any[]).map((c) => c.sales_order_id),
              ...((docLogs || []) as any[]).map((d) => d.sales_order_id),
              ...((revokedItems || []) as any[]).map((r) => r.sales_order_id),
            ].filter(Boolean)),
          );

          if (soIds.length) {
            const senderIds = Array.from(
              new Set(((calComments || []) as any[]).map((c) => c.user_id).filter(Boolean)),
            );
            const [{ data: calSoList }, { data: calSenders }] = await Promise.all([
              (supabase as any)
                .from('sales_order_headers')
                .select('id, sales_order_number, spk_number')
                .in('id', soIds),
              senderIds.length
                ? (supabase as any).from('profiles').select('id, full_name, email').in('id', senderIds)
                : Promise.resolve({ data: [] as any[] }),
            ]);

            const calRefMap: Record<string, string> = {};
            ((calSoList || []) as any[]).forEach((s) => {
              calRefMap[s.id] = s.spk_number || s.sales_order_number || '';
            });
            const senderMap: Record<string, string> = {};
            ((calSenders || []) as any[]).forEach((p) => {
              senderMap[p.id] = p.full_name || p.email || 'Seseorang';
            });

            // Group comments per calibration card
            const readSetCal = readCommentIdsRef.current;
            const calGroups = new Map<string, any[]>();
            ((calComments || []) as any[]).forEach((c) => {
              if (readSetCal.has(c.id)) return;
              if (messageMentionsUser(c.message, user.name, (user as any).email)) {
                const refNoM = calRefMap[c.sales_order_id] || '';
                notifs.push({
                  id: `mention_calibration_${c.id}`,
                  type: 'mention',
                  title: `🔔 Anda di-mention${refNoM ? ` [${refNoM}]` : ''}`,
                  message: `${senderMap[c.user_id] || 'Seseorang'}: ${c.message.substring(0, 100)}`,
                  module: 'calibration',
                  refId: c.sales_order_id,
                  refNo: refNoM,
                  createdAt: new Date(c.created_at),
                  read: false,
                  commentIds: [c.id],
                });
                return;
              }
              const arr = calGroups.get(c.sales_order_id) || [];
              arr.push(c);
              calGroups.set(c.sales_order_id, arr);
            });
            calGroups.forEach((cs, soId) => {
              const latest = cs[0];
              const refNo = calRefMap[soId] || '';
              const soLabel = refNo ? ` [${refNo}]` : '';
              const senderName = senderMap[latest.user_id] || 'Seseorang';
              const preview =
                latest.message.length > 100 ? `${latest.message.substring(0, 100)}...` : latest.message;
              const countLabel = cs.length > 1 ? ` (${cs.length} komentar)` : '';
              notifs.push({
                id: `card_comment_cal_${soId}`,
                type: 'card_comment',
                title: `💬 Komentar kalibrasi${soLabel}${countLabel}`,
                message: `${senderName}: ${preview}`,
                module: 'calibration',
                refId: soId,
                refNo,
                createdAt: new Date(latest.created_at),
                read: false,
                commentIds: cs.map((x: any) => x.id),
                count: cs.length,
              });
            });

            // Document generation / upload events
            ((docLogs || []) as any[]).forEach((d) => {
              const refNo = calRefMap[d.sales_order_id] || d.document_number || '';
              const by = d.generated_by_email || 'Sistem';
              notifs.push({
                id: `calibration_doc_${d.id}`,
                type: 'calibration_event',
                title: `📄 Dokumen ${d.document_type}${refNo ? ` — ${refNo}` : ''}`,
                message: `${d.document_number ? `${d.document_number} • ` : ''}dibuat oleh ${by}`,
                module: 'calibration',
                refId: d.sales_order_id,
                refNo,
                createdAt: new Date(d.created_at),
                read: false,
              });
            });

            // Certificate revocation events
            ((revokedItems || []) as any[]).forEach((r) => {
              const refNo = calRefMap[r.sales_order_id] || r.certificate_number || '';
              notifs.push({
                id: `calibration_revoked_${r.id}`,
                type: 'calibration_event',
                title: `🚫 Sertifikat dicabut${r.certificate_number ? ` — ${r.certificate_number}` : ''}`,
                message: `${r.instrument_name || 'Instrumen'}${
                  r.certificate_revoked_reason ? `: ${r.certificate_revoked_reason}` : ''
                }`,
                module: 'calibration',
                refId: r.sales_order_id,
                refNo,
                createdAt: new Date(r.certificate_revoked_at),
                read: false,
              });
            });
          }
        }
      } catch (calCommentErr) {
        console.error('Error building calibration comment/document notifications:', calCommentErr);
      }

      // ── Tracker PO: komentar kartu, mention, & aktivitas checklist ──
      try {
        if (user?.id) {
          const sevenDaysAgoPo = new Date();
          sevenDaysAgoPo.setDate(sevenDaysAgoPo.getDate() - 7);
          const sincePo = sevenDaysAgoPo.toISOString();

          const [{ data: poComments }, { data: poChecks }] = await Promise.all([
            (supabase as any)
              .from('po_tracker_comments')
              .select('id, plan_order_id, user_id, message, created_at, type')
              .eq('type', 'comment')
              .neq('user_id', user.id)
              .gte('created_at', sincePo)
              .order('created_at', { ascending: false })
              .limit(50),
            (supabase as any)
              .from('po_tracker_checklists')
              .select('id, plan_order_id, checklist_key, is_checked, checked_by, checked_at')
              .eq('is_checked', true)
              .gte('checked_at', sincePo)
              .order('checked_at', { ascending: false })
              .limit(50),
          ]);

          const poIds = Array.from(
            new Set(
              [
                ...((poComments || []) as any[]).map((c) => c.plan_order_id),
                ...((poChecks || []) as any[]).map((c) => c.plan_order_id),
              ].filter(Boolean),
            ),
          );

          if (poIds.length) {
            const poActorIds = Array.from(
              new Set(
                [
                  ...((poComments || []) as any[]).map((c) => c.user_id),
                  ...((poChecks || []) as any[]).map((c) => c.checked_by),
                ].filter(Boolean),
              ),
            );
            const [{ data: poList }, { data: poActors }] = await Promise.all([
              (supabase as any)
                .from('plan_order_headers')
                .select('id, plan_number, suppliers(name)')
                .in('id', poIds),
              poActorIds.length
                ? (supabase as any).from('profiles').select('id, full_name, email').in('id', poActorIds)
                : Promise.resolve({ data: [] as any[] }),
            ]);

            const poRefMap: Record<string, string> = {};
            const poSupplierMap: Record<string, string> = {};
            ((poList || []) as any[]).forEach((p) => {
              poRefMap[p.id] = p.plan_number || '';
              poSupplierMap[p.id] = p.suppliers?.name || '';
            });
            const poActorMap: Record<string, string> = {};
            ((poActors || []) as any[]).forEach((p) => {
              poActorMap[p.id] = p.full_name || p.email || 'Pengguna';
            });

            const readSetPo = readCommentIdsRef.current;
            const poGroups = new Map<string, any[]>();
            ((poComments || []) as any[]).forEach((c) => {
              if (readSetPo.has(c.id)) return;
              const refNoM = poRefMap[c.plan_order_id] || '';
              if (messageMentionsUser(c.message, user.name, (user as any).email)) {
                notifs.push({
                  id: `mention_po_${c.id}`,
                  type: 'mention',
                  title: `🔔 Anda di-mention${refNoM ? ` [${refNoM}]` : ''}`,
                  message: `${poActorMap[c.user_id] || 'Seseorang'}: ${c.message.substring(0, 100)}`,
                  module: 'plan_order_tracker',
                  refId: c.plan_order_id,
                  refNo: refNoM,
                  createdAt: new Date(c.created_at),
                  read: false,
                  commentIds: [c.id],
                });
                return;
              }
              const arr = poGroups.get(c.plan_order_id) || [];
              arr.push(c);
              poGroups.set(c.plan_order_id, arr);
            });

            poGroups.forEach((cs, poId) => {
              const latest = cs[0];
              const refNo = poRefMap[poId] || '';
              const preview =
                latest.message.length > 100 ? `${latest.message.substring(0, 100)}...` : latest.message;
              notifs.push({
                id: `card_comment_po_${poId}`,
                type: 'card_comment',
                title: `💬 Komentar Tracker PO${refNo ? ` [${refNo}]` : ''}${cs.length > 1 ? ` (${cs.length} komentar)` : ''}`,
                message: `${poActorMap[latest.user_id] || 'Seseorang'}: ${preview}`,
                module: 'plan_order_tracker',
                refId: poId,
                refNo,
                createdAt: new Date(latest.created_at),
                read: false,
                commentIds: cs.map((x: any) => x.id),
                count: cs.length,
              });
            });

            // Aktivitas checklist board PO (perpindahan tahap)
            ((poChecks || []) as any[]).forEach((c) => {
              if (c.checked_by === user.id) return;
              const refNo = poRefMap[c.plan_order_id] || '';
              const supplier = poSupplierMap[c.plan_order_id]
                ? ` • ${poSupplierMap[c.plan_order_id]}`
                : '';
              const label = String(c.checklist_key).replace(/_/g, ' ');
              notifs.push({
                id: `po_checklist_${c.id}_${c.checked_at}`,
                type: 'calibration_event',
                title: `🔄 Tracker PO — ${label}`,
                message: `${refNo}${supplier}: ${label} diselesaikan oleh ${
                  c.checked_by ? poActorMap[c.checked_by] || 'Pengguna' : 'Sistem'
                }`,
                module: 'plan_order_tracker',
                refId: c.plan_order_id,
                refNo,
                createdAt: new Date(c.checked_at),
                read: false,
              });
            });
          }
        }
      } catch (poErr) {
        console.error('Error building tracker PO notifications:', poErr);
      }

      // Sort by priority and date
      notifs.sort((a, b) => {
        const priority: Record<string, number> = { 
          expired: 0, 
          mention: 0.5,
          urgent_request: 1,
          urgent_rejected: 2,
          urgent_approved: 3,
          revision_requested: 4,
          approval_pending: 5, 
          calibration_action: 5.5,
          calibration_event: 5.7,
          expiring_soon: 6, 
          low_stock: 7, 
          new_order: 8,
          card_comment: 9,
          approved: 10,
          cancelled: 11,
          info: 12 
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
        const hasCritical = newNotifs.some(n => n.type === 'expired' || n.type === 'low_stock' || n.type === 'urgent_request' || n.type === 'urgent_rejected' || n.type === 'mention');
        const hasWarning = newNotifs.some(n => n.type === 'expiring_soon' || n.type === 'approval_pending' || n.type === 'revision_requested' || n.type === 'urgent_approved' || n.type === 'calibration_action' || n.type === 'calibration_event');

        // In-app toast for mentions + newly actionable cards & stage transitions
        newNotifs
          .filter(n => n.type === 'mention')
          .slice(0, 3)
          .forEach(n => {
            toast.warning(n.title, {
              description: n.message,
              duration: 10000,
              action: {
                label: '🔔 Buka Kartu',
                onClick: () => {
                  n.commentIds?.forEach(cid => readCommentIdsRef.current.add(cid));
                  saveReadCommentIds(readCommentIdsRef.current);
                  window.location.href = buildNotificationDeepLink(n);
                },
              },
            });
          });

        newNotifs
          .filter(n => n.type === 'calibration_action' || n.type === 'calibration_event')
          .slice(0, 3)
          .forEach(n => {
            toast.info(n.title, {
              description: n.message,
              action: {
                label: '🧪 Buka Kartu',
                onClick: () => { window.location.href = buildNotificationDeepLink(n); },
              },
            });
          });
        
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
            if (n.type === 'expired' || n.type === 'low_stock' || n.type === 'approval_pending' || n.type === 'revision_requested' || n.type === 'urgent_request' || n.type === 'urgent_approved' || n.type === 'urgent_rejected' || n.type === 'calibration_action' || n.type === 'calibration_event' || n.type === 'mention' || n.type === 'card_comment') {
              const icon = n.type === 'urgent_request' || n.type === 'urgent_rejected' ? '🚨' : n.type === 'urgent_approved' ? '✅' : n.type === 'expired' ? '🚨' : n.type === 'low_stock' ? '⚠️' : n.type === 'revision_requested' ? '📝' : n.type === 'card_comment' ? '💬' : '🔔';
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
      // Audit trail: record every notification surfaced to this user.
      if (newNotifs.length > 0) {
        void logNotificationAudit('notification_sent', newNotifs);
      }
      // Apply persisted "auto-read" keys (type:refId / type:productId) so that
      // notifications for records the user has already opened stay marked read.
      const readKeys = readNotifKeysRef.current;
      const finalNotifs = notifs.map(n => {
        const key = notifKey(n);
        if (key && readKeys.has(key)) return { ...n, read: true };
        return n;
      });
      setNotifications(finalNotifs);
      const newUnreadCount = finalNotifs.filter(n => !n.read).length;
      setUnreadCount(newUnreadCount);
      setBadgeCount(newUnreadCount);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
    setLoading(false);
  }, [soundEnabled, pushEnabled, user?.role, user?.id]);

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
    // Also show toast pop-up when sales' request is approved/rejected
    const deliveryCommentsChannel = supabase
      .channel('delivery-comments-urgent')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'delivery_comments' },
        async (payload) => {
          const updated = payload.new as any;
          // Show toast to the requester when their request is approved/rejected
          if (
            updated.approval_status && 
            ['approved', 'rejected'].includes(updated.approval_status) &&
            updated.user_id === user?.id
          ) {
            // Fetch approver name
            let approverName = 'Unknown';
            if (updated.approved_by) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', updated.approved_by)
                .single();
              approverName = profile?.full_name || 'Unknown';
            }

            const deliveryRequestId = updated.delivery_request_id;
            const toastAction = {
              label: '📋 Lihat Kartu',
              onClick: () => {
                window.location.href = buildNotificationDeepLink({
                  id: '',
                  type: updated.approval_status === 'approved' ? 'urgent_approved' : 'urgent_rejected',
                  title: '',
                  message: '',
                  module: 'delivery',
                  refId: deliveryRequestId,
                  createdAt: new Date(),
                  read: false,
                });
              },
            };

            if (updated.approval_status === 'approved') {
              toast.success('✅ Permintaan Urgent/Cito Disetujui', {
                description: `Disetujui oleh ${approverName}`,
                duration: 8000,
                action: toastAction,
              });
              if (soundEnabled) playNotificationSound('info');
            } else {
              toast.error('❌ Permintaan Urgent/Cito Ditolak', {
                description: `Ditolak oleh ${approverName}${updated.rejected_reason ? `: ${updated.rejected_reason}` : ''}`,
                duration: 10000,
                action: toastAction,
              });
              if (soundEnabled) playNotificationSound('critical');
            }
          }
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'delivery_comments' },
        async (payload) => {
          const inserted = payload.new as any;
          if (!user?.id || !inserted?.user_id) {
            return;
          }
          // Self-commented: just add this card to involvement cache. No toast, no refetch.
          if (inserted.user_id === user.id) {
            involvedCardIdsRef.current.add(inserted.delivery_request_id);
            return;
          }
          // Only handle real comments (not label requests etc.)
          if (inserted.type !== 'comment') return;

          const KANBAN_ROLES = ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales'];
          const isKanbanRole = !!user.role && KANBAN_ROLES.includes(user.role);

          // Mention selalu diprioritaskan, tanpa syarat keterlibatan kartu.
          const isMention = messageMentionsUser(inserted.message, user.name, (user as any).email);

          // Fast-path: use cached involvement set – avoids extra queries on every INSERT.
          let isInvolved = isMention || isKanbanRole || involvedCardIdsRef.current.has(inserted.delivery_request_id);
          let soNumber = cardSoMapRef.current[inserted.delivery_request_id] || '';

          // Slow-path only if we don't know this card yet
          if (!isInvolved) {
            const { data: dr } = await supabase
              .from('delivery_requests')
              .select('id, created_by, assigned_to, sales_order_headers!inner(sales_order_number)')
              .eq('id', inserted.delivery_request_id)
              .maybeSingle();
            if (dr?.created_by === user.id || dr?.assigned_to === user.id) {
              isInvolved = true;
              involvedCardIdsRef.current.add(inserted.delivery_request_id);
            }
            const so = (dr as any)?.sales_order_headers?.sales_order_number || '';
            if (so) {
              soNumber = so;
              cardSoMapRef.current[inserted.delivery_request_id] = so;
            }
          }

          if (isInvolved) {
            const { data: sender } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', inserted.user_id)
              .maybeSingle();
            const senderName = sender?.full_name || 'Seseorang';
            const soLabel = soNumber ? ` [${soNumber}]` : '';
            const preview = inserted.message?.length > 80
              ? `${inserted.message.substring(0, 80)}...`
              : (inserted.message || '');
            toast.info(`${isMention ? '🔔 Anda di-mention' : '💬 Komentar baru'}${soLabel}`, {
              description: `${senderName}: ${preview}`,
              duration: isMention ? 12000 : 7000,
              action: {
                label: '📋 Lihat Kartu',
                onClick: () => {
                  // Mark this comment as acknowledged so it won't show in bell list
                  readCommentIdsRef.current.add(inserted.id);
                  saveReadCommentIds(readCommentIdsRef.current);
                  window.location.href = buildNotificationDeepLink({
                    id: '',
                    type: isMention ? 'mention' : 'card_comment',
                    title: '',
                    message: '',
                    module: 'delivery',
                    refId: inserted.delivery_request_id,
                    createdAt: new Date(),
                    read: false,
                  });
                },
              },
            });
            if (soundEnabled) playNotificationSound(isMention ? 'critical' : 'info');
            // Refresh aggregated bell list (debounced via React state)
            fetchNotifications();
          }
        }
      )
      .subscribe();

    // Subscribe to calibration tracker checklist changes → recompute which
    // cards now await this user's checklist action.
    const calibrationChecklistChannel = supabase
      .channel('calibration-checklist-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calibration_tracker_checklists' },
        () => { fetchNotifications(); }
      )
      .subscribe();

    // Subscribe to calibration card comments & document logs → surface new
    // comments / generated documents in the bell immediately.
    const calibrationActivityChannel = supabase
      .channel('calibration-activity-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calibration_tracker_comments' },
        () => { fetchNotifications(); }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calibration_document_logs' },
        () => { fetchNotifications(); }
      )
      .subscribe();

    // Also keep the polling as fallback (every 5 minutes)
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);

    // Subscribe to Tracker PO board activity (komentar & checklist)
    const poTrackerChannel = supabase
      .channel('po-tracker-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'po_tracker_comments' },
        () => { fetchNotifications(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'po_tracker_checklists' },
        () => { fetchNotifications(); }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(planOrderChannel);
      supabase.removeChannel(salesOrderChannel);
      supabase.removeChannel(adjustmentChannel);
      supabase.removeChannel(batchChannel);
      supabase.removeChannel(stockInChannel);
      supabase.removeChannel(stockOutChannel);
      supabase.removeChannel(deliveryCommentsChannel);
      supabase.removeChannel(calibrationChecklistChannel);
      supabase.removeChannel(calibrationActivityChannel);
      supabase.removeChannel(poTrackerChannel);
    };
  }, [fetchNotifications]);

  // Auto-acknowledge: when the user opens a deep-linked target page
  // (?type=&id= or legacy ?card= / ?id= / ?productId=), mark all matching
  // notifications for that record as read automatically.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const explicitType = params.get('type') || '';
    const explicitId = params.get('id') || '';
    const cardId = params.get('card') || '';
    const productId = params.get('productId') || '';

    // Build candidate (type, id) pairs to acknowledge.
    // If `type` param is present, trust it. Otherwise infer from pathname.
    const candidates: Array<{ type: string; id: string }> = [];
    if (explicitType && explicitId) {
      candidates.push({ type: explicitType, id: explicitId });
    }

    const path = location.pathname;
    const matchAny = (id: string) => {
      if (!id) return;
      if (path.startsWith('/request-delivery')) {
        ['urgent_request', 'urgent_approved', 'urgent_rejected', 'card_comment', 'mention'].forEach(t =>
          candidates.push({ type: t, id })
        );
      } else if (path.startsWith('/tracker-po') || path.startsWith('/tracker-kalibrasi')) {
        ['card_comment', 'mention', 'calibration_action', 'calibration_event'].forEach(t =>
          candidates.push({ type: t, id })
        );
      } else if (path.startsWith('/plan-order') || path.startsWith('/sales-order') || path.startsWith('/stock-adjustment') || path.startsWith('/stock-in') || path.startsWith('/stock-out')) {
        ['approval_pending', 'revision_requested', 'approved', 'cancelled', 'new_order'].forEach(t =>
          candidates.push({ type: t, id })
        );
      } else if (path.startsWith('/data-stock')) {
        candidates.push({ type: 'low_stock', id });
      } else if (path.startsWith('/reports/expiry')) {
        ['expiring_soon', 'expired'].forEach(t => candidates.push({ type: t, id }));
      }
    };
    matchAny(cardId || explicitId);
    matchAny(productId || explicitId);

    if (candidates.length === 0) return;

    let changed = false;
    candidates.forEach(c => {
      const key = `${c.type}:${c.id}`;
      if (!readNotifKeysRef.current.has(key)) {
        readNotifKeysRef.current.add(key);
        changed = true;
      }
    });
    if (changed) saveReadNotifKeys(readNotifKeysRef.current);

    // Apply immediately to in-memory state and recompute counts.
    setNotifications(prev => {
      let touched = 0;
      const next = prev.map(n => {
        if (n.read) return n;
        const key = notifKey(n);
        if (key && readNotifKeysRef.current.has(key)) {
          touched++;
          // Audit trail: auto-read via deep-link navigation.
          void logNotificationAudit('notification_read', [n]);
          // Persist underlying comment ids for card_comment / urgent so realtime
          // refetch won't re-surface them.
          if ((n.type === 'card_comment' || n.type === 'mention') && n.commentIds?.length) {
            n.commentIds.forEach(cid => readCommentIdsRef.current.add(cid));
            saveReadCommentIds(readCommentIdsRef.current);
          }
          if (n.type === 'urgent_request' || n.type === 'urgent_approved' || n.type === 'urgent_rejected') {
            const cid = n.id.replace(/^urgent_(req|approved|rejected)_/, '');
            if (cid) {
              readCommentIdsRef.current.add(cid);
              saveReadCommentIds(readCommentIdsRef.current);
            }
          }
          return { ...n, read: true };
        }
        return n;
      });
      if (touched > 0) {
        setUnreadCount(c => {
          const nc = Math.max(0, c - touched);
          setBadgeCount(nc);
          return nc;
        });
      }
      return next;
    });
  }, [location.pathname, location.search]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => {
      if (n.id !== id) return n;
      // Audit trail: record that this user opened/acknowledged the notification.
      void logNotificationAudit('notification_read', [n]);
      // Persist underlying comment IDs so card_comment entries don't reappear
      if ((n.type === 'card_comment' || n.type === 'mention') && n.commentIds?.length) {
        n.commentIds.forEach(cid => readCommentIdsRef.current.add(cid));
        saveReadCommentIds(readCommentIdsRef.current);
      }
      // Persist urgent request/approval/rejection comment IDs so they auto-disappear
      if (n.type === 'urgent_request' || n.type === 'urgent_approved' || n.type === 'urgent_rejected') {
        const cid = n.id.replace(/^urgent_(req|approved|rejected)_/, '');
        if (cid) {
          readCommentIdsRef.current.add(cid);
          saveReadCommentIds(readCommentIdsRef.current);
        }
      }
      // Persist canonical key so the same notification stays read across refetches
      const key = notifKey(n);
      if (key) {
        readNotifKeysRef.current.add(key);
        saveReadNotifKeys(readNotifKeysRef.current);
      }
      return { ...n, read: true };
    }));
    setUnreadCount(prev => {
      const newCount = Math.max(0, prev - 1);
      setBadgeCount(newCount);
      return newCount;
    });
  };

  const markAllAsRead = () => {
    setNotifications(prev => {
      void logNotificationAudit('notification_read', prev.filter(n => !n.read));
      prev.forEach(n => {
        if ((n.type === 'card_comment' || n.type === 'mention') && n.commentIds?.length) {
          n.commentIds.forEach(cid => readCommentIdsRef.current.add(cid));
        }
        const key = notifKey(n);
        if (key) readNotifKeysRef.current.add(key);
      });
      saveReadCommentIds(readCommentIdsRef.current);
      saveReadNotifKeys(readNotifKeysRef.current);
      return prev.map(n => ({ ...n, read: true }));
    });
    setUnreadCount(0);
    setBadgeCount(0);
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
