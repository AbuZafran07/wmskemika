import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kemi-secret",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Constant-time comparison to avoid leaking the secret through response timing.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  // Always compare a fixed-length digest so length differences do not short-circuit.
  if (aBytes.length !== bBytes.length) {
    let diff = 1;
    const max = Math.max(aBytes.length, bBytes.length);
    for (let i = 0; i < max; i++) {
      diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
    }
    return diff === 0;
  }
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("KEMI_EXPORT_SECRET");
  if (!expectedSecret) {
    console.error("KEMI_EXPORT_SECRET is not configured");
    return json({ error: "Export configuration error" }, 500);
  }

  const providedSecret = req.headers.get("x-kemi-secret") ?? "";
  if (!timingSafeEqual(providedSecret, expectedSecret)) {
    console.warn("kemi-export: rejected request with invalid x-kemi-secret");
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional dataset filter: ?include=products,stock,sales_orders,plan_orders,customers
    const url = new URL(req.url);
    const includeParam = (url.searchParams.get("include") || "").trim();
    const requested = includeParam
      ? new Set(includeParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))
      : null;
    const wants = (key: string) => !requested || requested.has(key);

    const PAGE = 1000;
    // Read every row in pages so a large dataset is never silently truncated.
    async function fetchAll<T>(
      table: string,
      columns: string,
      tweak?: (q: any) => any,
    ): Promise<T[]> {
      const rows: T[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
        if (tweak) q = tweak(q);
        const { data, error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        const batch = (data ?? []) as T[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      return rows;
    }

    const tasks: Array<Promise<[string, unknown]>> = [];

    if (wants("products")) {
      tasks.push(
        fetchAll<any>(
          "products",
          "id, sku, name, description, purchase_price, selling_price, min_stock, max_stock, location_rack, is_active, category_id, unit_id, supplier_id",
          (q) => q.is("deleted_at", null).order("name", { ascending: true }),
        ).then((rows) => ["products", rows] as [string, unknown]),
      );
    }

    if (wants("stock")) {
      tasks.push(
        fetchAll<any>(
          "inventory_batches",
          "product_id, batch_no, expired_date, qty_on_hand, updated_at",
          (q) => q.gt("qty_on_hand", 0).order("product_id", { ascending: true }),
        ).then((rows) => {
          const byProduct = new Map<string, { product_id: string; qty_on_hand: number; batches: any[] }>();
          for (const r of rows) {
            const entry = byProduct.get(r.product_id) ?? { product_id: r.product_id, qty_on_hand: 0, batches: [] };
            entry.qty_on_hand += Number(r.qty_on_hand ?? 0);
            entry.batches.push({
              batch_no: r.batch_no,
              expired_date: r.expired_date,
              qty_on_hand: Number(r.qty_on_hand ?? 0),
            });
            byProduct.set(r.product_id, entry);
          }
          return ["stock", Array.from(byProduct.values())] as [string, unknown];
        }),
      );
    }

    if (wants("sales_orders")) {
      tasks.push(
        fetchAll<any>(
          "sales_order_headers",
          "id, sales_order_number, order_date, customer_id, customer_po_number, order_type, allocation_type, project_instansi, delivery_deadline, status, total_amount, discount, tax_rate, shipping_cost, grand_total, created_at, updated_at",
          (q) => q.eq("is_deleted", false).order("order_date", { ascending: false }),
        ).then((rows) => ["sales_orders", rows] as [string, unknown]),
      );
      tasks.push(
        fetchAll<any>(
          "sales_order_items",
          "id, sales_order_id, product_id, item_type, description, instrument_name, unit_price, ordered_qty, qty_delivered, qty_remaining, discount, tax_rate, subtotal",
        ).then((rows) => ["sales_order_items", rows] as [string, unknown]),
      );
    }

    if (wants("plan_orders")) {
      tasks.push(
        fetchAll<any>(
          "plan_order_headers",
          "id, plan_number, plan_date, supplier_id, expected_delivery_date, reference_no, status, total_amount, discount, tax_rate, shipping_cost, grand_total, created_at, updated_at",
          (q) => q.eq("is_deleted", false).order("plan_date", { ascending: false }),
        ).then((rows) => ["plan_orders", rows] as [string, unknown]),
      );
      tasks.push(
        fetchAll<any>(
          "plan_order_items",
          "id, plan_order_id, product_id, unit_price, planned_qty, qty_received, qty_remaining, subtotal",
        ).then((rows) => ["plan_order_items", rows] as [string, unknown]),
      );
    }

    if (wants("customers")) {
      // Business identity only: no NPWP, address, credit limit, or personal contact details.
      tasks.push(
        fetchAll<any>(
          "customers",
          "id, code, name, customer_type, city, is_active",
          (q) => q.is("deleted_at", null).order("name", { ascending: true }),
        ).then((rows) => ["customers", rows] as [string, unknown]),
      );
    }

    if (wants("suppliers")) {
      tasks.push(
        fetchAll<any>(
          "suppliers",
          "id, code, name, city, is_active",
          (q) => q.is("deleted_at", null).order("name", { ascending: true }),
        ).then((rows) => ["suppliers", rows] as [string, unknown]),
      );
    }

    if (wants("master")) {
      tasks.push(
        fetchAll<any>("categories", "id, code, name, is_active", (q) => q.is("deleted_at", null))
          .then((rows) => ["categories", rows] as [string, unknown]),
      );
      tasks.push(
        fetchAll<any>("units", "id, code, name, is_active", (q) => q.is("deleted_at", null))
          .then((rows) => ["units", rows] as [string, unknown]),
      );
    }

    const settled = await Promise.all(tasks);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of settled) payload[key] = value;

    const counts: Record<string, number> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (Array.isArray(value)) counts[key] = value.length;
    }

    return json({
      success: true,
      generated_at: new Date().toISOString(),
      source: "WMS PT. Kemika Karya Pratama",
      scope: "read-only summary",
      counts,
      data: payload,
    });
  } catch (error) {
    console.error("kemi-export error:", (error as Error).message);
    return json({ error: "Export failed", details: (error as Error).message }, 500);
  }
});
