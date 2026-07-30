import { supabase } from '@/integrations/supabase/client';

/**
 * Audit trail for in-app notifications.
 *
 * Every notification that is surfaced to a user ("sent") and every notification
 * the user opens/acknowledges ("read") is written to `audit_logs` so the
 * history (who, when, which card) is traceable.
 *
 * Dedupe is handled client-side via localStorage so a notification that keeps
 * being recomputed on every refetch is only logged once per user/session-store.
 */

const LOGGED_KEY = 'notif_audit_logged_v1';
const MAX_KEYS = 2000;

export type NotifAuditAction = 'notification_sent' | 'notification_read';

interface AuditableNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  module?: string;
  refId?: string;
  refNo?: string;
  productId?: string;
}

function loadLogged(): Set<string> {
  try {
    const raw = localStorage.getItem(LOGGED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveLogged(set: Set<string>) {
  try {
    localStorage.setItem(LOGGED_KEY, JSON.stringify(Array.from(set).slice(-MAX_KEYS)));
  } catch {
    /* ignore */
  }
}

const logged = loadLogged();

function refTableFor(module?: string): string | null {
  switch (module) {
    case 'calibration':
    case 'sales_order':
      return 'sales_order_headers';
    case 'plan_order':
      return 'plan_order_headers';
    case 'delivery':
      return 'delivery_requests';
    case 'stock_adjustment':
      return 'stock_adjustments';
    case 'stock_in':
      return 'stock_in_headers';
    case 'stock_out':
      return 'stock_out_headers';
    default:
      return null;
  }
}

/** Writes notification delivery/read events to the audit log (fire-and-forget). */
export async function logNotificationAudit(
  action: NotifAuditAction,
  notifs: AuditableNotification[],
) {
  if (!notifs.length) return;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;

    const rows: any[] = [];
    notifs.forEach((n) => {
      const dedupeKey = `${user.id}:${action}:${n.id}`;
      if (logged.has(dedupeKey)) return;
      logged.add(dedupeKey);
      rows.push({
        user_id: user.id,
        user_email: user.email ?? null,
        action,
        module: 'notifications',
        ref_table: refTableFor(n.module),
        ref_id: n.refId || n.productId || null,
        ref_no: n.refNo || null,
        new_data: {
          notification_id: n.id,
          notification_type: n.type,
          notification_module: n.module ?? null,
          title: n.title,
          message: n.message,
          at: new Date().toISOString(),
        },
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
    });

    if (!rows.length) return;
    saveLogged(logged);
    await (supabase as any).from('audit_logs').insert(rows);
  } catch (err) {
    console.error('Failed to write notification audit log:', err);
  }
}
