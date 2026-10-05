import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Cari produk & stok",
  description: "Search active products by name or SKU and return their on-hand stock totals.",
  inputSchema: {
    query: z.string().trim().max(100).optional().describe("Name or SKU fragment; empty lists all."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("products")
      .select("id, sku, name, min_stock, location_rack, inventory_batches(batch_no, qty_on_hand, expired_date)")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name")
      .limit(limit ?? 25);
    if (query) {
      const safe = query.replace(/[%,()]/g, " ");
      q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const products = (data ?? []).map((p) => {
      const batches = (p.inventory_batches ?? []).map((b) => ({
        batch_no: b.batch_no,
        qty_on_hand: Number(b.qty_on_hand),
        expired_date: b.expired_date,
      }));
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        location_rack: p.location_rack,
        min_stock: p.min_stock,
        qty_on_hand: batches.reduce((s, b) => s + b.qty_on_hand, 0),
        batches,
      };
    });
    return { content: [{ type: "text", text: JSON.stringify(products) }], structuredContent: { products } };
  },
});
