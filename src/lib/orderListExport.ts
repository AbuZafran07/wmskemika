import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

export type OrderExportKind = "sales_order" | "plan_order";

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export interface OrderExportRow {
  header: Record<string, string | number>;
  items: Record<string, string | number>[];
}

/** Fetch ALL sales orders (header + items), newest first. */
async function fetchSalesOrders() {
  const { data, error } = await supabase
    .from("sales_order_headers")
    .select(`
      sales_order_number, order_date, status, order_type, sales_name, customer_po_number,
      sales_pulse_reference_number, project_instansi, allocation_type, delivery_deadline,
      total_amount, discount, tax_rate, shipping_cost, grand_total, notes, is_deleted,
      customer:customers(name, code),
      items:sales_order_items(
        item_type, description, instrument_name, ordered_qty, qty_delivered, qty_remaining,
        unit_price, discount, subtotal, notes,
        product:products(sku, name)
      )
    `)
    .order("order_date", { ascending: false });
  if (error) throw error;
  return (data || []) as any[];
}

/** Fetch ALL plan orders (header + items), newest first. */
async function fetchPlanOrders() {
  const { data, error } = await supabase
    .from("plan_order_headers")
    .select(`
      plan_number, plan_date, status, reference_no, expected_delivery_date,
      total_amount, discount, tax_rate, shipping_cost, grand_total, notes, is_deleted,
      supplier:suppliers(name, code),
      items:plan_order_items(
        planned_qty, qty_received, qty_remaining, unit_price, subtotal, notes,
        product:products(sku, name)
      )
    `)
    .order("plan_date", { ascending: false });
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

async function collect(kind: OrderExportKind, showPrice: boolean) {
  if (kind === "sales_order") return buildSalesRows(await fetchSalesOrders());
  return buildPlanRows(await fetchPlanOrders(), showPrice);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Export all SO/PO data to a 2-sheet Excel workbook (Header + Detail Item). */
export async function exportOrdersToExcel(kind: OrderExportKind, showPrice = true) {
  const { headers, items } = await collect(kind, showPrice);
  const wb = XLSX.utils.book_new();

  const wsHeader = XLSX.utils.json_to_sheet(headers);
  wsHeader["!cols"] = Object.keys(headers[0] || { a: "" }).map((k) => ({ wch: Math.max(12, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, wsHeader, "Header");

  const wsItems = XLSX.utils.json_to_sheet(items);
  wsItems["!cols"] = Object.keys(items[0] || { a: "" }).map((k) => ({ wch: Math.max(12, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, wsItems, "Detail Item");

  const name = kind === "sales_order" ? "Sales-Order" : "Plan-Order";
  XLSX.writeFile(wb, `Export-${name}-${stamp()}.xlsx`);
  return { headerCount: headers.length, itemCount: items.length };
}

/** Export all SO/PO data to a landscape A4 PDF (Header table + Detail Item table). */
export async function exportOrdersToPdf(kind: OrderExportKind, showPrice = true) {
  const { headers, items } = await collect(kind, showPrice);
  const title = kind === "sales_order" ? "Daftar Sales Order" : "Daftar Plan Order";

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(13);
  doc.text("PT. KEMIKA KARYA PRATAMA", 40, 34);
  doc.setFontSize(10);
  doc.text(`${title} — dicetak ${new Date().toLocaleString("id-ID")}`, 40, 50);

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
    table(headers, `${title} — Header (${headers.length} dokumen)`, 66);
  }
  if (items.length) {
    doc.addPage();
    table(items, `${title} — Detail Item (${items.length} baris)`, 30);
  }

  const name = kind === "sales_order" ? "Sales-Order" : "Plan-Order";
  doc.save(`Export-${name}-${stamp()}.pdf`);
  return { headerCount: headers.length, itemCount: items.length };
}
