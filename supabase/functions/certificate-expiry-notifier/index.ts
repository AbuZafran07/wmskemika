import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const THRESHOLDS = [30, 7, 1];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: cron secret OR authenticated admin
    const cronSecret = Deno.env.get('CRON_SECRET');
    const incomingCron = req.headers.get('x-cron-secret');
    const isCron = !!cronSecret && incomingCron === cronSecret;
    if (!isCron) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const userClient = createClient(supabaseUrl, anonKey);
      const { data: userData, error: userErr } = await userClient.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', userData.user.id);
      const allowed = (roles || []).some((r: any) =>
        ['super_admin', 'admin'].includes(r.role),
      );
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const now = new Date();

    // Fetch active (non-revoked) issued certificates
    const { data: items, error: itemsErr } = await supabase
      .from('sales_order_items')
      .select(`
        id, sales_order_id, certificate_number, certificate_issued_at, certificate_validity_months,
        instrument_name, instrument_serial_number,
        header:sales_order_headers!inner(sales_order_number, sales_name, created_by, customer:customers(name))
      `)
      .eq('item_type', 'calibration')
      .not('certificate_number', 'is', null)
      .not('certificate_issued_at', 'is', null)
      .is('certificate_revoked_at', null);

    if (itemsErr) throw itemsErr;

    // Target user ids: admin, finance, super_admin
    const { data: roleUsers } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['super_admin', 'admin', 'finance']);
    const staffIds = Array.from(
      new Set((roleUsers || []).map((r: any) => r.user_id)),
    );

    // Pick a system sender for K'talk (first super_admin)
    const systemSenderId = (roleUsers || []).find((r: any) => r.role === 'super_admin')?.user_id
      || staffIds[0]
      || null;

    let pushed = 0;
    let chats = 0;
    let deduped = 0;

    for (const it of (items || []) as any[]) {
      const issued = new Date(it.certificate_issued_at);
      const expires = new Date(issued.getTime());
      const validityMonths = Number(it.certificate_validity_months ?? 12) === 6 ? 6 : 12;
      expires.setMonth(expires.getMonth() + validityMonths);
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / msPerDay);

      const threshold = THRESHOLDS.find((t) => daysLeft === t);
      if (!threshold) continue;

      // Dedup: try insert; skip on unique violation
      const { error: dedupErr } = await supabase
        .from('certificate_expiry_notifications')
        .insert({ item_id: it.id, threshold_days: threshold });
      if (dedupErr) {
        deduped++;
        continue;
      }

      const certNo = it.certificate_number as string;
      const instrName = it.instrument_name || 'Instrument';
      const customerName = it.header?.customer?.name || '-';
      const soNumber = it.header?.sales_order_number || '-';
      const emoji = threshold === 1 ? '🚨' : threshold === 7 ? '⚠️' : '⏰';
      const title = `${emoji} Sertifikat Kalibrasi akan expired ${threshold} hari lagi`;
      const body = `${certNo} · ${instrName} · ${customerName} (SO ${soNumber})`;

      // Union with sales creator
      const targetIds = new Set<string>(staffIds);
      if (it.header?.created_by) targetIds.add(it.header.created_by);

      // Push notification
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            title, body,
            user_ids: Array.from(targetIds),
            data: { tag: `cert-expiry-${it.id}-${threshold}`, link: '/arsip-sertifikat' },
          }),
        });
        const rj = await resp.json().catch(() => ({}));
        pushed += rj.sent || 0;
      } catch (e) {
        console.error('push error', e);
      }

      // K'talk global chat message
      if (systemSenderId) {
        const mentions = Array.from(targetIds);
        const { error: chatErr } = await supabase.from('chat_messages').insert({
          sender_id: systemSenderId,
          is_global: true,
          message: `${title}\n${body}\n\nSegera lakukan perpanjangan kalibrasi. Setelah tanggal expired, sertifikat tidak lagi valid saat di-scan QR.`,
          mentions,
        });
        if (!chatErr) chats++;
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        action: 'certificate_expiry_reminder',
        module: 'calibration',
        ref_table: 'sales_order_items',
        ref_id: it.id,
        ref_no: certNo,
        new_data: { threshold_days: threshold, days_left: daysLeft, expires_at: expires.toISOString() },
      });
    }

    return new Response(
      JSON.stringify({ success: true, checked: items?.length || 0, pushed, chats, deduped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('cert-expiry-notifier error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});