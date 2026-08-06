import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

export type OrderExportKind = "sales_order" | "plan_order";

export interface OrderExportFilter {
  /** Tanggal awal (inclusive), format yyyy-mm-dd */
  dateFrom?: string;
  /** Tanggal akhir (inclusive), format yyyy-mm-dd */
  dateTo?: string;
  /** Nama sales (khusus Sales Order) */
  salesName?: string;
  /** Supplier id (khusus Plan Order) */
  supplierId?: string;
  /** Status dokumen */
  status?: string;
  /** Sertakan dokumen yang sudah dihapus (soft delete) */
  includeDeleted?: boolean;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

const sel = (s: string): string => s;

const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

/** Ambil daftar nama sales unik untuk pilihan filter. */
export async function fetchSalesNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from("sales_order_headers")
    .select("sales_name")
    .order("sales_name", { ascending: true });
  if (error) throw error;
  const set = new Set<string>();
  (data || []).forEach((r: { sales_name: string | null }) => {
    if (r.sales_name && r.sales_name.trim()) set.add(r.sales_name.trim());
  });
  return Array.from(set);
}

/** Ambil daftar supplier aktif untuk pilihan filter Plan Order. */
export async function fetchSupplierOptions(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as { id: string; name: string }[];
}

export interface OrderExportRow {
  header: Record<string, string | number>;
  items: Record<string, string | number>[];
}

/** Fetch sales orders (header + items) sesuai filter, newest first. */
async function fetchSalesOrders(filter: OrderExportFilter = {}) {
  let q = supabase
    .from("sales_order_headers")
    .select(sel(`
      sales_order_number, order_date, status, order_type, sales_name, customer_po_number,
      sales_pulse_reference_number, project_instansi, allocation_type, delivery_deadline,
      total_amount, discount, tax_rate, shipping_cost, grand_total, notes, is_deleted,
      customer:customers(name, code),
      items:sales_order_items(
        item_type, description, instrument_name, ordered_qty, qty_delivered, qty_remaining,
        unit_price, discount, subtotal, notes,
        product:products(sku, name)
      )
    `))
    .order("order_date", { ascending: false });

  if (filter.dateFrom) q = q.gte("order_date", filter.dateFrom);
  if (filter.dateTo) q = q.lte("order_date", filter.dateTo);
  if (filter.salesName) q = q.eq("sales_name", filter.salesName);
  if (filter.status) q = q.eq("status", filter.status);
  if (!filter.includeDeleted) q = q.eq("is_deleted", false);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
}

/** Fetch plan orders (header + items) sesuai filter, newest first. */
async function fetchPlanOrders(filter: OrderExportFilter = {}) {
  let q = supabase
    .from("plan_order_headers")
    .select(sel(`
      plan_number, plan_date, status, reference_no, expected_delivery_date,
      total_amount, discount, tax_rate, shipping_cost, grand_total, notes, is_deleted,
      supplier:suppliers(name, code),
      items:plan_order_items(
        planned_qty, qty_received, qty_remaining, unit_price, subtotal, notes,
        product:products(sku, name)
      )
    `))
    .order("plan_date", { ascending: false });

  if (filter.dateFrom) q = q.gte("plan_date", filter.dateFrom);
  if (filter.dateTo) q = q.lte("plan_date", filter.dateTo);
  if (filter.supplierId) q = q.eq("supplier_id", filter.supplierId);
  if (filter.status) q = q.eq("status", filter.status);
  if (!filter.includeDeleted) q = q.eq("is_deleted", false);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
}

function buildSalesRows(rows: any[]) {
  const headers = rows.map((o) => ({
    "No. SO": o.sales_order_number,
    "Tanggal": fmtDate(o.order_date),
    "Tipe": o.order_type === "calibration" ? "Kalibrasi" : "Produk",
    "Customer": o.customer?.name || "",
    "Kode Customer": o.customer?.code || "",
    "Sales": o.sales_name || "",
    "No. PO Customer": o.customer_po_number || "",
    "Ref SalesPulse": o.sales_pulse_reference_number || "",
    "Project / Instansi": o.project_instansi || "",
    "Alokasi": o.allocation_type || "",
    "Deadline Kirim": fmtDate(o.delivery_deadline),
    "Status": o.is_deleted ? "deleted" : o.status,
    "Subtotal": num(o.total_amount),
    "Diskon (%)": num(o.discount),
    "PPN (%)": num(o.tax_rate),
    "Biaya Kirim": num(o.shipping_cost),
    "Grand Total": num(o.grand_total),
    "Catatan": o.notes || "",
  }));

  const items = rows.flatMap((o) =>
    (o.items || []).map((it: any) => ({
      "No. SO": o.sales_order_number,
      "Tanggal": fmtDate(o.order_date),
      "Customer": o.customer?.name || "",
      "Status SO": o.is_deleted ? "deleted" : o.status,
      "Jenis Item": it.item_type || "",
      "SKU": it.product?.sku || "",
      "Nama Item": it.product?.name || it.instrument_name || it.description || "",
      "Qty Order": num(it.ordered_qty),
      "Qty Terkirim": num(it.qty_delivered),
      "Qty Sisa": num(it.qty_remaining),
      "Harga Satuan": num(it.unit_price),
      "Diskon (%)": num(it.discount),
      "Subtotal": num(it.subtotal),
      "Catatan Item": it.notes || "",
    })),
  );

  return { headers, items };
}

