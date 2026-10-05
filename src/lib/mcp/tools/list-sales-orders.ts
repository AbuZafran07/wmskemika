import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed } from "../supabase";

export default defineTool({
  name: "list_sales_orders",
  title: "Daftar Sales Order",
  description: "List recent Sales Orders, optionally filtered by status or order number.",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("e.g. draft, approved, delivered, cancelled"),
    number: z.string().trim().max(60).optional().describe("Fragment of the SO number"),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, number, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("sales_order_headers")
      .select("id, sales_order_number, order_date, delivery_deadline, status, order_type, sales_name, project_instansi, grand_total, customers(name)")
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("order_date", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    if (number) q = q.ilike("sales_order_number", `%${number.replace(/[%]/g, "")}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const orders = (data ?? []).map((o: any) => ({
      id: String(o.id),
      number: String(o.sales_order_number),
      order_date: o.order_date as string,
      delivery_deadline: o.delivery_deadline as string,
      status: String(o.status),
      order_type: String(o.order_type),
      sales_name: String(o.sales_name),
      project: String(o.project_instansi),
      customer: (o.customers?.name ?? null) as string | null,
      grand_total: o.grand_total == null ? null : Number(o.grand_total),
    }));
    return { content: [{ type: "text", text: JSON.stringify(orders) }], structuredContent: { orders } };
  },
});
