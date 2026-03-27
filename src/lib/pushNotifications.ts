import { supabase } from '@/integrations/supabase/client';

interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  targetRoles?: string[];
  excludeUserId?: string;
}

/**
 * Send push notification to users with specific roles (e.g., admin/super_admin)
 * Uses the send-push-notification edge function
 */
export async function sendApprovalPushNotification({
  title,
  body,
  data,
  targetRoles = ['super_admin', 'admin'],
  excludeUserId,
}: PushNotificationPayload): Promise<void> {
  try {
    // Get user IDs for target roles
    const { data: roleUsers, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', targetRoles);

    if (roleError || !roleUsers?.length) {
      console.log('No target users found for push notification');
      return;
    }

    const userIds = roleUsers
      .map((r) => r.user_id)
      .filter((id) => id !== excludeUserId);

    if (userIds.length === 0) return;

    await supabase.functions.invoke('send-push-notification', {
      body: {
        title,
        body,
        data: {
          ...data,
          tag: data?.tag || 'approval',
          requireInteraction: 'true',
        },
        user_ids: userIds,
      },
    });
  } catch (error) {
    // Don't block the main flow if push fails
    console.error('Failed to send push notification:', error);
  }
}

/** Notify admin/super_admin about new Plan Order */
export function notifyNewPlanOrder(planNumber: string, excludeUserId?: string) {
  return sendApprovalPushNotification({
    title: '📋 Plan Order Baru',
    body: `Plan Order ${planNumber} telah dibuat dan menunggu review`,
    data: { tag: 'plan-order', link: '/plan-order' },
    excludeUserId,
  });
}

/** Notify admin/super_admin about new Sales Order */
export function notifyNewSalesOrder(soNumber: string, excludeUserId?: string) {
  return sendApprovalPushNotification({
    title: '🛒 Sales Order Baru',
    body: `Sales Order ${soNumber} telah dibuat dan menunggu review`,
    data: { tag: 'sales-order', link: '/sales-order' },
    excludeUserId,
  });
}

/** Notify admin/super_admin about new Stock Adjustment */
export function notifyNewStockAdjustment(adjNumber: string, excludeUserId?: string) {
  return sendApprovalPushNotification({
    title: '📦 Penyesuaian Stok Baru',
    body: `Stock Adjustment ${adjNumber} menunggu persetujuan`,
    data: { tag: 'stock-adjustment', link: '/stock-adjustment' },
    excludeUserId,
  });
}

/** Notify about revision request */
export function notifyRevisionRequest(module: string, docNumber: string, excludeUserId?: string) {
  const link = module === 'Plan Order' ? '/plan-order' : '/sales-order';
  return sendApprovalPushNotification({
    title: '📝 Permintaan Revisi',
    body: `${module} ${docNumber} membutuhkan revisi`,
    data: { tag: 'revision-request', link },
    excludeUserId,
  });
}
