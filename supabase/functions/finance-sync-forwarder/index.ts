import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Endpoint & secret yang sama dipakai oleh supabase/functions/arap-sync
// untuk sinkronisasi AR/AP.
const ARAP_ENDPOINT =
  "https://qekexdtidnbspqzwerrd.supabase.co/functions/v1/wms-sync";
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: internal cron via shared secret, atau signed-in admin/super_admin/finance (pemicu manual)
    const cronSecret = Deno.env.get("CRON_SECRET");
    const incomingCron = req.headers.get("x-cron-secret");
    const isCronCaller = !!cronSecret && incomingCron === cronSecret;
    if (!isCronCaller) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", claimsData.claims.sub);
      const allowed = (roleRows || []).some((r: any) =>
        ["super_admin", "admin", "finance"].includes(r.role),
      );
      if (!allowed) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // API key: sama seperti arap-sync (secret dulu, fallback ke tabel settings)
    let apiKey = Deno.env.get("ARAP_API_KEY") ?? "";
    if (!apiKey) {
      const { data: setting } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "arap_api_key")
        .maybeSingle();
      const raw = (setting as any)?.value;
      apiKey = typeof raw === "string" ? raw : raw ? String(raw) : "";
    }
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ARAP_API_KEY belum dikonfigurasi" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Ambil baris outbox yang belum terkirim ----
    const { data: rows, error: fetchError } = await supabase
      .from("finance_sync_outbox")
      .select(
        "id, stock_transaction_id, transaction_type, transaction_date, product_id, quantity, total_cost, reference_number, attempts, products(sku)",
      )
      .in("status", ["PENDING", "FAILED"])
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      return new Response(JSON.stringify({ success: false, error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let failed = 0;

    for (const row of rows || []) {
      const productRef = (row as any).products?.sku || row.product_id;
      try {
        const upstream = await fetch(ARAP_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            entity: "stock_movement",
            action: "upsert",
            data: {
              wms_id: row.stock_transaction_id,
              transaction_type: row.transaction_type,
              transaction_date: row.transaction_date,
              total_cost: row.total_cost,
              product_ref: productRef,
              quantity: row.quantity,
              source_reference: row.reference_number,
            },
          }),
        });
        const result = await upstream.json().catch(() => ({}));

        if (upstream.ok && result?.success !== false) {
          await supabase
            .from("finance_sync_outbox")
            .update({ status: "SENT", sent_at: new Date().toISOString() })
            .eq("id", row.id);
          sent++;
        } else {
          const errMsg = result?.error || `Upstream status ${upstream.status}`;
          await supabase
            .from("finance_sync_outbox")
            .update({
              status: "FAILED",
              attempts: row.attempts + 1,
              last_error: String(errMsg).slice(0, 1000),
            })
            .eq("id", row.id);
          failed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Network error";
        await supabase
          .from("finance_sync_outbox")
          .update({
            status: "FAILED",
            attempts: row.attempts + 1,
            last_error: message.slice(0, 1000),
          })
          .eq("id", row.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: (rows || []).length, sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[finance-sync-forwarder] error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
