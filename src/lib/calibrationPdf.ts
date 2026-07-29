import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

// ── page geometry ─────────────────────────────────────────────────────────────

const A4_W = 210;
const A4_H = 297;
const M_LEFT = 14;
// Right margin is wider than left to clear the pre-baked green corner
// decoration on the letterhead background so tables never bleed under it.
const M_RIGHT = 24;
const CONTENT_W = A4_W - M_LEFT - M_RIGHT;
const M_TOP = 39;
const M_BOTTOM = 38; // reserve room for kop surat footer (address block on bg)

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
  if (!bgData) return;
  // Inset background slightly so the pre-baked green corner decoration
  // (top-right) does not touch the paper edges. We shrink the image
  // uniformly on top/left/right and keep the bottom flush so the pre-baked
  // company address footer stays in place.
  const INSET = 4; // mm of whitespace around top/left/right edges
  doc.addImage(
    bgData,
    "JPEG",
    INSET,
    INSET,
    A4_W - INSET * 2,
    A4_H - INSET,
  );
  // Mask any residual bleed at the very top/right edges to guarantee
  // a clean white border around the decoration.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, A4_W, INSET, "F");
  doc.rect(A4_W - INSET, 0, INSET, A4_H, "F");
  doc.rect(0, 0, INSET, A4_H, "F");
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
      "id, instrument_name, instrument_brand_model, instrument_serial_number, measurement_range, calibration_method, sla_working_days, unit_price, description, created_at",
    )
    .eq("sales_order_id", receiptId)
    .eq("item_type", "calibration")
    .order("created_at", { ascending: true });

  const instruments = (rawItems || []).map((it: any, idx: number) => ({
    id: it.id,
    item_number: idx + 1,
    instrument_name: it.instrument_name ?? it.description ?? "-",
    brand_model: it.instrument_brand_model ?? null,
    serial_number: it.instrument_serial_number ?? null,
    measurement_range: it.measurement_range ?? null,
    calibration_method: it.calibration_method ?? null,
    sla_working_days: it.sla_working_days ?? null,
    unit_price: Number(it.unit_price ?? 0),
  }));

  const instrumentIds = instruments.map((item) => item.id).filter(Boolean);
  const sparePartsByInstrument = new Map<string, any[]>();
  if (instrumentIds.length > 0) {
    const { data: spareRows, error: spareErr } = await (supabase as any)
      .from("calibration_spare_parts")
      .select("id, instrument_id, qty_used, unit_price, notes, product:products(name, sku)")
      .in("instrument_id", instrumentIds)
      .order("created_at", { ascending: true });

    if (spareErr) {
      console.error("[generateSPKPdf] failed to load calibration spareparts:", spareErr);
    }

    (spareRows || []).forEach((part: any) => {
      if (!part.instrument_id) return;
      const current = sparePartsByInstrument.get(part.instrument_id) || [];
      current.push(part);
      sparePartsByInstrument.set(part.instrument_id, current);
    });
  }

  // 3. Assets
  const bgData = await imgToBase64("/kop-surat-bg.jpg");

  // 4. Build PDF
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addBg(doc, bgData);

  const customer = (receipt as any).customer;
  const taxRate = Number((receipt as any).tax_rate) || 11;
  const instrumentRows: any[][] = [];
  const sparepartRows: any[][] = [];
  let instrumentSubtotal = 0;
  let sparepartSubtotal = 0;
  let spNo = 0;
  (instruments || []).forEach((item) => {
    const instrumentPrice = Number(item.unit_price || 0);
    instrumentSubtotal += instrumentPrice;
    instrumentRows.push([
      String(item.item_number),
      item.instrument_name,
      item.brand_model || "-",
      item.serial_number || "-",
      item.calibration_method || "-",
      item.sla_working_days != null ? String(item.sla_working_days) : "-",
      fmt(instrumentPrice),
    ]);
    const spareParts = sparePartsByInstrument.get(item.id) || [];
    spareParts.forEach((part) => {
      spNo += 1;
      const qty = Number(part.qty_used || 0);
      const unitPrice = Number(part.unit_price || 0);
      const lineTotal = unitPrice * Math.max(qty, 1);
      sparepartSubtotal += lineTotal;
      const productName = part.product?.name || "Sparepart";
      const sku = part.product?.sku || "-";
      const nameCell = part.notes
        ? `${productName}\nuntuk alat: ${item.instrument_name}${part.notes ? ` — ${part.notes}` : ""}`
        : `${productName}\nuntuk alat: ${item.instrument_name}`;
      sparepartRows.push([
        String(spNo),
        sku,
        nameCell,
        String(qty || 1),
        "pcs",
        fmt(unitPrice),
        fmt(lineTotal),
      ]);
    });
  });
  const subtotal = instrumentSubtotal + sparepartSubtotal;
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

  // ── B. LINGKUP PEKERJAAN KALIBRASI (Instrumen) ──
  const hasSpareparts = sparepartRows.length > 0;
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [
      [{ content: "B.  LINGKUP PEKERJAAN KALIBRASI", colSpan: 7, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }],
      ["No.", "Nama / Jenis Alat", "Merk / Model", "No. Seri", "Metode Kalibrasi", "SLA (HK)", "Harga (Rp)"],
    ],
    body: [
      ...instrumentRows,
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

  // ── B.1  DAFTAR SPAREPART (produk gudang) ──
  if (hasSpareparts) {
    autoTable(doc, {
      startY: y,
      margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
      head: [
        [{ content: "B.1  DAFTAR SPAREPART TERKAIT", colSpan: 7, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }],
        ["No.", "Kode", "Nama Barang", "Jumlah", "Unit", "Harga (Rp)", "Sub Total (Rp)"],
      ],
      body: [
        ...sparepartRows,
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "middle" },
      headStyles: { fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold", halign: "center" },
      tableWidth: CONTENT_W,
      columnStyles: {
        0: { cellWidth: CONTENT_W * 0.06, halign: "center" },
        1: { cellWidth: CONTENT_W * 0.14, halign: "left" },
        2: { cellWidth: CONTENT_W * 0.36, halign: "left" },
        3: { cellWidth: CONTENT_W * 0.09, halign: "center" },
        4: { cellWidth: CONTENT_W * 0.08, halign: "center" },
        5: { cellWidth: CONTENT_W * 0.13, halign: "right" },
        6: { cellWidth: CONTENT_W * 0.14, halign: "right" },
      },
      didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
    });
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ── Total Keseluruhan ──
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    body: [
      [{ content: "Sub-Total", styles: { halign: "right", fontStyle: "bold" } }, { content: fmt(subtotal), styles: { halign: "right" } }],
      [{ content: `PPN ${taxRate}%`, styles: { halign: "right", fontStyle: "bold" } }, { content: fmt(taxAmount), styles: { halign: "right" } }],
      [{ content: "TOTAL", styles: { halign: "right", fontStyle: "bold", fillColor: [245, 247, 252] } }, { content: fmt(grandTotal), styles: { halign: "right", fontStyle: "bold", fillColor: [245, 247, 252] } }],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: CONTENT_W - 30, halign: "right" },
      1: { cellWidth: 30, halign: "right" },
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

  // ── Signatures: 3 columns — compact block, placed directly after T&C.
  // If it doesn't fit on the current page, move to next page but keep it
  // close to the top (not pushed to the bottom).
  const SIG_BLOCK_H = 28;
  if (y + SIG_BLOCK_H > A4_H - M_BOTTOM) {
    doc.addPage();
    addBg(doc, bgData);
    y = M_TOP;
  }
  const sigY = y + 3;
  const colW = CONTENT_W / 3;
  const sigLabels: [string, string][] = [
    ["Dibuat oleh", "Koordinator Administrasi"],
    ["Disetujui oleh", "Manajer Laboratorium"],
    ["Disetujui oleh", "(Pihak II — Pelanggan)"],
  ];
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  // outer frame (compact)
  doc.rect(M_LEFT, sigY - 3, CONTENT_W, SIG_BLOCK_H - 2);
  for (let i = 0; i < 3; i++) {
    const x = M_LEFT + colW * i;
    if (i > 0) doc.line(x, sigY - 3, x, sigY + SIG_BLOCK_H - 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(sigLabels[i][0], x + colW / 2, sigY, { align: "center" });
    // signature line
    doc.line(x + 8, sigY + SIG_BLOCK_H - 11, x + colW - 8, sigY + SIG_BLOCK_H - 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(sigLabels[i][1], x + colW / 2, sigY + SIG_BLOCK_H - 7, { align: "center" });
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
  let issuedCerts: any[] = [];

  // 1. Fetch SO header
  const { data: hdr } = await (supabase as any)
    .from("sales_order_headers")
    .select("id, sales_order_number, spk_number, calibration_received_at, service_location, customer:customers(name, address)")
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

  let { data: rawItems } = await q;
  if ((rawItems || []).some((it: any) => !it.certificate_number)) {
    const { data, error: issueError } = await (supabase as any).rpc(
      "issue_calibration_certificates",
      { p_so_id: receiptId },
    );
    if (issueError) {
      throw new Error(issueError.message || "Gagal menerbitkan nomor sertifikat");
    }
    issuedCerts = data || [];

    let reloadQ = (supabase as any)
      .from("sales_order_items")
      .select("*")
      .eq("sales_order_id", receiptId)
      .eq("item_type", "calibration")
      .order("created_at", { ascending: true });

    if (instrumentId) reloadQ = (reloadQ as any).eq("id", instrumentId);
    const { data: refreshedItems } = await reloadQ;
    rawItems = refreshedItems || rawItems;
  } else {
    issuedCerts = (rawItems || []).map((it: any) => ({
      item_id: it.id,
      certificate_number: it.certificate_number,
      certificate_issued_at: it.certificate_issued_at,
    }));
  }
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

  // 4. Build PDF — 2 pages per instrument (bilingual ID/EN)
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let idx = 0; idx < instruments.length; idx++) {
    const item = instruments[idx] as any;
    if (idx > 0) doc.addPage();
    addBg(doc, bgData);

    // Form code (top-right, above safe area)
    doc.setFontSize(FS.formCode);
    doc.setTextColor(110, 110, 110);
    doc.text("F-KAL-05", A4_W - M_RIGHT, 12, { align: "right" });
    doc.setTextColor(0, 0, 0);

    // ── Title (bilingual) ──
    let y = M_TOP;
    setFont(doc, "bold", 14);
    const titleId = "SERTIFIKAT KALIBRASI";
    doc.text(titleId, A4_W / 2, y, { align: "center" });
    // underline
    const tw = doc.getTextWidth(titleId);
    doc.setLineWidth(0.3);
    doc.line(A4_W / 2 - tw / 2, y + 1.2, A4_W / 2 + tw / 2, y + 1.2);
    y += 5.5;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Calibration Certificate", A4_W / 2, y, { align: "center" });
    y += 5;

    // ── Info Sertifikat table (2 label/value pairs per row) ──
    autoTable(doc, {
      startY: y,
      margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
      body: [
        [
          { content: "No. Sertifikat / Certificate No.", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
          item.certificate_number || "-",
          { content: "Halaman / Page", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
          "1 dari 2",
        ],
        [
          { content: "Tanggal Kalibrasi / Calibration Date", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
          fmtDate(item.calibration_date || item.certificate_issued_at),
          { content: "Tanggal Terbit / Issue Date", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
          fmtDate(item.certificate_issued_at),
        ],
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [180, 180, 180], lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 46 }, 1: { cellWidth: (CONTENT_W - 92) / 2 },
        2: { cellWidth: 46 }, 3: { cellWidth: (CONTENT_W - 92) / 2 },
      },
      didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    // ── Section A: IDENTITAS DAN SPESIFIKASI ALAT ──
    const customer = (receipt as any)?.customer;
    autoTable(doc, {
      startY: y,
      margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
      head: [[{ content: "A.  IDENTITAS DAN SPESIFIKASI ALAT YANG DIKALIBRASI  /  ITEM CALIBRATED", colSpan: 4, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
      body: [
        [
          { content: "Nama Alat / Instrument", styles: { fontStyle: "bold" } },
          item.instrument_name || "-",
          { content: "Pemohon / Customer", styles: { fontStyle: "bold" } },
          customer?.name || "-",
        ],
        [
          { content: "Model / Type", styles: { fontStyle: "bold" } },
          item.brand_model || item.instrument_brand_model || "-",
          { content: "Tgl Terima Alat / Received Date", styles: { fontStyle: "bold" } },
          fmtDate((receipt as any)?.calibration_received_at),
        ],
        [
          { content: "Rentang Ukur / Range", styles: { fontStyle: "bold" } },
          item.measurement_range || "-",
          { content: "No. SPK / Work Order", styles: { fontStyle: "bold" } },
          (receipt as any)?.spk_number || "-",
        ],
        [
          { content: "No. Seri / Serial No.", styles: { fontStyle: "bold" } },
          item.serial_number || "-",
          { content: "Lokasi Kalibrasi / Calibration at", styles: { fontStyle: "bold" } },
          (receipt as any)?.service_location || "-",
        ],
        [
          { content: "Merk / Manufacturer", styles: { fontStyle: "bold" } },
          { content: item.manufacturer || item.instrument_brand_model || "-", colSpan: 3 },
        ] as any,
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "middle" },
      columnStyles: {
        0: { cellWidth: 46 }, 1: { cellWidth: (CONTENT_W - 92) / 2 },
        2: { cellWidth: 46 }, 3: { cellWidth: (CONTENT_W - 92) / 2 },
      },
      didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    // ── Section B: REFERENSI METODE & STANDAR ──
    autoTable(doc, {
      startY: y,
      margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
      head: [[{ content: "B.  REFERENSI METODE & STANDAR  /  METHOD & STANDARDS REFERENCE", colSpan: 2, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
      body: [
        [{ content: "Metode Kalibrasi / Method", styles: { fontStyle: "bold" } }, item.calibration_method || item.standard_method || "-"],
        [{ content: "Gas yang digunakan / Calibration Gas used", styles: { fontStyle: "bold" } }, item.calibration_gas || "-"],
        [{ content: "Ketertelusuran / Traceability", styles: { fontStyle: "bold" } }, item.traceability || "-"],
        [
          { content: "Kondisi Ruang / Ambient", styles: { fontStyle: "bold" } },
          `Suhu: ${item.env_temperature != null ? item.env_temperature + " °C" : "-"}   |   Kelembaban: ${item.env_humidity != null ? item.env_humidity + " %RH" : "-"}`,
        ],
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "middle" },
      columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: CONTENT_W - 62 } },
      didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    // ── Section C: CEK VERIFIKASI HASIL KALIBRASI ──
    const verif = Array.isArray(item.verification_rows) && item.verification_rows.length
      ? item.verification_rows
      : [{ standard: item.standard_applied || "-", reading: item.monitoring_reading || "-", correction: item.correction ?? "0" }];

    autoTable(doc, {
      startY: y,
      margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
      head: [
        [{ content: "C.  CEK VERIFIKASI HASIL KALIBRASI  /  CALIBRATION RESULT VERIFICATION CHECK", colSpan: 4, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }],
        [
          { content: "No.", styles: { halign: "center" } },
          { content: "Standard Applied & Span Gas Set (PPM)", styles: { halign: "center" } },
          { content: "Monitoring Reading (PPM)", styles: { halign: "center" } },
          { content: "Correction", styles: { halign: "center" } },
        ],
      ],
      body: verif.map((r: any, i: number) => [
        { content: String(i + 1), styles: { halign: "center" } },
        { content: String(r.standard ?? "-"), styles: { halign: "center" } },
        { content: String(r.reading ?? "-"), styles: { halign: "center" } },
        { content: String(r.correction ?? "-"), styles: { halign: "center" } },
      ]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { fillColor: [235, 238, 245], textColor: 0, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 12 } },
      didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
    });
    y = (doc as any).lastAutoTable.finalY + 2;

    // Italic note
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("The result confirms that performance of the instrument is within acceptable limits.", M_LEFT, y + 3);
    doc.setFont("helvetica", "normal");
    doc.text("Hasil mengkonfirmasi bahwa kinerja instrumen berada dalam batas yang dapat diterima.", M_LEFT, y + 7);
    y += 10;

    // Additional info + next calibration
    autoTable(doc, {
      startY: y,
      margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
      body: [
        [
          { content: "Tambahan Informasi / Additional Information", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
          item.additional_information || "----",
        ],
        [
          { content: "Kalibrasi Selanjutnya / Next Calibration", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
          fmtDate(
            item.next_calibration_date ??
              (item.certificate_issued_at
                ? (() => {
                    const d = new Date(item.certificate_issued_at);
                    d.setFullYear(d.getFullYear() + 1);
                    return d.toISOString();
                  })()
                : null),
          ),
        ],
      ],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [180, 180, 180], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: CONTENT_W - 70 } },
      didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
    });

    // ─────────────── PAGE 2 ───────────────
    doc.addPage();
    addBg(doc, bgData);
    doc.setFontSize(FS.formCode);
    doc.setTextColor(110, 110, 110);
    doc.text("F-KAL-05", A4_W - M_RIGHT, 12, { align: "right" });
    doc.setTextColor(0, 0, 0);

    y = M_TOP;

    // Section D: PERNYATAAN KALIBRASI
    autoTable(doc, {
      startY: y,
      margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
      head: [[{ content: "D.  PERNYATAAN KALIBRASI  /  CALIBRATION STATEMENT", styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
      body: [[{
        content:
          "Sertifikat kalibrasi ini hanya berlaku untuk alat yang diidentifikasi di atas dan kondisi saat kalibrasi dilakukan. Sertifikat ini tidak boleh diperbanyak sebagian, kecuali secara lengkap, tanpa izin tertulis dari laboratorium.\n\nThis certificate relates only to the item identified above and at the time of calibration. It shall not be reproduced except in full without written approval of the laboratory.",
      }]],
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3, lineColor: [180, 180, 180], lineWidth: 0.2 },
      didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
    });
    y = (doc as any).lastAutoTable.finalY + 5;

    // Tempat & tanggal (center)
    const issueDate = fmtDate(item.certificate_issued_at || new Date().toISOString());
    setFont(doc, "bold", 10);
    doc.text(`Tangerang, ${issueDate}`, A4_W / 2, y, { align: "center" });
    y += 8;

    // Signatures — 3 columns
    const [techSig, checkSig, authSig] = await Promise.all([
      getSignatureBase64(item.calibration_executed_by),
      getSignatureBase64(item.calibration_checked_by),
      getSignatureBase64(item.certificate_authorized_by),
    ]);

    const SIG_H = 40;
    const availBottom = A4_H - M_BOTTOM;
    const sigY = Math.min(y, availBottom - SIG_H);
    const colW3 = CONTENT_W / 3;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.rect(M_LEFT, sigY, CONTENT_W, SIG_H);

    const sigCols: { title: string; role: string; sig: string | null }[] = [
      { title: "Dilaksanakan oleh", role: "Teknisi Kalibrasi", sig: techSig },
      { title: "Diperiksa & Disahkan oleh", role: "Koordinator Teknis", sig: checkSig },
      { title: "Diotorisasi oleh", role: "Manajer Laboratorium", sig: authSig },
    ];
    for (let i = 0; i < 3; i++) {
      const x = M_LEFT + colW3 * i;
      if (i > 0) doc.line(x, sigY, x, sigY + SIG_H);
      setFont(doc, "bold", FS.sigTitle);
      doc.text(sigCols[i].title, x + colW3 / 2, sigY + 5, { align: "center" });
      // sig box (image or empty)
      if (sigCols[i].sig) {
        try { doc.addImage(sigCols[i].sig!, "PNG", x + colW3 / 2 - 18, sigY + 8, 36, 18); } catch {}
      }
      if (i === 2) {
        // stamp text for authorized column
        doc.setTextColor(20, 120, 40);
        setFont(doc, "bold", 8);
        doc.text("PT. KEMIKA KARYA PRATAMA", x + colW3 / 2, sigY + 20, { align: "center" });
        doc.setTextColor(0, 0, 0);
      }
      // signature line
      doc.setDrawColor(120, 120, 120);
      doc.line(x + 8, sigY + SIG_H - 10, x + colW3 - 8, sigY + SIG_H - 10);
      setFont(doc, "normal", FS.sigRole);
      doc.text(sigCols[i].role, x + colW3 / 2, sigY + SIG_H - 5, { align: "center" });
    }
  }

  const fname = instruments.length === 1
    ? `Sertifikat-${instruments[0].certificate_number || instruments[0].id}.pdf`
    : `Sertifikat-${(receipt as any)?.spk_number || receiptId}.pdf`;

  // QR verifikasi di kanan bawah setiap halaman (sejajar footnote kop surat)
  try {
    const totalPages = doc.getNumberOfPages();
    const perInstrument = 2; // 2 pages per instrument
    for (let p = 1; p <= totalPages; p++) {
      const instIdx = Math.floor((p - 1) / perInstrument);
      const inst = instruments[instIdx];
      if (!inst?.certificate_number) continue;
      doc.setPage(p);
      const verifyUrl = `${window.location.origin}/verify/${encodeURIComponent(inst.certificate_number)}`;
      const qrData = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 200 });
      const qrSize = 16;
      const qrX = A4_W - M_RIGHT - qrSize;
      const qrY = A4_H - M_BOTTOM - qrSize + 2;
      doc.addImage(qrData, "PNG", qrX, qrY, qrSize, qrSize);
      setFont(doc, "normal", 6);
      doc.setTextColor(90, 90, 90);
      doc.text("Scan to verify", qrX + qrSize / 2, qrY + qrSize + 2.5, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }
  } catch (e) {
    console.error("QR footer generation failed:", e);
  }

  // Open preview in new tab
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) doc.save(fname);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return issuedCerts || [];
}

// ── BAST PDF — F-KAL-06 (Berita Acara Serah Terima Alat & Sertifikat) ────────

export async function generateBASTPdf(receiptId: string) {
  const { data: header, error } = await (supabase as any)
    .from("sales_order_headers")
    .select(`
      id, sales_order_number, spk_number, sales_name,
      calibration_received_at, service_pic_name, service_pic_phone,
      customer:customers(name, address, phone, pic)
    `)
    .eq("id", receiptId)
    .single();
  if (error || !header) throw new Error("Data SO kalibrasi tidak ditemukan");

  const { data: rawItems } = await (supabase as any)
    .from("sales_order_items")
    .select("instrument_name, instrument_brand_model, instrument_serial_number, description, certificate_number, created_at")
    .eq("sales_order_id", receiptId)
    .eq("item_type", "calibration")
    .order("created_at", { ascending: true });

  const instruments = (rawItems || []).map((it: any, idx: number) => ({
    no: idx + 1,
    name: it.instrument_name ?? it.description ?? "-",
    brand: it.instrument_brand_model ?? "-",
    serial: it.instrument_serial_number ?? "-",
    cert: it.certificate_number ?? "-",
  }));

  const bgData = await imgToBase64("/kop-surat-bg.jpg");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  addBg(doc, bgData);

  // Form code
  doc.setFontSize(FS.formCode);
  doc.setTextColor(110, 110, 110);
  doc.text("F-KAL-06", A4_W - M_RIGHT, 10, { align: "right" });
  doc.setTextColor(0, 0, 0);

  let y = M_TOP;
  setFont(doc, "bold", 12);
  doc.text("BERITA ACARA SERAH TERIMA ALAT & SERTIFIKAT", A4_W / 2, y, { align: "center" });
  y += 6;

  const today = new Date();
  const firstCert = instruments.find((i) => i.cert && i.cert !== "-")?.cert || "-";
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    body: [
      [
        { content: "No. Berita Acara", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        `LAB-BA-${format(today, "yyyyMMdd")}`,
        { content: "No. SPK Ref.", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        header.spk_number || "-",
      ],
      [
        { content: "Tgl Serah Terima", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        fmtDate(today.toISOString()),
        { content: "No. Sertifikat", styles: { fontStyle: "bold", fillColor: [245, 247, 252] } },
        firstCert,
      ],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 36 }, 1: { cellWidth: (CONTENT_W - 72) / 2 },
      2: { cellWidth: 36 }, 3: { cellWidth: (CONTENT_W - 72) / 2 },
    },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // A. PARA PIHAK
  const customer = header.customer;
  const salesName = header.sales_name || "______________________________";
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [[{ content: "A.  PARA PIHAK YANG TERLIBAT", colSpan: 2, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
    body: [[
      { content: `PIHAK PENYERAH — PT Kemika Karya Pratama\n\nNama    : ${salesName}\nJabatan : Sales / PIC Kalibrasi\nNo. HP  : ______________________________` },
      { content: `PIHAK PENERIMA — Pelanggan (${customer?.name || "-"})\n\nNama    : ${header.service_pic_name || customer?.pic || "______________________________"}\nJabatan : ______________________________\nNo. HP  : ${header.service_pic_phone || customer?.phone || "______________________________"}` },
    ]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "top", overflow: "linebreak", cellWidth: "wrap" },
    columnStyles: { 0: { cellWidth: CONTENT_W / 2 }, 1: { cellWidth: CONTENT_W / 2 } },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // B. DAFTAR ALAT DAN DOKUMEN — matches template columns (6 columns, drawn checkboxes)
  const BOX = 2.6; // mm
  const drawCheckboxHook = (rows: { label: string; note?: boolean }[]) => (data: any) => {
    if (data.section !== "body") return;
    const { cell } = data;
    const padX = 2;
    const padY = 2;
    const lineH = 4;
    rows.forEach((r, i) => {
      const cx = cell.x + padX;
      const cy = cell.y + padY + i * lineH;
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.25);
      doc.rect(cx, cy, BOX, BOX);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      const textY = cy + BOX - 0.4;
      const label = r.note
        ? "Ada catatan: ______________________"
        : r.label;
      doc.text(label, cx + BOX + 1.2, textY);
    });
  };
  const bColWidths = {
    0: 9,   // No
    1: 44,  // Nama
    2: 24,  // Serial
    3: 32,  // Cert
    4: 42,  // Kondisi
    5: 0,   // Paraf (fill remaining)
  } as Record<number, number>;
  bColWidths[5] = Math.max(15, CONTENT_W - (bColWidths[0] + bColWidths[1] + bColWidths[2] + bColWidths[3] + bColWidths[4]));
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [
      [{ content: "B.  DAFTAR ALAT DAN DOKUMEN YANG DISERAHKAN", colSpan: 6, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }],
      [
        { content: "No.", styles: { halign: "center" } },
        { content: "Nama / Jenis Alat", styles: { halign: "center" } },
        { content: "No. Seri", styles: { halign: "center" } },
        { content: "No. Sertifikat Kalibrasi", styles: { halign: "center" } },
        { content: "Kondisi Alat Saat Diserahkan", styles: { halign: "center" } },
        { content: "Paraf Penerima", styles: { halign: "center" } },
      ],
    ],
    body: (instruments.length ? instruments : [{ no: 1, name: "", serial: "", cert: "", brand: "" }, { no: 2, name: "", serial: "", cert: "", brand: "" } as any]).map((it) => [
      { content: String(it.no), styles: { halign: "center" } },
      it.name || "",
      it.serial || "",
      it.cert || "",
      { content: "", styles: { minCellHeight: 12 }, _kondisi: true } as any,
      { content: "", styles: { minCellHeight: 12 } },
    ]),
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "top", overflow: "linebreak" },
    tableWidth: CONTENT_W,
    tableLineWidth: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columnStyles: {
      0: { cellWidth: bColWidths[0], halign: "center" },
      1: { cellWidth: bColWidths[1] },
      2: { cellWidth: bColWidths[2] },
      3: { cellWidth: bColWidths[3] },
      4: { cellWidth: bColWidths[4] },
      5: { cellWidth: bColWidths[5] },
    } as any,
    headStyles: { fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold", halign: "center" },
    didDrawCell: (data: any) => {
      if (data.section === "body" && data.column.index === 4) {
        drawCheckboxHook([{ label: "Baik" }, { label: "", note: true }])(data);
      }
    },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // C. KELENGKAPAN DOKUMEN — drawn checkboxes to avoid missing glyphs / letter-spacing
  const kelengkapanLeft = [
    "Sertifikat Kalibrasi (asli)",
    "Sertifikat Kalibrasi (salinan digital / PDF)",
    "Alat dalam kondisi lengkap sesuai penerimaan",
  ];
  const kelengkapanRight = [
    "Laporan Teknis / Lembar Data (jika ada)",
    "Faktur / Invoice Pembayaran",
    "Aksesori / kelengkapan alat terlampir",
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [[{ content: "C.  KELENGKAPAN DOKUMEN", colSpan: 2, styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
    body: [[
      { content: kelengkapanLeft.map(() => " ").join("\n"), styles: { minCellHeight: kelengkapanLeft.length * 5.5 + 3 } },
      { content: kelengkapanRight.map(() => " ").join("\n") },
    ]],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.2, valign: "top", overflow: "linebreak" },
    tableWidth: CONTENT_W,
    columnStyles: { 0: { cellWidth: CONTENT_W / 2 }, 1: { cellWidth: CONTENT_W / 2 } },
    didDrawCell: (data: any) => {
      if (data.section !== "body") return;
      const items = data.column.index === 0 ? kelengkapanLeft : kelengkapanRight;
      const cell = data.cell;
      const startX = cell.x + 2.5;
      const startY = cell.y + 3;
      const lineH = 5.5;
      items.forEach((label, i) => {
        const cy = startY + i * lineH;
        doc.setDrawColor(60, 60, 60);
        doc.setLineWidth(0.25);
        doc.rect(startX, cy, BOX, BOX);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        const maxW = cell.width - 6 - BOX;
        const wrapped = doc.splitTextToSize(label, maxW);
        doc.text(wrapped, startX + BOX + 1.5, cy + BOX - 0.4);
      });
    },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // D. PERNYATAAN
  const pernyataan = [
    "Alat dan sertifikat kalibrasi telah diserahterimakan dengan baik dan lengkap.",
    "Pihak penerima telah memeriksa kondisi alat dan dokumen serta menyatakan sesuai.",
    "Keluhan atau klaim wajib disampaikan dalam 7 hari kalender sejak tanggal serah terima.",
    "Berita acara ini dibuat rangkap 2 (dua), masing-masing pihak memegang satu salinan yang sah.",
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [[{ content: "D.  PERNYATAAN SERAH TERIMA", styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
    body: [[pernyataan.map((t, i) => `${i + 1}. ${t}`).join("\n")]],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.2 },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  // Catatan / Kondisi Khusus
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    head: [[{ content: "Catatan / Kondisi Khusus", styles: { halign: "left", fillColor: [245, 247, 252], textColor: 0, fontStyle: "bold" } }]],
    body: [[{ content: "\n\n", styles: { minCellHeight: 18 } }]],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.2 },
    didDrawPage: (data) => { if (data.pageNumber > 1) addBg(doc, bgData); },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Signatures: 2 columns
  const SIG_H = 26;
  if (y + SIG_H > A4_H - M_BOTTOM) {
    doc.addPage();
    addBg(doc, bgData);
    y = M_TOP;
  }
  // Keep signatures close to statement (like SPK), not pinned to bottom
  const sigY = y;
  const colW = CONTENT_W / 2;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.rect(M_LEFT, sigY - 3, CONTENT_W, SIG_H - 2);
  doc.line(M_LEFT + colW, sigY - 3, M_LEFT + colW, sigY + SIG_H - 5);
  const sigLabels: [string, string][] = [
    ["Diserahkan oleh", `PT Kemika Karya Pratama\n(${salesName})`],
    ["Diterima oleh", `${customer?.name || "Pelanggan"}\n(${header.service_pic_name || customer?.pic || "Pelanggan / PIC"})`],
  ];
  for (let i = 0; i < 2; i++) {
    const x = M_LEFT + colW * i;
    setFont(doc, "bold", FS.sigTitle);
    doc.text(sigLabels[i][0], x + colW / 2, sigY, { align: "center" });
    doc.line(x + 8, sigY + SIG_H - 11, x + colW - 8, sigY + SIG_H - 11);
    setFont(doc, "normal", FS.sigRole);
    const lines = sigLabels[i][1].split("\n");
    lines.forEach((ln, li) => {
      doc.text(ln, x + colW / 2, sigY + SIG_H - 7 + li * 3.6, { align: "center" });
    });
  }

  const filename = `BAST-${header.spk_number || header.sales_order_number || receiptId}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) doc.save(filename);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
