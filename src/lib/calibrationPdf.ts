import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

// ── page geometry ─────────────────────────────────────────────────────────────

const A4_W = 210;
const A4_H = 297;
const M_LEFT = 14;
const M_RIGHT = 14;
const CONTENT_W = A4_W - M_LEFT - M_RIGHT;
const M_TOP = 47;
const M_BOTTOM = 24; // reserve room for footer meta table

// ── typography scale (locked so layout is identical across devices) ───────────
const FONT = "helvetica" as const;
const FS = {
  sectionHead: 9,      // "A. PARA PIHAK" etc
  headerInfo: 9,       // top info box
  bodyTable: 8.5,      // scope table body
  terms: 8.5,          // terms & conditions
  parties: 9,          // parties block
  sigTitle: 9,         // "Dibuat oleh" / "Disetujui oleh"
  sigRole: 8.5,        // role line
  footerMeta: 7.5,     // bottom meta
  formCode: 7,         // "F-KAL-05"
  certTitle: 13,
  certMeta: 9,
  infoRow: 8.5,
} as const;

function setFont(doc: jsPDF, weight: "normal" | "bold", size: number) {
  doc.setFont(FONT, weight);
  doc.setFontSize(size);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Math.round(v || 0));
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), "dd MMMM yyyy", { locale: idLocale }); }
  catch { return d; }
}

