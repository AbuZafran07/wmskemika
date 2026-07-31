import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { docFileName } from "@/lib/calibrationPdf";

export async function printCalibrationSparepartRequest(salesOrderId: string) {
  const { data: header, error: headerErr } = await supabase
    .from("sales_order_headers")
    .select("sales_order_number, order_date, service_pic_name, service_pic_phone, service_location, notes, customer:customers(name, code)")
    .eq("id", salesOrderId)
    .single();
  if (headerErr) console.error("[SparepartRequestPdf] header error:", headerErr);

  const { data: items } = await supabase
    .from("sales_order_items")
    .select("id, instrument_name, description")
    .eq("sales_order_id", salesOrderId)
    .eq("item_type", "calibration");
  const instMap = new Map<string, string>();
  (items || []).forEach((i: any) => instMap.set(i.id, i.instrument_name || i.description || "-"));
  const instIds = (items || []).map((i: any) => i.id);

  let parts: any[] = [];
  if (instIds.length) {
    const { data: sp } = await (supabase as any)
      .from("calibration_spare_parts")
      .select("id, instrument_id, qty_used, notes, product:products(name, sku)")
      .in("instrument_id", instIds)
      .order("created_at", { ascending: true });
    parts = sp || [];
  }

  if (parts.length === 0) {
    toast.error("Belum ada sparepart untuk dicetak");
    return;
  }

  const h: any = header || {};
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageW = doc.internal.pageSize.getWidth();
  const fmtD = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("FORM PERMINTAAN PENGELUARAN SPAREPART", pageW / 2, 15, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("PT. Kemika Karya Pratama — Kalibrasi", pageW / 2, 21, { align: "center" });
  doc.setLineWidth(0.3);
  doc.line(14, 25, pageW - 14, 25);

  let y = 31;
  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(`: ${value || "-"}`, 55, y);
    y += 5.5;
  };
  line("No. SO / Referensi", h.sales_order_number || "-");
  line("Tanggal Cetak", fmtD(new Date()));
  line(
    "Customer",
    h.customer?.name ? `${h.customer.name}${h.customer.code ? ` (${h.customer.code})` : ""}` : "-",
  );
  line("PIC / Teknisi", h.service_pic_name || "-");
  line("Lokasi Kalibrasi", h.service_location || "-");

  const body = parts.map((p, i) => [
    String(i + 1),
    p.product?.name ?? "-",
    p.product?.sku ?? "-",
    String(p.qty_used),
    p.notes ?? "-",
    "",
  ]);

  autoTable(doc, {
    startY: y + 3,
    head: [["No", "Sparepart", "SKU", "Qty", "Catatan", "Qty Diserahkan"]],
    body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
      5: { cellWidth: 28 },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  doc.text(
    "Catatan: Form ini merupakan permintaan resmi pengeluaran sparepart dari warehouse untuk keperluan pekerjaan kalibrasi di atas.",
    14,
    finalY,
    { maxWidth: pageW - 28 },
  );

  const sigY = Math.max(finalY + 15, doc.internal.pageSize.getHeight() - 45);
  const colW = (pageW - 28) / 3;
  const roles = ["Diminta oleh (Sales/Teknisi)", "Diperiksa (Supervisor)", "Diserahkan (Warehouse)"];
  roles.forEach((r, i) => {
    const x = 14 + colW * i + colW / 2;
    doc.setFont("helvetica", "bold");
    doc.text(r, x, sigY, { align: "center" });
    doc.line(14 + colW * i + 10, sigY + 22, 14 + colW * (i + 1) - 10, sigY + 22);
    doc.setFont("helvetica", "normal");
    doc.text("Nama & Tanda Tangan", x, sigY + 27, { align: "center" });
    doc.text("Tgl: ______________", x, sigY + 32, { align: "center" });
  });

  doc.save(docFileName("Permintaan-Sparepart", h.sales_order_number));
  toast.success("Form permintaan sparepart berhasil dicetak");
}