function buildPlanRows(rows: any[], showPrice: boolean) {
  const headers = rows.map((o) => {
    const base: Record<string, string | number> = {
      "No. PO": o.plan_number,
      "Tanggal": fmtDate(o.plan_date),
      "Supplier": o.supplier?.name || "",
      "Kode Supplier": o.supplier?.code || "",
      "No. Referensi": o.reference_no || "",
      "Estimasi Datang": fmtDate(o.expected_delivery_date),
      "Status": o.is_deleted ? "deleted" : o.status,
    };
    if (showPrice) {
      base["Subtotal"] = num(o.total_amount);
      base["Diskon (%)"] = num(o.discount);
      base["PPN (%)"] = num(o.tax_rate);
      base["Biaya Kirim"] = num(o.shipping_cost);
      base["Grand Total"] = num(o.grand_total);
    }
    base["Catatan"] = o.notes || "";
    return base;
  });

  const items = rows.flatMap((o) =>
    (o.items || []).map((it: any) => {
      const base: Record<string, string | number> = {
        "No. PO": o.plan_number,
        "Tanggal": fmtDate(o.plan_date),
        "Supplier": o.supplier?.name || "",
        "Status PO": o.is_deleted ? "deleted" : o.status,
        "SKU": it.product?.sku || "",
        "Nama Produk": it.product?.name || "",
        "Qty Rencana": num(it.planned_qty),
        "Qty Diterima": num(it.qty_received),
        "Qty Sisa": num(it.qty_remaining),
      };
      if (showPrice) {
        base["Harga Satuan"] = num(it.unit_price);
        base["Subtotal"] = num(it.subtotal);
      }
      base["Catatan Item"] = it.notes || "";
      return base;
    }),
  );

  return { headers, items };
}

async function collect(kind: OrderExportKind, showPrice: boolean, filter: OrderExportFilter = {}) {
  if (kind === "sales_order") return buildSalesRows(await fetchSalesOrders(filter));
  return buildPlanRows(await fetchPlanOrders(filter), showPrice);
}

const stamp = () => new Date().toISOString().slice(0, 10);

const filterSuffix = (f: OrderExportFilter) => {
  const parts: string[] = [];
  if (f.salesName) parts.push(f.salesName.replace(/[^a-zA-Z0-9]+/g, "-"));
  if (f.dateFrom || f.dateTo) parts.push(`${f.dateFrom || "awal"}_sd_${f.dateTo || "akhir"}`);
  if (f.status) parts.push(f.status);
  return parts.length ? `-${parts.join("-")}` : "";
};

const filterCaption = (f: OrderExportFilter) => {
  const parts: string[] = [];
  parts.push(
    f.dateFrom || f.dateTo
      ? `Periode: ${f.dateFrom ? fmtDate(f.dateFrom) : "awal"} s/d ${f.dateTo ? fmtDate(f.dateTo) : "akhir"}`
      : "Periode: semua tanggal",
  );
  if (f.salesName) parts.push(`Sales: ${f.salesName}`);
  if (f.status) parts.push(`Status: ${f.status}`);
  return parts.join("  |  ");
};

/** Export all SO/PO data to a 2-sheet Excel workbook (Header + Detail Item). */
export async function exportOrdersToExcel(
  kind: OrderExportKind,
  showPrice = true,
  filter: OrderExportFilter = {},
) {
  const { headers, items } = await collect(kind, showPrice, filter);
  const wb = XLSX.utils.book_new();

  const wsHeader = XLSX.utils.json_to_sheet(headers);
  wsHeader["!cols"] = Object.keys(headers[0] || { a: "" }).map((k) => ({ wch: Math.max(12, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, wsHeader, "Header");

  const wsItems = XLSX.utils.json_to_sheet(items);
  wsItems["!cols"] = Object.keys(items[0] || { a: "" }).map((k) => ({ wch: Math.max(12, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, wsItems, "Detail Item");

  const name = kind === "sales_order" ? "Sales-Order" : "Plan-Order";
  XLSX.writeFile(wb, `Export-${name}${filterSuffix(filter)}-${stamp()}.xlsx`);
  return { headerCount: headers.length, itemCount: items.length };
}

/** Export all SO/PO data to a landscape A4 PDF (Header table + Detail Item table). */
export async function exportOrdersToPdf(
  kind: OrderExportKind,
  showPrice = true,
  filter: OrderExportFilter = {},
) {
  const { headers, items } = await collect(kind, showPrice, filter);
  const title = kind === "sales_order" ? "Daftar Sales Order" : "Daftar Plan Order";

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(13);
  doc.text("PT. KEMIKA KARYA PRATAMA", 40, 34);
  doc.setFontSize(10);
  doc.text(`${title} — dicetak ${new Date().toLocaleString("id-ID")}`, 40, 50);
  doc.setFontSize(8);
  doc.text(filterCaption(filter), 40, 62);

  const table = (rows: Record<string, string | number>[], caption: string, startY: number) => {
    const cols = Object.keys(rows[0] || {});
    autoTable(doc, {
      startY,
      head: [cols],
      body: rows.map((r) => cols.map((c) => (typeof r[c] === "number" ? Number(r[c]).toLocaleString("id-ID") : String(r[c] ?? "")))),
      styles: { fontSize: 6.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], fontSize: 6.5 },
      margin: { left: 24, right: 24, top: 30, bottom: 24 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(caption, 24, 22);
      },
    });
    return (doc as any).lastAutoTable.finalY as number;
  };

  if (headers.length) {
    table(headers, `${title} — Header (${headers.length} dokumen)`, 76);
  }
  if (items.length) {
    doc.addPage();
    table(items, `${title} — Detail Item (${items.length} baris)`, 30);
  }

  const name = kind === "sales_order" ? "Sales-Order" : "Plan-Order";
  doc.save(`Export-${name}${filterSuffix(filter)}-${stamp()}.pdf`);
  return { headerCount: headers.length, itemCount: items.length };
}
