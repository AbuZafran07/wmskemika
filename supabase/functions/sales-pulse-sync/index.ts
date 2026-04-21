import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SALES_PULSE_BASE_URL = "https://ggzttrxpkbpjbymrzpsg.supabase.co/functions/v1";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

function jsonResponse(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeText(value: unknown, maxLength = 255) {
  return String(value ?? "").trim().slice(0, maxLength);
}

async function parseBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const salesPulseApiKey = Deno.env.get("SALES_PULSE_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: "Backend environment is not configured" }, 500);
    }

    if (!salesPulseApiKey) {
      return jsonResponse({ error: "SALES_PULSE_API_KEY is not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = claimsData.claims.sub;
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const action = req.method === "GET"
      ? sanitizeText(new URL(req.url).searchParams.get("action") || "")
      : sanitizeText((await parseBody(req)).action || "");

    if (!action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    if (action === "list-open-references") {
      const url = new URL(`${SALES_PULSE_BASE_URL}/list-open-references`);
      const incomingUrl = new URL(req.url);
      const search = sanitizeText(incomingUrl.searchParams.get("search") || "", 100);
      const segment = sanitizeText(incomingUrl.searchParams.get("segment") || "", 20);
      const limit = Number(incomingUrl.searchParams.get("limit") || "50");

      if (search) url.searchParams.set("search", search);
      if (segment) url.searchParams.set("segment", segment);
      url.searchParams.set("limit", String(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 50));

      const upstream = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-WMS-API-Key": salesPulseApiKey,
        },
      });

      const responsePayload = await upstream.json().catch(() => ({ error: "Invalid JSON response" }));
      return jsonResponse(responsePayload, upstream.status);
    }

    if (action === "wms-so-approved") {
      const body = await parseBody(req);
      const referenceNumber = sanitizeText(body.reference_number, 100);
      const soNumber = sanitizeText(body.so_number, 100);
      const soDate = sanitizeText(body.so_date, 20);
      const customerName = sanitizeText(body.customer_name, 255) || null;
      const salesOrderId = sanitizeText(body.sales_order_id, 100) || null;
      const totalValueRaw = Number(body.total_value);

      if (!referenceNumber || !soNumber || !soDate || !Number.isFinite(totalValueRaw)) {
        return jsonResponse({ error: "reference_number, so_number, so_date, and total_value are required" }, 400);
      }

      const requestPayload = {
        reference_number: referenceNumber,
        so_number: soNumber,
        so_date: soDate,
        total_value: Math.round(totalValueRaw),
        customer_name: customerName,
      };

      const { data: logRow, error: logError } = await adminClient
        .from("sales_pulse_sync_logs")
        .insert({
          sales_order_id: salesOrderId || null,
          reference_number: referenceNumber,
          endpoint: "/wms-so-approved",
          http_method: "POST",
          direction: "wms_to_sales_pulse",
          status: "pending",
          request_payload: requestPayload,
          triggered_by: userId,
        })
        .select("id")
        .single();

      if (logError) {
        console.error("Failed to create Sales Pulse sync log:", logError);
      }

      const upstream = await fetch(`${SALES_PULSE_BASE_URL}/wms-so-approved`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WMS-API-Key": salesPulseApiKey,
        },
        body: JSON.stringify(requestPayload),
      });

      const responsePayload = await upstream.json().catch(() => ({ error: "Invalid JSON response" }));
      const syncStatus = upstream.ok ? "success" : "failed";
      const errorMessage = upstream.ok
        ? null
        : sanitizeText((responsePayload as Record<string, unknown>)?.error || (responsePayload as Record<string, unknown>)?.reason || `HTTP ${upstream.status}`, 500);

      if (logRow?.id) {
        const { error: updateError } = await adminClient
          .from("sales_pulse_sync_logs")
          .update({
            status: syncStatus,
            status_code: upstream.status,
            response_payload: responsePayload,
            error_message: errorMessage,
          })
          .eq("id", logRow.id);

        if (updateError) {
          console.error("Failed to update Sales Pulse sync log:", updateError);
        }
      }

      return jsonResponse(responsePayload, upstream.status);
    }

    return jsonResponse({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("Sales Pulse sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