async function imgToBase64(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = src + (src.includes("?") ? "&" : "?") + "_t=" + Date.now();
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return c.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

async function getSignatureBase64(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("user_signatures")
    .select("signature_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.signature_path) return null;
  const { data: pub } = supabase.storage.from("signatures").getPublicUrl(data.signature_path);
  if (!pub?.publicUrl) return null;
  return imgToBase64(pub.publicUrl);
}

function addBg(doc: jsPDF, bgData: string | null) {
  if (bgData) doc.addImage(bgData, "JPEG", 0, 0, A4_W, A4_H);
}

function sectionHeader(doc: jsPDF, text: string, y: number): number {
  doc.setFillColor(220, 228, 252);
  doc.rect(M_LEFT, y - 3.5, CONTENT_W, 6.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(text, M_LEFT + 2, y + 0.5);
  return y + 8;
}

function infoRow(doc: jsPDF, label: string, value: string, y: number, labelW = 44, colonW = 4): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(label, M_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(":", M_LEFT + labelW, y);
  const lines = doc.splitTextToSize(value, CONTENT_W - labelW - colonW - 2);
  doc.text(lines, M_LEFT + labelW + colonW, y);
  return y + lines.length * 4.8;
}

// ── SPK PDF — F-KAL-02 ───────────────────────────────────────────────────────

function drawSpkFooter(doc: jsPDF, pageNo: number, pageCount: number) {
  const footY = A4_H - 18;
  autoTable(doc, {
    startY: footY,
    body: [
      [
        { content: "No. Dokumen", styles: { fontStyle: "bold", fillColor: [230, 235, 245] } },
        "KEMIKA-F-KAL-02",
        { content: "Dokumen ini milik PT KEMIKA KARYA PRATAMA", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
        { content: "Revisi", styles: { fontStyle: "bold", fillColor: [230, 235, 245] } },
        "00",
      ],
      [
        { content: "Terbit", styles: { fontStyle: "bold", fillColor: [230, 235, 245] } },
        "01 Juni 2026",
        { content: "Halaman", styles: { fontStyle: "bold", fillColor: [230, 235, 245] } },
        `${pageNo} dari ${pageCount}`,
      ],
    ],
    theme: "grid",
    margin: { left: M_LEFT, right: M_RIGHT },
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [180, 180, 180], lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 40 },
      2: { cellWidth: CONTENT_W - 26 - 40 - 20 - 20 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
    },
  });
}

export async function generateSPKPdf(receiptId: string) {
  // 1. Fetch SO header + customer
  const { data: header, error } = await (supabase as any)
    .from("sales_order_headers")
    .select(`
      id, sales_order_number, spk_number, spk_issued_at,
      calibration_received_at, target_completion_date, service_location,
      service_pic_name, service_pic_phone, customer_request_notes,
      customer_po_number, tax_rate, total_amount,
      customer:customers(name, address, phone)
    `)
    .eq("id", receiptId)
    .single();

  if (error || !header) throw new Error("Data SO kalibrasi tidak ditemukan");

  const receipt: any = {
    ...header,
    receipt_number: header.sales_order_number,
    received_date: header.calibration_received_at,
  };

  // 2. Fetch instruments from sales_order_items
  const { data: rawItems } = await (supabase as any)
    .from("sales_order_items")
    .select(
      "instrument_name, instrument_brand_model, instrument_serial_number, measurement_range, calibration_method, sla_working_days, unit_price, description, created_at",
    )
    .eq("sales_order_id", receiptId)
    .eq("item_type", "calibration")
    .order("created_at", { ascending: true });

  const instruments = (rawItems || []).map((it: any, idx: number) => ({
    item_number: idx + 1,
    instrument_name: it.instrument_name ?? it.description ?? "-",
    brand_model: it.instrument_brand_model ?? null,
    serial_number: it.instrument_serial_number ?? null,
    measurement_range: it.measurement_range ?? null,
    calibration_method: it.calibration_method ?? null,
    sla_working_days: it.sla_working_days ?? null,
    unit_price: Number(it.unit_price ?? 0),
  }));

  // 3. Assets
  const bgData = await imgToBase64("/kop-surat-bg.jpg");

  // 4. Build PDF
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addBg(doc, bgData);

  const customer = (receipt as any).customer;
  const taxRate = Number((receipt as any).tax_rate ?? 11);
  const subtotal = (instruments || []).reduce((s, i) => s + Number(i.unit_price || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const grandTotal = Number((receipt as any).total_amount) > 0
    ? Number((receipt as any).total_amount)
    : subtotal + taxAmount;

  // ── Header block: No. SPK / Ref / Tanggal / Target ──
  autoTable(doc, {
    startY: M_TOP,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    body: [
      [
        { content: "No. SPK", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        (receipt as any).spk_number || "-",
        { content: "No. Permohonan Ref.", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        (receipt as any).customer_po_number || (receipt as any).receipt_number || "-",
      ],
      [
        { content: "Tanggal SPK", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        fmtDate((receipt as any).spk_issued_at || (receipt as any).received_date),
        { content: "Target Selesai", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        fmtDate((receipt as any).target_completion_date),
      ],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: (CONTENT_W - 64) / 2 },
      2: { cellWidth: 32 },
      3: { cellWidth: (CONTENT_W - 64) / 2 },
    },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  let y = (doc as any).lastAutoTable.finalY + 4;

  // ── A. PARA PIHAK ──
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [[{ content: "A.  PARA PIHAK", colSpan: 2, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
    body: [[
      {
        content:
          "PIHAK I — Laboratorium Kalibrasi\nPT Kemika Karya Pratama\n\nManajer Laboratorium: Haris Pratama Putra",
      },
      {
        content:
          `PIHAK II — Pelanggan\nNama / Instansi : ${customer?.name || "-"}\nAlamat          : ${customer?.address || "-"}\nPIC / Kontak    : ${(receipt as any).service_pic_name || "-"}${(receipt as any).service_pic_phone ? " / " + (receipt as any).service_pic_phone : ""}`,
      },
    ]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "top" },
    columnStyles: { 0: { cellWidth: CONTENT_W / 2 }, 1: { cellWidth: CONTENT_W / 2 } },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // ── B. LINGKUP PEKERJAAN KALIBRASI ──
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [
      [{ content: "B.  LINGKUP PEKERJAAN KALIBRASI", colSpan: 7, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }],
      ["No.", "Nama / Jenis Alat", "Merk / Model", "No. Seri", "Metode Kalibrasi", "SLA (HK)", "Harga (Rp)"],
    ],
    body: [
      ...(instruments || []).map((item) => [
        String(item.item_number),
        item.instrument_name,
        item.brand_model || "-",
        item.serial_number || "-",
        item.calibration_method || "-",
        item.sla_working_days != null ? String(item.sla_working_days) : "-",
        fmt(Number(item.unit_price)),
      ]),
      [{ content: "Sub-Total", colSpan: 6, styles: { halign: "right", fontStyle: "bold" } }, { content: fmt(subtotal), styles: { halign: "right" } }],
      [{ content: `PPN ${taxRate}%`, colSpan: 6, styles: { halign: "right", fontStyle: "bold" } }, { content: fmt(taxAmount), styles: { halign: "right" } }],
      [{ content: "TOTAL", colSpan: 6, styles: { halign: "right", fontStyle: "bold", fillColor: [245, 247, 252] } }, { content: fmt(grandTotal), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 247, 252] } }],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "middle" },
    headStyles: { fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      5: { cellWidth: 16, halign: "center" },
      6: { cellWidth: 30, halign: "right" },
    },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // ── C. SYARAT DAN KETENTUAN ──
  const terms = [
    "Pembayaran 100% di muka sebelum alat diserahkan, kecuali disepakati lain.",
    "Sertifikat kalibrasi diterbitkan setelah pembayaran lunas.",
    "Jika alat tidak layak dikalibrasi, biaya administrasi tetap dikenakan sesuai kesepakatan.",
    "Kerahasiaan data dijamin sesuai klausul 4.2 SNI ISO/IEC 17025:2017.",
    "Keluhan disampaikan dalam 7 hari kalender setelah sertifikat diterima.",
    "Laboratorium berhak menolak kalibrasi jika alat tidak layak atau berpotensi merusak standar.",
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [[{ content: "C.  SYARAT DAN KETENTUAN", styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
    body: [[terms.map((t, i) => `${i + 1}. ${t}`).join("\n")]],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.2 },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Signatures: 3 columns — add new page if not enough room ──
  const SIG_BLOCK_H = 44;
  if (y + SIG_BLOCK_H > A4_H - M_BOTTOM) {
    doc.addPage();
    addBg(doc, bgData);
    y = M_TOP;
  }
  const sigY = Math.max(y, A4_H - M_BOTTOM - SIG_BLOCK_H);
  const colW = CONTENT_W / 3;
  const sigLabels: [string, string][] = [
    ["Dibuat oleh", "Koordinator Administrasi"],
    ["Disetujui oleh", "Manajer Laboratorium"],
    ["Disetujui oleh", "(Pihak II — Pelanggan)"],
  ];
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  // outer frame
  doc.rect(M_LEFT, sigY - 4, CONTENT_W, 40);
  for (let i = 0; i < 3; i++) {
    const x = M_LEFT + colW * i;
    if (i > 0) doc.line(x, sigY - 4, x, sigY + 36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(sigLabels[i][0], x + colW / 2, sigY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(sigLabels[i][1], x + colW / 2, sigY + 33, { align: "center" });
    // signature line
    doc.line(x + 8, sigY + 28, x + colW - 8, sigY + 28);
  }

  // ── Footer meta table on every page ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawSpkFooter(doc, p, pageCount);
  }

  // ── Open preview in a new tab (user can download from viewer) ──
  const filename = `SPK-${(receipt as any).spk_number || (receipt as any).receipt_number}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    // Popup blocked — fallback to direct download
    doc.save(filename);
  }
  // Also expose filename via document title of preview when possible
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Certificate PDF — F-KAL-05 ────────────────────────────────────────────────

export async function generateCertificatePdf(receiptId: string, instrumentId?: string) {
  // 1. Fetch SO header
  const { data: hdr } = await (supabase as any)
    .from("sales_order_headers")
    .select("id, sales_order_number, spk_number, customer:customers(name)")
    .eq("id", receiptId)
    .single();

  const receipt: any = hdr ? { ...hdr, receipt_number: hdr.sales_order_number } : null;

  // 2. Fetch instruments from sales_order_items
  let q = (supabase as any)
    .from("sales_order_items")
    .select("*")
    .eq("sales_order_id", receiptId)
    .eq("item_type", "calibration")
    .order("created_at", { ascending: true });

  if (instrumentId) q = (q as any).eq("id", instrumentId);

  const { data: rawItems } = await q;
  const instruments = (rawItems || []).map((it: any, idx: number) => ({
    ...it,
    item_number: idx + 1,
    brand_model: it.instrument_brand_model ?? null,
    serial_number: it.instrument_serial_number ?? null,
    instrument_name: it.instrument_name ?? it.description ?? "-",
  }));
  if (!instruments || instruments.length === 0) throw new Error("Tidak ada data alat kalibrasi");

  // 3. Background
  const bgData = await imgToBase64("/kop-surat-bg.jpg");
  const LABEL_W = 44;

  // 4. Build PDF — one page per instrument
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let idx = 0; idx < instruments.length; idx++) {
    const item = instruments[idx] as any;

    if (idx > 0) doc.addPage();
    addBg(doc, bgData);

    let y = M_TOP;

    // Form number
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text("F-KAL-05", A4_W - M_RIGHT, 10, { align: "right" });
    doc.setTextColor(0, 0, 0);

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("SERTIFIKAT KALIBRASI", A4_W / 2, y, { align: "center" });
    y += 6.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`No. Sertifikat : ${item.certificate_number || "-"}`, A4_W / 2, y, { align: "center" });
    y += 4.5;
    doc.text(
      `Tanggal Terbit : ${fmtDate(item.certificate_issued_at)}`,
      A4_W / 2, y, { align: "center" },
    );
    y += 7;

    doc.setDrawColor(140, 140, 140);
    doc.setLineWidth(0.3);
    doc.line(M_LEFT, y, A4_W - M_RIGHT, y);
    y += 6;

    // Receipt/customer context
    for (const [label, value] of [
      ["No. SPK",        (receipt as any)?.spk_number || "-"] as [string, string],
      ["Customer",       (receipt as any)?.customer?.name || "-"] as [string, string],
      ["No. Tanda Terima", (receipt as any)?.receipt_number || "-"] as [string, string],
    ]) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 5;

    // DATA ALAT
    y = sectionHeader(doc, "DATA ALAT", y);
    for (const [label, value] of [
      ["Nama Alat",       item.instrument_name] as [string, string],
      ["Merk / Model",    item.brand_model || "-"] as [string, string],
      ["No. Seri",        item.serial_number || "-"] as [string, string],
      ["Range Ukur",      item.measurement_range || "-"] as [string, string],
      ["Metode Kalibrasi",item.calibration_method || "-"] as [string, string],
    ]) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 4;

    // DATA KALIBRASI
    y = sectionHeader(doc, "DATA KALIBRASI", y);
    for (const [label, value] of [
      ["Metode Standar",  item.standard_method || "-"] as [string, string],
      ["Ketertelusuran",  item.traceability || "-"] as [string, string],
      ["Suhu Lingkungan", item.env_temperature != null ? `${item.env_temperature} °C` : "-"] as [string, string],
      ["Kelembaban",      item.env_humidity != null ? `${item.env_humidity} %RH` : "-"] as [string, string],
    ]) {
      y = infoRow(doc, label, value, y, LABEL_W);
      y += 0.5;
    }

    y += 4;

    // HASIL & KESIMPULAN
    y = sectionHeader(doc, "HASIL & KESIMPULAN", y);

    const withinLimits = !item.calibration_conclusion || item.calibration_conclusion === "within_limits";
    const conclusionText = withinLimits ? "DALAM BATAS  (Within Limits)" : "DI LUAR BATAS  (Out of Limits)";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Kesimpulan", M_LEFT, y);
    doc.text(":", M_LEFT + LABEL_W, y);
    doc.setTextColor(withinLimits ? 20 : 180, withinLimits ? 120 : 30, withinLimits ? 40 : 30);
    doc.text(conclusionText, M_LEFT + LABEL_W + 4, y);
    doc.setTextColor(0, 0, 0);
    y += 5.5;

    if (item.calibration_notes) {
      y = infoRow(doc, "Catatan", item.calibration_notes, y, LABEL_W);
      y += 0.5;
    }

    y += 6;

    // Signatures
    const [techSig, authSig] = await Promise.all([
      getSignatureBase64(item.calibration_executed_by),
      getSignatureBase64(item.certificate_authorized_by),
    ]);

    const sigY = Math.max(y, A4_H - 60);
    const colW = CONTENT_W / 2;

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");

    // Left: Teknisi
    doc.text("Dilaksanakan oleh,", M_LEFT, sigY);
    doc.text("Teknisi Kalibrasi", M_LEFT, sigY + 4.5);
    if (techSig) {
      try { doc.addImage(techSig, "PNG", M_LEFT, sigY + 6.5, 36, 18); } catch {}
    } else {
      doc.line(M_LEFT, sigY + 26, M_LEFT + 44, sigY + 26);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PT. Kemika Karya Pratama", M_LEFT, sigY + 30);

    // Right: Otorisasi
    const rX = M_LEFT + colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Disetujui oleh,", rX, sigY);
    doc.text("Manajer Lab", rX, sigY + 4.5);
    if (authSig) {
      try { doc.addImage(authSig, "PNG", rX, sigY + 6.5, 36, 18); } catch {}
    } else {
      doc.line(rX, sigY + 26, rX + 44, sigY + 26);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PT. Kemika Karya Pratama", rX, sigY + 30);
  }

  const fname = instruments.length === 1
    ? `Sertifikat-${instruments[0].certificate_number || instruments[0].id}.pdf`
    : `Sertifikat-${(receipt as any)?.spk_number || receiptId}.pdf`;

  doc.save(fname);
}
