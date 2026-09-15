import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ARAP_ENDPOINT = "https://qekexdtidnbspqzwerrd.supabase.co/functions/v1/wms-sync";

const ALLOWED_ENTITIES = ["customer", "vendor", "sales_order", "plan_order", "stock_movement"];
const ALLOWED_ACTIONS = ["upsert", "sync_batch"];
const ALLOWED_ROLES = ["super_admin", "admin", "finance", "sales", "purchasing"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!(roleRows || []).some((r: any) => ALLOWED_ROLES.includes(r.role))) {
      return json({ error: "Forbidden" }, 403);
    }

    let payload: any = {};
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const entity = String(payload?.entity ?? "");
    const action = String(payload?.action ?? "");
    const data = payload?.data;

    if (!ALLOWED_ENTITIES.includes(entity)) {
      return json({ error: "Invalid entity" }, 400);
    }
    if (!ALLOWED_ACTIONS.includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }
    if (data === null || data === undefined || typeof data !== "object") {
      return json({ error: "Invalid data" }, 400);
    }

    // API key stays server-side: read from secret first, fallback to settings table
    let apiKey = Deno.env.get("ARAP_API_KEY") ?? "";
    if (!apiKey) {
      const { data: setting } = await adminClient
        .from("settings")
        .select("value")
        .eq("key", "arap_api_key")
        .maybeSingle();
      const raw = (setting as any)?.value;
      apiKey = typeof raw === "string" ? raw : raw ? String(raw) : "";
    }

    if (!apiKey) {
      return json({ success: false, error: "API key belum dikonfigurasi" }, 400);
    }

    const response = await fetch(ARAP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ entity, action, data }),
    });

    let result: any = null;
    try {
      result = await response.json();
    } catch {
      result = null;
    }

    if (!response.ok) {
      console.error(`[AR/AP proxy] ${entity} failed with status ${response.status}`);
      return json({ success: false, error: result?.error || `HTTP ${response.status}` }, 200);
    }

    return json({ success: true, data: result });
  } catch (err) {
    console.error("[AR/AP proxy] error:", err);
    return json({ success: false, error: "Sync request failed" }, 200);
  }
});