import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_plan_orders",
  title: "Daftar Plan Order",
  description: "List recent inbound Plan Orders, optionally filtered by status.",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("e.g. draft, approved, received"),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("plan_order_headers")
      .select("id, plan_number, plan_date, expected_delivery_date, status, grand_total, suppliers(name)")
      .order("plan_date", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const orders = (data ?? []).map((o: any) => ({
      id: String(o.id),
      number: String(o.plan_number),
      plan_date: o.plan_date as string,
      expected_delivery_date: (o.expected_delivery_date ?? null) as string | null,
      status: String(o.status),
      supplier: (o.suppliers?.name ?? null) as string | null,
      grand_total: o.grand_total == null ? null : Number(o.grand_total),
    }));
    return { content: [{ type: "text", text: JSON.stringify(orders) }], structuredContent: { orders } };
  },
});
