import { supabase } from '@/integrations/supabase/client';

interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  targetRoles?: Array<"super_admin" | "admin" | "finance" | "purchasing" | "warehouse" | "sales" | "viewer">;
  excludeUserId?: string;
}

/**
 * Send push notification to users with specific roles (e.g., admin/super_admin)
 */
export async function sendApprovalPushNotification({
  title,
  body,
  data,
  targetRoles = ['super_admin', 'admin'] as any[],
  excludeUserId,
}: PushNotificationPayload): Promise<void> {
  try {
    const { data: roleUsers, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', targetRoles);

    if (roleError || !roleUsers?.length) return;

    const userIds = roleUsers
      .map((r) => r.user_id)
      .filter((id) => id !== excludeUserId);

    if (userIds.length === 0) return;

    await supabase.functions.invoke('send-push-notification', {
      body: {
        title,
        body,
        data: { ...data, tag: data?.tag || 'approval', requireInteraction: 'true' },
        user_ids: userIds,
      },
    });
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
}

/**
 * Send push notification directly to specific user IDs
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  excludeUserId?: string,
): Promise<void> {
  try {
    const filteredIds = userIds.filter((id) => id !== excludeUserId);
    if (filteredIds.length === 0) return;

    await supabase.functions.invoke('send-push-notification', {
      body: {
        title,
        body,
        data: { ...data, tag: data?.tag || 'general', requireInteraction: 'true' },
        user_ids: filteredIds,
      },
    });
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
}

// ===== K'talk Notifications =====

/** Notify mentioned users in K'talk */
export function notifyKtalkMention(
  mentionedUserIds: string[],
  senderName: string,
  messagePreview: string,
  excludeUserId?: string,
) {
  return sendPushToUsers(
    mentionedUserIds,
    `🔔 K'talk: ${senderName} menyebut Anda`,
    messagePreview.substring(0, 100),
    { tag: 'ktalk-mention', link: '/' },
    excludeUserId,
  );
}

// ===== Order Notifications =====

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

// ===== Approval Result Notifications =====

/** Notify creator that their order was approved */
export function notifyOrderApproved(
  creatorUserId: string,
  module: string,
  docNumber: string,
) {
  const link = module === 'Plan Order' ? '/plan-order' : module === 'Sales Order' ? '/sales-order' : '/stock-adjustment';
  return sendPushToUsers(
    [creatorUserId],
    `✅ ${module} Disetujui`,
    `${module} ${docNumber} telah disetujui`,
    { tag: `${module.toLowerCase().replace(' ', '-')}-approved`, link },
  );
}

/** Notify creator that their order was rejected */
export function notifyOrderRejected(
  creatorUserId: string,
  module: string,
  docNumber: string,
  reason?: string,
) {
  const link = module === 'Plan Order' ? '/plan-order' : module === 'Sales Order' ? '/sales-order' : '/stock-adjustment';
  const body = reason
    ? `${module} ${docNumber} ditolak: ${reason.substring(0, 80)}`
    : `${module} ${docNumber} ditolak`;
  return sendPushToUsers(
    [creatorUserId],
    `❌ ${module} Ditolak`,
    body,
    { tag: `${module.toLowerCase().replace(' ', '-')}-rejected`, link },
  );
}

// ===== Delivery Board Notifications =====

/** Notify relevant roles about delivery card status change */
export function notifyDeliveryCardMoved(
  soNumber: string,
  fromLabel: string,
  toLabel: string,
  excludeUserId?: string,
) {
  return sendApprovalPushNotification({
    title: '🚚 Delivery Board Update',
    body: `${soNumber} dipindahkan dari ${fromLabel} ke ${toLabel}`,
    data: { tag: 'delivery-board', link: '/request-delivery' },
    targetRoles: ['super_admin', 'admin', 'sales', 'warehouse'],
    excludeUserId,
  });
}

/** Notify when new card added to delivery board */
export function notifyNewDeliveryCard(
  soNumber: string,
  excludeUserId?: string,
) {
  return sendApprovalPushNotification({
    title: '📋 Card Delivery Baru',
    body: `${soNumber} telah ditambahkan ke Delivery Board`,
    data: { tag: 'delivery-new', link: '/request-delivery' },
    targetRoles: ['super_admin', 'admin', 'sales', 'warehouse'],
    excludeUserId,
  });
}
