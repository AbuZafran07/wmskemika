import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FlaskConical, X, Send, Loader2, CheckSquare, Square,
  MapPin, Phone, User, CalendarDays, FileText, Download,
  Plus, Trash2, Package, MessageSquare, Printer, AtSign,
  Paperclip, Upload, Receipt,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  COLUMN_DEFS,
  COLUMN_CHECKLISTS,
  computeKalibrasiColumn,
  KalibrasiV2Checklist,
  canToggleChecklistKey,
  FINANCE_CHECKLIST_ROLES,
} from "@/hooks/useTrackerKalibrasi";
import { useProducts } from "@/hooks/useMasterData";
import { generateSPKPdf, generateCertificatePdf, generateBASTPdf } from "@/lib/calibrationPdf";
import { printCalibrationSparepartRequest } from "@/lib/calibrationSparepartRequestPdf";
import CalibrationLabelPicker from "./CalibrationLabelPicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  generateUniquePINumber,
  calculateMaterai,
  useMateraiSetting,
} from "@/hooks/useProformaInvoices";
import { useNavigate } from "react-router-dom";

// ─── types ────────────────────────────────────────────────────────────────────

interface ReceiptDetail {
  id: string;
  receipt_number: string;
  customer_po_number: string | null;
  spk_number: string | null;
  spk_issued_at: string | null;
  spk_signed_at: string | null;
  spk_confirmed_at: string | null;
  payment_verified_at: string | null;
  status: string;
  so_status: string | null;
  spk_confirmed_file_url: string | null;
  spk_confirmed_file_name: string | null;
  archived: boolean;
  received_date: string;
  target_completion_date: string | null;
  service_location: string | null;
  service_pic_name: string | null;
  service_pic_phone: string | null;
  customer_request_notes: string | null;
  created_at: string;
  created_by: string | null;
  sales_name: string | null;
  allocation_type: string | null;
  project_instansi: string | null;
  customer: { id: string; name: string; code: string; pic: string | null; phone: string | null; address: string | null } | null;
}

interface InstrumentDetail {
  id: string;
  item_number: number;
  instrument_name: string;
  brand_model: string | null;
  serial_number: string | null;
  measurement_range: string | null;
  calibration_method: string | null;
  unit_price: number;
  sla_working_days: number | null;
  feasibility_status: string | null;
  calibration_conclusion: string | null;
  certificate_number: string | null;
}

interface SparePart {
  id: string;
  instrument_id: string;
  product_id: string;
  qty_used: number;
  unit_price: number;
  notes: string | null;
  stock_issued: boolean;
  stock_issued_at: string | null;
  created_at: string;
  // joined
  instrument_name?: string;
  product_name?: string;
  product_sku?: string | null;
}

interface KomComment {
  id: string;
  calibration_receipt_id: string;
  user_id: string;
  message: string;
  type: string;
  created_at: string;
  user_name?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRupiah(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v || 0);
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), "dd MMM yyyy", { locale: idLocale }); } catch { return d; }
}

function fmtDateTime(d: string | null) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMM yyyy, HH:mm", { locale: idLocale }); } catch { return d; }
}

function isValidDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const text = String(value).trim();

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    return isValidDateParts(year, month, day) ? `${y}-${m}-${d}` : "";
  }

  const idMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (idMatch) {
    const [, d, m, y] = idMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!isValidDateParts(year, month, day)) return "";
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

function isValidDateInputValue(value?: string | null) {
  return toDateInputValue(value) !== "";
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  spk_issued: "SPK Diterbitkan",
  spk_signed: "SPK TTD",
  converted_to_so: "Converted SO",
  cancelled: "Dibatalkan",
};

const FEASIBILITY_CFG: Record<string, { label: string; className: string }> = {
  pending:      { label: "Menunggu",    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  feasible:     { label: "Layak",       className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  not_feasible: { label: "Tidak Layak", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

function getBoardColumn(checklists: KalibrasiV2Checklist[], status?: string | null) {
  const id = computeKalibrasiColumn(checklists, status);
  return COLUMN_DEFS.find((c) => c.id === id);
}

function FeasibilityBadge({ status }: { status: string | null }) {
  const cfg = FEASIBILITY_CFG[status ?? "pending"] ?? FEASIBILITY_CFG.pending;
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.className)}>{cfg.label}</span>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{children}</h3>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "-"}</span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  receiptId: string | null;
  checklists: KalibrasiV2Checklist[];
  canToggle: boolean;
  onToggle: (receiptId: string, key: string) => void;
  onSetReceivedDate?: (receiptId: string, dateISO: string | null) => void;
  onSetSpkConfirmedDate?: (receiptId: string, dateISO: string | null) => void;
  onSetPaymentDate?: (receiptId: string, dateISO: string | null) => void;
  onSetDecision?: (receiptId: string, decision: 'accepted' | 'rejected') => void;
  onClose: () => void;
}

export default function TrackerKalibrasiCardDetail({
  receiptId,
  checklists,
  canToggle,
  onToggle,
  onSetReceivedDate,
  onSetSpkConfirmedDate,
  onSetPaymentDate,
  onSetDecision,
  onClose,
}: Props) {
  const { user } = useAuth();
  const { products } = useProducts();

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [instruments, setInstruments] = useState<InstrumentDetail[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [comments, setComments] = useState<KomComment[]>([]);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<"spk" | "cert" | "bast" | null>(null);

  // Kunci penambahan alat/sparepart ketika kartu sudah di kolom Completed atau Delivered
  const currentColumnId = getBoardColumn(checklists, receipt?.status)?.id;
  const isCardLocked = currentColumnId === 'completed' || currentColumnId === 'delivered';

  // ── document generation history ─────────────────────────────────────────
  type DocLog = {
    id: string;
    document_type: 'spk' | 'certificate' | 'bast';
    document_number: string | null;
    file_url: string | null;
    generated_by_email: string | null;
    created_at: string;
  };
  const [docLogs, setDocLogs] = useState<DocLog[]>([]);

  // ── attachments ─────────────────────────────────────────────────────────
  type Attachment = {
    id: string;
    file_key: string;
    url: string;
    file_name: string | null;
    mime_type: string | null;
    file_size: number | null;
    uploaded_by: string | null;
    uploaded_at: string;
    uploader_name?: string;
  };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // spare parts add form
  const [addingPart, setAddingPart] = useState(false);
  const [newPart, setNewPart] = useState({ instrument_id: "", product_id: "", qty_used: "1", unit_price: "0", notes: "" });
  const [selectedProductStock, setSelectedProductStock] = useState<number | null>(null);

  // instrument add form (inline)
  const [addingInstrument, setAddingInstrument] = useState(false);
  const [newInstrument, setNewInstrument] = useState({
    instrument_name: "",
    brand_model: "",
    serial_number: "",
    measurement_range: "",
    calibration_method: "",
    unit_price: "0",
    sla_working_days: "5",
  });
  const [savingInstrument, setSavingInstrument] = useState(false);

  const commentEndRef = useRef<HTMLDivElement>(null);
  const receivedDateInputRef = useRef<HTMLInputElement>(null);
  const spkConfirmedDateInputRef = useRef<HTMLInputElement>(null);

  // ── Proforma Invoice (PI) generation ────────────────────────────────────
  const navigate = useNavigate();
  const { data: materaiAmount = 10000 } = useMateraiSetting();
  const [generatingPI, setGeneratingPI] = useState(false);
  const [existingPI, setExistingPI] = useState<string | null>(null);
  const [cardLabelNames, setCardLabelNames] = useState<string[]>([]);
  const [customerPaymentTerms, setCustomerPaymentTerms] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [showDpTerminDialog, setShowDpTerminDialog] = useState(false);
  const [dpPercentInput, setDpPercentInput] = useState<string>("30");
  const [termDaysInput, setTermDaysInput] = useState<string>("30");

  // ── fetch receipt + instruments ─────────────────────────────────────────

  const fetchReceipt = useCallback(async () => {
    if (!receiptId) { setReceipt(null); setInstruments([]); setSpareParts([]); return; }
    setLoadingReceipt(true);
      const [{ data: hdr }, { data: items }] = await Promise.all([
        (supabase as any)
          .from("sales_order_headers")
          .select(`
            id, sales_order_number, customer_po_number, spk_number, spk_issued_at,
            calibration_status, status, calibration_received_at,
            target_completion_date, service_location, service_pic_name,
            service_pic_phone, customer_request_notes, created_at, created_by, spk_confirmed_at,
            payment_verified_at,
            sales_name, allocation_type, project_instansi,
            spk_confirmed_file_url, spk_confirmed_file_name,
            customer:customers(id, name, code, pic, phone, address)
          `)
          .eq("id", receiptId)
          .single(),
        (supabase as any)
          .from("sales_order_items")
          .select(`
            id, ordered_qty, unit_price, instrument_name,
            instrument_brand_model, instrument_serial_number,
            measurement_range, calibration_method, sla_working_days,
            feasibility_status, feasibility_notes, certificate_number,
            description, item_type, created_at
          `)
          .eq("sales_order_id", receiptId)
          .eq("item_type", "calibration")
          .order("created_at", { ascending: true }),
      ]);

      const rawItems = (items || []) as Record<string, any>[];
      const instList: InstrumentDetail[] = rawItems.map((it, idx) => ({
        id: it.id,
        item_number: idx + 1,
        instrument_name: it.instrument_name ?? it.description ?? "-",
        brand_model: it.instrument_brand_model ?? null,
        serial_number: it.instrument_serial_number ?? null,
        measurement_range: it.measurement_range ?? null,
        calibration_method: it.calibration_method ?? null,
        unit_price: Number(it.unit_price ?? 0),
        sla_working_days: it.sla_working_days ?? null,
        feasibility_status: it.feasibility_status ?? null,
        calibration_conclusion: null,
        certificate_number: it.certificate_number ?? null,
      }));

      const h = (hdr as Record<string, any>) ?? null;
      const mapped: ReceiptDetail | null = h
        ? {
            id: h.id,
            receipt_number: h.sales_order_number ?? "-",
            customer_po_number: h.customer_po_number ?? null,
            spk_number: h.spk_number ?? null,
            spk_issued_at: h.spk_issued_at ?? null,
            spk_signed_at: null,
            spk_confirmed_at: h.spk_confirmed_at ?? null,
            payment_verified_at: h.payment_verified_at ?? null,
            status: h.calibration_status ?? h.status ?? "draft",
            so_status: h.status ?? null,
            spk_confirmed_file_url: h.spk_confirmed_file_url ?? null,
            spk_confirmed_file_name: h.spk_confirmed_file_name ?? null,
            archived: false,
            received_date: h.calibration_received_at
              ? String(h.calibration_received_at).slice(0, 10)
              : "",
            target_completion_date: h.target_completion_date ?? null,
            service_location: h.service_location ?? null,
            service_pic_name: h.service_pic_name ?? null,
            service_pic_phone: h.service_pic_phone ?? null,
            customer_request_notes: h.customer_request_notes ?? null,
            created_at: h.created_at,
            created_by: h.created_by ?? null,
            sales_name: h.sales_name ?? null,
            allocation_type: h.allocation_type ?? null,
            project_instansi: h.project_instansi ?? null,
            customer: h.customer ?? null,
          }
        : null;

      setReceipt(mapped);
      setInstruments(instList);

      // auto-select instrument for spare parts if only one
      if (instList.length === 1) {
        setNewPart(p => ({ ...p, instrument_id: instList[0].id }));
      }

      // fetch spare parts (join product name + sku)
      if (instList.length > 0) {
        const ids = instList.map(i => i.id);
        const { data: spData } = await (supabase as any)
          .from("calibration_spare_parts")
          .select("*, product:products(name, sku)")
          .in("instrument_id", ids)
          .order("created_at", { ascending: false });

        setSpareParts(
          (spData || []).map((p: Record<string, unknown>) => ({
            ...p,
            instrument_name: instList.find(i => i.id === p.instrument_id)?.instrument_name ?? "-",
            product_name: (p.product as { name?: string } | null)?.name ?? "-",
            product_sku: (p.product as { sku?: string } | null)?.sku ?? null,
            stock_issued: !!(p as { issued_stock_out_id?: string | null }).issued_stock_out_id,
          })) as SparePart[]
        );
      }

      setLoadingReceipt(false);
  }, [receiptId]);

  useEffect(() => { fetchReceipt(); }, [fetchReceipt]);

  // refetch header when checklists change (e.g. spk_issued auto-issues SPK number)
  const spkIssuedChecked = checklists.some((c) => c.checklist_key === 'spk_issued' && c.is_checked);
  useEffect(() => {
    if (!receiptId) return;
    // Refetch immediately and again shortly after, in case the auto-issue
    // header update lands after the checklist row is written.
    fetchReceipt();
    if (spkIssuedChecked) {
      const t1 = setTimeout(() => fetchReceipt(), 400);
      const t2 = setTimeout(() => fetchReceipt(), 1500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spkIssuedChecked]);

  // realtime: update local receipt when header row changes
  useEffect(() => {
    if (!receiptId) return;
    const ch = supabase
      .channel(`kal-header-${receiptId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sales_order_headers', filter: `id=eq.${receiptId}` }, () => fetchReceipt())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [receiptId, fetchReceipt]);

  // ── fetch customer payment terms & existing PI for this SO ──────────────
  useEffect(() => {
    if (!receiptId) {
      setCustomerPaymentTerms(null);
      setCustomerType(null);
      setExistingPI(null);
      return;
    }
    (async () => {
      const { data: so } = await (supabase as any)
        .from('sales_order_headers')
        .select('customer_id')
        .eq('id', receiptId)
        .maybeSingle();
      if (so?.customer_id) {
        const { data: cust } = await (supabase as any)
          .from('customers')
          .select('terms_payment, customer_type')
          .eq('id', so.customer_id)
          .maybeSingle();
        setCustomerPaymentTerms(cust?.terms_payment ?? null);
        setCustomerType(cust?.customer_type ?? null);
      }
      const { data: piData } = await (supabase as any)
        .from('proforma_invoices')
        .select('id, pi_number, status')
        .eq('sales_order_id', receiptId)
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .order('created_at', { ascending: false })
        .limit(1);
      setExistingPI(piData && piData.length > 0 ? piData[0].pi_number : null);
    })();
  }, [receiptId]);

  // ── fetch calibration labels attached to this card (for CBD/DP+Termin detection) ──
  const fetchCardLabels = useCallback(async () => {
    if (!receiptId) { setCardLabelNames([]); return; }
    const { data: cardLabels } = await (supabase as any)
      .from('calibration_card_labels')
      .select('label_id')
      .eq('sales_order_id', receiptId);
    const ids = ((cardLabels as any[]) || []).map((c) => c.label_id);
    if (ids.length === 0) { setCardLabelNames([]); return; }
    const { data: labels } = await (supabase as any)
      .from('calibration_labels')
      .select('name')
      .in('id', ids);
    setCardLabelNames(((labels as any[]) || []).map((l) => (l.name || '').toUpperCase()));
  }, [receiptId]);

  useEffect(() => { fetchCardLabels(); }, [fetchCardLabels]);

  useEffect(() => {
    if (!receiptId) return;
    const ch = supabase
      .channel(`kal-card-labels-${receiptId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_card_labels', filter: `sales_order_id=eq.${receiptId}` }, () => fetchCardLabels())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_labels' }, () => fetchCardLabels())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [receiptId, fetchCardLabels]);

  const handleGeneratePI = useCallback(async (opts?: { dpPercent?: number; termDays?: number; paymentNote?: string }) => {
    if (!receiptId || !user) return;
    setGeneratingPI(true);
    try {
      const { data: soHeader } = await (supabase as any)
        .from('sales_order_headers')
        .select('*')
        .eq('id', receiptId)
        .single();
      if (!soHeader) throw new Error('Sales Order tidak ditemukan');

      const { data: soItems } = await (supabase as any)
        .from('sales_order_items')
        .select('*, product:products(name)')
        .eq('sales_order_id', receiptId);
      if (!soItems || soItems.length === 0) throw new Error('Item Sales Order tidak ditemukan');

      // Ambil sparepart kalibrasi (per instrument dalam SO ini) untuk ikut ditagih di PI
      const calibrationItems = (soItems as any[]).filter(
        (it: any) => (it.item_type || 'product') === 'calibration',
      );
      const instrumentIds = calibrationItems.map((it: any) => it.id);
      let spareParts: any[] = [];
      if (instrumentIds.length > 0) {
        const { data: sp, error: spErr } = await (supabase as any)
          .from('calibration_spare_parts')
          .select('id, instrument_id, qty_used, unit_price, notes, product:products(id, name, sku)')
          .in('instrument_id', instrumentIds);
        if (spErr) throw spErr;
        spareParts = sp || [];
      }
      const sparePartsByInstrument = spareParts.reduce<Record<string, any[]>>((acc, sp: any) => {
        (acc[sp.instrument_id] ||= []).push(sp);
        return acc;
      }, {});

      const { data: cust } = await (supabase as any)
        .from('customers')
        .select('*')
        .eq('id', soHeader.customer_id)
        .single();

      const piNumber = await generateUniquePINumber();
      const discount = soHeader.discount || 0;
      const shippingCost = soHeader.shipping_cost || 0;

      // Susun baris PI: alat diikuti sparepart-nya, agar rapi per alat di PDF
      const piItemsData: any[] = [];
      let sparePartsInserted = 0;
      for (const item of soItems as any[]) {
        const baseAmount = (item.ordered_qty || 0) * (item.unit_price || 0);
        const itemDiscount = item.discount || 0;
        const instrumentLabel =
          item.instrument_name || item.description || (item.product as any)?.name || 'Kalibrasi';
        piItemsData.push({
          product_id: item.product_id,
          product_name: instrumentLabel,
          qty: item.ordered_qty,
          unit_price: item.unit_price,
          discount: itemDiscount,
          subtotal: Math.round(baseAmount - itemDiscount),
        });
        const sps = sparePartsByInstrument[item.id] || [];
        for (const sp of sps) {
          const qty = Number(sp.qty_used || 0);
          const price = Number(sp.unit_price || 0);
          piItemsData.push({
            product_id: sp.product?.id ?? null,
            product_name: sp.product?.name ?? '-',
            qty,
            unit_price: price,
            discount: 0,
            subtotal: Math.round(qty * price),
            notes: sp.notes ?? null,
          });
          sparePartsInserted++;
        }
      }
      // Validasi: pastikan semua sparepart terkait alat SO ini masuk PI
      if (sparePartsInserted !== spareParts.length) {
        throw new Error(
          `Validasi sparepart gagal: ${sparePartsInserted}/${spareParts.length} sparepart berhasil dimasukkan ke PI. Silakan coba lagi.`,
        );
      }

      const dpp = piItemsData.reduce((sum: number, it: any) => sum + it.subtotal, 0);
      const dppPengganti = Math.round(dpp * 11 / 12);
      const taxAmount = Math.round(dppPengganti * 0.12);
      const materai = calculateMaterai(cust?.customer_type, dpp, shippingCost, taxAmount, materaiAmount);
      const grandTotal = Math.round(dpp + shippingCost + taxAmount + materai);

      const { data: piInserted, error: piError } = await (supabase as any)
        .from('proforma_invoices')
        .insert({
          pi_number: piNumber,
          sales_order_id: receiptId,
          customer_id: soHeader.customer_id,
          delivery_request_id: null,
          subtotal: dpp,
          discount,
          tax_rate: 12,
          tax_amount: taxAmount,
          shipping_cost: shippingCost,
          other_costs: 0,
          materai_amount: materai,
          grand_total: grandTotal,
          customer_type: cust?.customer_type,
          payment_terms: cust?.terms_payment,
          status: 'pending',
          notes: null,
          created_by: user.id,
          dp_percent: opts?.dpPercent ?? null,
          term_days: opts?.termDays ?? null,
          payment_note: opts?.paymentNote ?? null,
        })
        .select('id')
        .single();
      if (piError) throw piError;

      const piItems = piItemsData.map((it: any) => ({ ...it, proforma_invoice_id: piInserted.id }));
      const { error: itemsError } = await (supabase as any)
        .from('proforma_invoice_items')
        .insert(piItems);
      if (itemsError) throw itemsError;

      await (supabase as any).from('audit_logs').insert({
        user_id: user.id,
        user_email: user.email,
        action: 'create',
        module: 'proforma_invoice',
        ref_id: piInserted.id,
        ref_no: piNumber,
        ref_table: 'proforma_invoices',
      });

      setExistingPI(piNumber);
      toast.success(`Proforma Invoice ${piNumber} berhasil dibuat!`);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal generate Proforma Invoice');
    } finally {
      setGeneratingPI(false);
    }
  }, [receiptId, user, materaiAmount]);

  // ── document generation history ─────────────────────────────────────────
  const fetchDocLogs = useCallback(async () => {
    if (!receiptId) { setDocLogs([]); return; }
    const { data, error } = await (supabase as any)
      .from('calibration_document_logs')
      .select('id, document_type, document_number, file_url, generated_by_email, created_at')
      .eq('sales_order_id', receiptId)
      .order('created_at', { ascending: false });
    if (!error) setDocLogs((data || []) as DocLog[]);
  }, [receiptId]);

  useEffect(() => { fetchDocLogs(); }, [fetchDocLogs]);

  useEffect(() => {
    if (!receiptId) return;
    const ch = supabase
      .channel(`kal-doc-logs-${receiptId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_document_logs', filter: `sales_order_id=eq.${receiptId}` }, fetchDocLogs)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [receiptId, fetchDocLogs]);

  const logCalibrationDoc = useCallback(async (
    docType: 'spk' | 'certificate' | 'bast',
    docNumber: string | null,
  ) => {
    if (!receiptId || !user?.id) return;
    try {
      await (supabase as any).from('calibration_document_logs').insert({
        sales_order_id: receiptId,
        document_type: docType,
        document_number: docNumber,
        generated_by: user.id,
        generated_by_email: user.email ?? null,
      });
      await (supabase as any).from('audit_logs').insert({
        user_id: user.id,
        user_email: user.email ?? null,
        action: 'generate_document',
        module: 'tracker-kalibrasi',
        ref_table: 'sales_order_headers',
        ref_id: receiptId,
        ref_no: docNumber || receipt?.spk_number || receipt?.receipt_number || null,
        new_data: { document_type: docType, document_number: docNumber },
      });
    } catch (e) {
      console.error('logCalibrationDoc error:', e);
    }
  }, [receiptId, user?.id, user?.email, receipt?.spk_number, receipt?.receipt_number]);

  // ── attachments fetch/upload/delete ────────────────────────────────────
  const fetchAttachments = useCallback(async () => {
    if (!receiptId) { setAttachments([]); return; }
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("ref_table", "sales_order_headers")
      .eq("ref_id", receiptId)
      .eq("module_name", "tracker-kalibrasi")
      .order("uploaded_at", { ascending: false });
    if (!data) { setAttachments([]); return; }
    const userIds = [...new Set(data.map((a: any) => a.uploaded_by).filter(Boolean))] as string[];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as any[] };
    const withUrls = await Promise.all(data.map(async (a: any) => {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(a.file_key, 1800);
      return {
        ...a,
        url: signed?.signedUrl || a.url,
        uploader_name: profiles?.find((p: any) => p.id === a.uploaded_by)?.full_name || "Unknown",
      } as Attachment;
    }));
    setAttachments(withUrls);
  }, [receiptId]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  useEffect(() => {
    if (!receiptId) return;
    const ch = supabase
      .channel(`kal-attachments-${receiptId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `ref_id=eq.${receiptId}` }, fetchAttachments)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [receiptId, fetchAttachments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !receiptId || !user) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 10MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploadingFile(true);
    try {
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `calibration/${receiptId}/${Date.now()}_${sanitized}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(fileKey, file);
      if (upErr) throw upErr;
      const { data: urlData } = await supabase.storage.from("documents").createSignedUrl(fileKey, 1800);
      const { error: insErr } = await supabase.from("attachments").insert({
        ref_table: "sales_order_headers",
        ref_id: receiptId,
        module_name: "tracker-kalibrasi",
        file_key: fileKey,
        url: urlData?.signedUrl || fileKey,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
        file_name: file.name,
      });
      if (insErr) throw insErr;
      toast.success("File berhasil diupload");
      fetchAttachments();
    } catch (err: any) {
      toast.error("Gagal upload: " + (err?.message || 'unknown'));
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadAttachment = async (att: Attachment) => {
    try {
      const { data, error } = await supabase.storage.from("documents").download(att.file_key);
      if (error || !data) throw error || new Error("Gagal download");
      const objectUrl = URL.createObjectURL(data);
      const fileName = att.file_name || att.file_key.split("/").pop() || "attachment";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(att.url, "_blank", "noopener,noreferrer");
    }
  };

  const handleDeleteAttachment = async (att: Attachment) => {
    if (!confirm(`Hapus file "${att.file_name || 'attachment'}"?`)) return;
    try {
      await supabase.storage.from("documents").remove([att.file_key]);
      const { error } = await supabase.from("attachments").delete().eq("id", att.id);
      if (error) throw error;
      toast.success("File dihapus");
      fetchAttachments();
    } catch (e: any) {
      toast.error("Gagal menghapus: " + (e?.message || 'unknown'));
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── fetch comments ──────────────────────────────────────────────────────

  const fetchComments = useCallback(async () => {
    if (!receiptId) return;
    setLoadingComments(true);
    const { data, error } = await (supabase as any)
      .from("calibration_tracker_comments")
      .select("*")
      .eq("sales_order_id", receiptId)
      .order("created_at", { ascending: true });

    if (error) { toast.error("Gagal memuat komentar"); setLoadingComments(false); return; }

    const rawComments = (data || []) as KomComment[];
    const userIds = [...new Set(rawComments.map((c) => c.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_chat_view")
        .select("id, full_name")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));
      setComments(rawComments.map((c) => ({ ...c, user_name: profileMap.get(c.user_id) ?? "Pengguna" })));
    } else {
      setComments(rawComments);
    }
    setLoadingComments(false);
  }, [receiptId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  useEffect(() => {
    if (!receiptId) return;
    const ch = supabase
      .channel(`kal-comments-${receiptId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calibration_tracker_comments", filter: `sales_order_id=eq.${receiptId}` }, fetchComments)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [receiptId, fetchComments]);

  useEffect(() => {
    commentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // ── send comment ────────────────────────────────────────────────────────

  const sendComment = async () => {
    if (!newComment.trim() || !user?.id || !receiptId) return;
    setSending(true);
    const { error } = await (supabase as any).from("calibration_tracker_comments").insert({
      sales_order_id: receiptId,
      user_id: user.id,
      message: newComment.trim(),
      type: "comment",
    });
    setSending(false);
    if (error) { toast.error("Gagal kirim komentar"); return; }
    setNewComment("");
  };

  // ── spare parts CRUD ────────────────────────────────────────────────────

  const addSparePart = async () => {
    if (!newPart.product_id || !newPart.instrument_id) {
      toast.error("Pilih produk dan pilih alat");
      return;
    }

    const qty = parseInt(newPart.qty_used) || 1;
    const product = products.find(p => p.id === newPart.product_id);

    // 1. Cek stok tersedia
    const { data: batches, error: batchErr } = await supabase
      .from("inventory_batches")
      .select("qty_on_hand")
      .eq("product_id", newPart.product_id)
      .gt("qty_on_hand", 0);

    if (batchErr) { toast.error("Gagal cek stok"); return; }

    const totalStock = (batches || []).reduce((s, b) => s + b.qty_on_hand, 0);
    if (totalStock < qty) {
      toast.warning(`Stok kurang (tersedia ${totalStock}). Item tetap disimpan — buat Form Permintaan Sparepart untuk pengadaan.`);
    }

    // 2. Simpan spare part — jika stok kurang, tindak lanjut via Form Permintaan Sparepart
    const { data, error } = await (supabase as any)
      .from("calibration_spare_parts")
      .insert({
        instrument_id: newPart.instrument_id,
        product_id: newPart.product_id,
        qty_used: qty,
        unit_price: parseFloat(newPart.unit_price) || 0,
        notes: newPart.notes.trim() || null,
        created_by: user?.id ?? null,
      })
      .select("*, product:products(name, sku)")
      .single();

    if (error) { toast.error("Gagal tambah spare part"); return; }

    const raw = data as Record<string, unknown>;
    setSpareParts(prev => [
      {
        ...raw,
        instrument_name: instruments.find(i => i.id === newPart.instrument_id)?.instrument_name ?? "-",
        product_name: (raw.product as { name?: string } | null)?.name ?? product?.name ?? "-",
        product_sku: (raw.product as { sku?: string } | null)?.sku ?? null,
      } as SparePart,
      ...prev,
    ]);
    setNewPart({ instrument_id: newPart.instrument_id, product_id: "", qty_used: "1", unit_price: "0", notes: "" });
    setSelectedProductStock(null);
    setAddingPart(false);
    toast.success("Spare part dicatat. Warehouse dapat memproses pengeluaran stok di menu Stock Out → Kalibrasi.");
  };

  const deleteSparePart = async (id: string) => {
    const { error } = await (supabase as any).from("calibration_spare_parts").delete().eq("id", id);
    if (error) { toast.error("Gagal hapus spare part"); return; }
    setSpareParts(prev => prev.filter(p => p.id !== id));
  };

  // ── instrument CRUD (inline) ────────────────────────────────────────────

  const addInstrument = async () => {
    if (!receiptId) return;
    if (!newInstrument.instrument_name.trim()) {
      toast.error("Nama alat wajib diisi");
      return;
    }
    setSavingInstrument(true);
    try {
      const { data, error } = await (supabase as any)
        .from("sales_order_items")
        .insert({
          sales_order_id: receiptId,
          item_type: "calibration",
          product_id: null,
          ordered_qty: 1,
          unit_price: parseFloat(newInstrument.unit_price) || 0,
          instrument_name: newInstrument.instrument_name.trim(),
          instrument_brand_model: newInstrument.brand_model.trim() || null,
          instrument_serial_number: newInstrument.serial_number.trim() || null,
          measurement_range: newInstrument.measurement_range.trim() || null,
          calibration_method: newInstrument.calibration_method.trim() || null,
          sla_working_days: parseInt(newInstrument.sla_working_days) || 5,
          description: newInstrument.instrument_name.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      const it = data as Record<string, any>;
      setInstruments((prev) => [
        ...prev,
        {
          id: it.id,
          item_number: prev.length + 1,
          instrument_name: it.instrument_name ?? "-",
          brand_model: it.instrument_brand_model ?? null,
          serial_number: it.instrument_serial_number ?? null,
          measurement_range: it.measurement_range ?? null,
          calibration_method: it.calibration_method ?? null,
          unit_price: Number(it.unit_price ?? 0),
          sla_working_days: it.sla_working_days ?? null,
          feasibility_status: it.feasibility_status ?? null,
          calibration_conclusion: null,
          certificate_number: it.certificate_number ?? null,
        },
      ]);
      setNewInstrument({
        instrument_name: "", brand_model: "", serial_number: "",
        measurement_range: "", calibration_method: "",
        unit_price: "0", sla_working_days: "5",
      });
      setAddingInstrument(false);
      toast.success("Alat ditambahkan");
    } catch (err: any) {
      toast.error(err?.message || "Gagal tambah alat");
    } finally {
      setSavingInstrument(false);
    }
  };

  const deleteInstrument = async (id: string) => {
    if (!confirm("Hapus alat ini dari SO?")) return;
    const { error } = await (supabase as any)
      .from("sales_order_items")
      .delete()
      .eq("id", id);
    if (error) { toast.error(error.message || "Gagal hapus alat"); return; }
    setInstruments((prev) => prev.filter((i) => i.id !== id).map((i, idx) => ({ ...i, item_number: idx + 1 })));
    toast.success("Alat dihapus");
  };

  // ── checklist helpers ───────────────────────────────────────────────────

  const isChecked = (key: string) => checklists.some((c) => c.checklist_key === key && c.is_checked);
  const checkedAt = (key: string) => {
    const c = checklists.find((c) => c.checklist_key === key && c.is_checked);
    return c?.checked_at ? fmtDateTime(c.checked_at) : null;
  };

  const totalValue = instruments.reduce((s, i) => s + (i.unit_price ?? 0), 0);

  const receivedDateInputValue = toDateInputValue(receipt?.received_date);
  const spkConfirmedDateInputValue = toDateInputValue(receipt?.spk_confirmed_at);

  const handleSetReceivedDate = (value: string | null) => {
    const nextValue = value ? toDateInputValue(value) : null;
    setReceipt((prev) => prev ? { ...prev, received_date: nextValue ?? "" } : prev);
    if (receiptId) onSetReceivedDate?.(receiptId, nextValue);
  };

  const handleSetSpkConfirmedDate = (value: string | null) => {
    const nextValue = value ? toDateInputValue(value) : null;
    setReceipt((prev) => prev ? { ...prev, spk_confirmed_at: nextValue } : prev);
    if (receiptId) onSetSpkConfirmedDate?.(receiptId, nextValue);
  };

  const paymentDateInputValue = toDateInputValue(receipt?.payment_verified_at);
  const handleSetPaymentDate = (value: string | null) => {
    const nextValue = value ? toDateInputValue(value) : null;
    setReceipt((prev) => prev ? { ...prev, payment_verified_at: nextValue } : prev);
    if (receiptId) onSetPaymentDate?.(receiptId, nextValue);
  };

  // ── upload bukti SPK Confirmed ──────────────────────────────────────────
  const [uploadingSpkFile, setUploadingSpkFile] = useState(false);

  const handleUploadSpkConfirmedFile = async (file: File) => {
    if (!receiptId || !file) return;
    setUploadingSpkFile(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `calibration-spk-confirmed/${receiptId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      const url = signed?.signedUrl || path;
      const { error: updErr } = await (supabase as any)
        .from("sales_order_headers")
        .update({ spk_confirmed_file_url: url, spk_confirmed_file_name: file.name })
        .eq("id", receiptId);
      if (updErr) throw updErr;
      setReceipt((prev) => prev ? { ...prev, spk_confirmed_file_url: url, spk_confirmed_file_name: file.name } : prev);
      toast.success("Bukti SPK Confirmed berhasil diupload");
    } catch (err: any) {
      console.error("upload SPK confirmed error:", err);
      toast.error(err?.message || "Gagal upload bukti SPK Confirmed");
    } finally {
      setUploadingSpkFile(false);
    }
  };

  if (!receiptId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full h-[100dvh] sm:h-[92vh] sm:max-w-6xl bg-background sm:rounded-xl shadow-2xl border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {loadingReceipt ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* ── header ── */}
            <div className="flex items-start justify-between px-6 pt-5 pb-0 flex-shrink-0 gap-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-base leading-tight font-mono">
                  {receipt?.receipt_number ?? "-"}
                </h2>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Labels section */}
            <div className="flex flex-wrap items-center gap-1.5 px-6 py-2">
              {receiptId && <CalibrationLabelPicker salesOrderId={receiptId} canManage={canToggle} />}
            </div>

            {/* ── body ── */}
            <div className="flex flex-col md:flex-row flex-1 min-h-0 border-t overflow-y-auto md:overflow-hidden">

              {/* ── LEFT: main content ── */}
              <ScrollArea className="md:flex-1 min-w-0 md:border-r !overflow-visible md:!overflow-hidden [&>div[data-radix-scroll-area-viewport]]:!overflow-visible md:[&>div[data-radix-scroll-area-viewport]]:!overflow-auto">
                <div className="space-y-4 p-4">

                  {/* Detail info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Customer</span>
                      <p className="font-medium">{receipt?.customer?.name ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{receipt?.customer?.code ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Sales</span>
                      <p className="font-medium">{receipt?.sales_name ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">No. PO Customer</span>
                      <p className="font-medium">{receipt?.customer_po_number ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Tipe Alokasi</span>
                      <p className="font-medium">{receipt?.allocation_type ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Project/Instansi</span>
                      <p className="font-medium">{receipt?.project_instansi ?? "-"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Target Selesai</span>
                      <p className="font-medium">{fmtDate(receipt?.target_completion_date ?? null)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block mb-1">Status Board</span>
                      <Badge className={cn("text-white", getBoardColumn(checklists)?.color ?? "bg-blue-600")}>
                        {getBoardColumn(checklists)?.label ?? "-"}
                      </Badge>
                    </div>
                  </div>

                  {receipt?.service_location && (
                    <div className="text-sm">
                      <span className="text-muted-foreground text-xs">Lokasi Kalibrasi</span>
                      <p className="text-xs">{receipt.service_location}</p>
                    </div>
                  )}

                  {/* PIC */}
                  {(receipt?.service_pic_name || receipt?.service_pic_phone) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {receipt?.service_pic_name && (
                        <div>
                          <span className="text-muted-foreground text-xs">Nama PIC</span>
                          <p className="font-medium">{receipt.service_pic_name}</p>
                        </div>
                      )}
                      {receipt?.service_pic_phone && (
                        <div>
                          <span className="text-muted-foreground text-xs">No. HP PIC</span>
                          <p className="font-medium">{receipt.service_pic_phone}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Jadwal & SPK */}
                <div>
                  <SectionTitle>Jadwal & SPK</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="flex items-start gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground mt-3" />
                      <Field label="Tgl Terima" value={fmtDate(receipt?.received_date ?? null)} />
                    </div>
                    <div className="flex items-start gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground mt-3" />
                      <Field label="Target Selesai" value={fmtDate(receipt?.target_completion_date ?? null)} />
                    </div>
                    <Field label="Nomor SPK" value={receipt?.spk_number} />
                    <Field label="SPK Diterbitkan" value={fmtDate(receipt?.spk_issued_at ?? null)} />
                  </div>
                  {receipt?.customer_request_notes && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Catatan: </span>
                      {receipt.customer_request_notes}
                    </div>
                  )}
                </div>

                {/* Alat */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <SectionTitle>Alat ({instruments.length})</SectionTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary">{formatRupiah(totalValue)}</span>
                      {canToggle && !isCardLocked && !addingInstrument && (
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                          onClick={() => setAddingInstrument(true)}>
                          <Plus className="w-3 h-3" /> Tambah
                        </Button>
                      )}
                    </div>
                  </div>

                  {addingInstrument && (
                    <div className="rounded-lg border p-3 mb-2 bg-muted/20 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Nama Alat *</span>
                          <Input className="h-8 text-sm" placeholder="cth. Timbangan Analitik"
                            value={newInstrument.instrument_name}
                            onChange={e => setNewInstrument(p => ({ ...p, instrument_name: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Merk / Model</span>
                          <Input className="h-8 text-sm"
                            value={newInstrument.brand_model}
                            onChange={e => setNewInstrument(p => ({ ...p, brand_model: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">No. Seri</span>
                          <Input className="h-8 text-sm"
                            value={newInstrument.serial_number}
                            onChange={e => setNewInstrument(p => ({ ...p, serial_number: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Range</span>
                          <Input className="h-8 text-sm"
                            value={newInstrument.measurement_range}
                            onChange={e => setNewInstrument(p => ({ ...p, measurement_range: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Metode</span>
                          <Input className="h-8 text-sm"
                            value={newInstrument.calibration_method}
                            onChange={e => setNewInstrument(p => ({ ...p, calibration_method: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Harga (Rp)</span>
                            <Input className="h-8 text-sm" type="number" min="0"
                              value={newInstrument.unit_price}
                              onChange={e => setNewInstrument(p => ({ ...p, unit_price: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">SLA (hari)</span>
                            <Input className="h-8 text-sm" type="number" min="1"
                              value={newInstrument.sla_working_days}
                              onChange={e => setNewInstrument(p => ({ ...p, sla_working_days: e.target.value }))} />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => setAddingInstrument(false)} disabled={savingInstrument}>Batal</Button>
                        <Button size="sm" className="h-7 text-xs" onClick={addInstrument} disabled={savingInstrument}>
                          {savingInstrument ? <Loader2 className="w-3 h-3 animate-spin" /> : "Simpan"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Nama Alat</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Merk/Model</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">No. Seri</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Harga</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Kelayakan</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Kesimpulan</th>
                          {canToggle && <th className="px-3 py-2 w-8" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {instruments.length === 0 ? (
                          <tr><td colSpan={canToggle ? 8 : 7} className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada data alat</td></tr>
                        ) : instruments.map((inst) => (
                          <tr key={inst.id} className="hover:bg-muted/20">
                            <td className="px-3 py-2 text-center text-muted-foreground text-xs">{inst.item_number}</td>
                            <td className="px-3 py-2">
                              <p className="font-medium text-sm">{inst.instrument_name}</p>
                              {inst.measurement_range && <p className="text-xs text-muted-foreground">{inst.measurement_range}</p>}
                            </td>
                            <td className="px-3 py-2 text-sm text-muted-foreground">{inst.brand_model ?? "-"}</td>
                            <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{inst.serial_number ?? "-"}</td>
                            <td className="px-3 py-2 text-right text-sm">{formatRupiah(inst.unit_price)}</td>
                            <td className="px-3 py-2 text-center"><FeasibilityBadge status={inst.feasibility_status} /></td>
                            <td className="px-3 py-2 text-center">
                              {inst.calibration_conclusion ? (
                                <span className={cn(
                                  "text-xs px-2 py-0.5 rounded-full font-medium",
                                  inst.calibration_conclusion === "within_limits"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                )}>
                                  {inst.calibration_conclusion === "within_limits" ? "In Limit" : "Out of Limit"}
                                </span>
                              ) : <span className="text-xs text-muted-foreground">-</span>}
                            </td>
                            {canToggle && (
                              <td className="px-3 py-2">
                                <button
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  onClick={() => deleteInstrument(inst.id)}
                                  title="Hapus alat"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Spare Parts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-muted-foreground" />
                      <SectionTitle>Spare Parts ({spareParts.length})</SectionTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {spareParts.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => printCalibrationSparepartRequest(receiptId!)}
                        >
                          <Printer className="w-3 h-3" /> Cetak
                        </Button>
                      )}
                      {canToggle && !isCardLocked && !addingPart && (
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                          onClick={() => setAddingPart(true)}>
                          <Plus className="w-3 h-3" /> Tambah
                        </Button>
                      )}
                    </div>
                  </div>

                  {addingPart && (
                    <div className="rounded-lg border p-3 mb-2 bg-muted/20 space-y-2">
                      <div className="space-y-2">
                        {/* Pilih produk dari stok */}
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Produk / Spare Part *</span>
                          <SearchableSelect
                            options={products
                              .filter(p => p.is_active)
                              .map(p => ({
                                value: p.id,
                                label: p.name,
                                description: p.sku ?? undefined,
                              }))}
                            value={newPart.product_id}
                            onValueChange={async (id) => {
                              const product = products.find(p => p.id === id);
                              if (!product) return;
                              setNewPart(prev => ({
                                ...prev,
                                product_id: id,
                                unit_price: String(product.purchase_price ?? 0),
                              }));
                              setSelectedProductStock(null);
                              const { data } = await supabase
                                .from("inventory_batches")
                                .select("qty_on_hand")
                                .eq("product_id", id)
                                .gt("qty_on_hand", 0);
                              setSelectedProductStock(
                                (data || []).reduce((s, b) => s + b.qty_on_hand, 0)
                              );
                            }}
                            placeholder="Cari produk dari stok..."
                          />
                          {selectedProductStock !== null && (
                            <p className={cn(
                              "text-xs font-medium mt-1",
                              selectedProductStock > 0 ? "text-green-600 dark:text-green-400" : "text-destructive",
                            )}>
                              {selectedProductStock > 0
                                ? `Stok tersedia: ${selectedProductStock} unit`
                                : "⚠ Stok habis — tetap bisa disimpan, tindak lanjut via Form Permintaan Sparepart"}
                            </p>
                          )}
                        </div>
                        {/* Qty, harga, catatan */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Qty</span>
                            <Input
                              className="h-8 text-sm"
                              type="number" min="1"
                              value={newPart.qty_used}
                              onChange={e => setNewPart(p => ({ ...p, qty_used: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Harga (Rp)</span>
                            <Input
                              className="h-8 text-sm"
                              type="number" min="0"
                              value={newPart.unit_price}
                              onChange={e => setNewPart(p => ({ ...p, unit_price: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground">Catatan</span>
                            <Input
                              className="h-8 text-sm"
                              placeholder="opsional"
                              value={newPart.notes}
                              onChange={e => setNewPart(p => ({ ...p, notes: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>
                      {instruments.length > 1 && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Alat *</span>
                          <select
                            className="w-full h-8 rounded-md border text-sm px-2 bg-background"
                            value={newPart.instrument_id}
                            onChange={e => setNewPart(p => ({ ...p, instrument_id: e.target.value }))}
                          >
                            <option value="">-- Pilih alat --</option>
                            {instruments.map(i => (
                              <option key={i.id} value={i.id}>{i.item_number}. {i.instrument_name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => { setAddingPart(false); setSelectedProductStock(null); }}>Batal</Button>
                        <Button size="sm" className="h-7 text-xs" onClick={addSparePart}>Simpan</Button>
                      </div>
                    </div>
                  )}

                  {spareParts.length === 0 && !addingPart ? (
                    <p className="text-xs text-muted-foreground py-2">Belum ada spare part tercatat</p>
                  ) : spareParts.length > 0 && (
                    <div className="rounded-lg border overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Produk</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Alat</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Harga</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Stok Keluar</th>
                            {canToggle && <th className="px-3 py-2 w-8" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {spareParts.map(p => (
                            <tr key={p.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <p className="font-medium text-sm">{p.product_name}</p>
                                {p.product_sku && <p className="text-xs text-muted-foreground font-mono">{p.product_sku}</p>}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">{p.instrument_name}</td>
                              <td className="px-3 py-2 text-center">{p.qty_used}</td>
                              <td className="px-3 py-2 text-right">{formatRupiah(p.unit_price)}</td>
                              <td className="px-3 py-2 text-center">
                                {currentColumnId === 'delivered' && p.stock_issued ? (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    Delivered
                                  </span>
                                ) : p.stock_issued ? (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                    Dikeluarkan
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                                    Menunggu
                                  </span>
                                )}
                              </td>
                              {canToggle && (
                                <td className="px-3 py-2">
                                  {!p.stock_issued && (
                                    <button
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                      onClick={() => deleteSparePart(p.id)}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Checklist */}
                <div>
                  <SectionTitle>Checklist</SectionTitle>
                  <div className="space-y-3">
                    {(() => {
                      const currentId = getBoardColumn(checklists, receipt?.status)?.id ?? "scheduled";
                      const currentIdx = COLUMN_DEFS.findIndex((c) => c.id === currentId);
                      // Tampilkan semua kolom yang sudah dilewati + kolom aktif (skip rejected kecuali memang aktif)
                      // agar checklist di kolom sebelumnya tetap tampil sebagai history dengan tanggal.
                      return COLUMN_DEFS.filter((col, idx) => {
                        if (col.id === 'rejected') return currentId === 'rejected';
                        return idx <= currentIdx;
                      });
                    })().map((col) => {
                      const items = COLUMN_CHECKLISTS[col.id] ?? [];
                      const doneCount = items.filter((item) => isChecked(item.key)).length;
                      const allDone = items.length > 0 && doneCount === items.length;

                      return (
                        <div key={col.id} className="rounded-lg border overflow-hidden">
                          <div className={cn("h-1", col.color)} />
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-semibold">{col.label}</p>
                              <span className={cn(
                                "text-xs font-medium px-2 py-0.5 rounded-full",
                                allDone
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                  : "bg-muted text-muted-foreground",
                              )}>
                                {doneCount}/{items.length}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {/* Instrument Received: keputusan di atas checklist SPK */}
                              {col.id === 'instrument_received' && canToggle && receiptId && (
                                <div className="rounded-lg border border-dashed p-2.5 bg-muted/20 mb-2">
                                  <label className="text-[11px] text-muted-foreground block mb-1">
                                    Keputusan Kalibrasi
                                  </label>
                                  <select
                                    className="w-full h-8 rounded-md border text-sm px-2 bg-background"
                                    value={
                                      receipt?.status === 'rejected'
                                        ? 'rejected'
                                        : ['accepted','spk_issued','in_progress','completed','invoiced','delivered'].includes(String(receipt?.status || ''))
                                          ? 'accepted'
                                          : ''
                                    }
                                    onChange={(e) => {
                                      const v = e.target.value as '' | 'accepted' | 'rejected';
                                      if (!v || !receiptId) return;
                                      onSetDecision?.(receiptId, v);
                                    }}
                                  >
                                    <option value="">-- Pilih keputusan --</option>
                                    <option value="accepted">Accepted for Calibration</option>
                                    <option value="rejected">Rejected for Calibration</option>
                                  </select>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Pilih Accepted untuk lanjut proses, Rejected untuk pindah ke kolom Rejected.
                                  </p>
                                </div>
                              )}

                              {items.map((item) => {
                                const checked = isChecked(item.key);
                                const ts = checkedAt(item.key);
                                const keyAllowed = canToggleChecklistKey(user?.role, item.key);
                                return (
                                  <button
                                    key={item.key}
                                    disabled={!receiptId}
                                    aria-disabled={!keyAllowed}
                                    title={
                                      !keyAllowed
                                        ? 'Read-only untuk role Anda. Hanya Finance / Admin / Super Admin yang dapat menandai checklist ini.'
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (!receiptId) return;
                                      if (!keyAllowed) {
                                        toast.error('Read-only untuk role Anda. Hanya Finance / Admin / Super Admin yang dapat menandai checklist Payment Verified, Certificate Released, dan Instrument Delivered.');
                                        return;
                                      }
                                      // Block "Receive Instrument" toggle unless received date is filled & valid
                                      if (item.key === 'instrument_received' && !checked) {
                                        const currentReceivedDate = toDateInputValue(receivedDateInputRef.current?.value || receivedDateInputValue || receipt?.received_date);
                                        if (!isValidDateInputValue(currentReceivedDate)) {
                                          toast.error('Isi "Tanggal Terima Alat" terlebih dahulu dengan tanggal yang valid.');
                                          return;
                                        }
                                        if (currentReceivedDate !== receivedDateInputValue) handleSetReceivedDate(currentReceivedDate);
                                      }
                                      // Block SPK Confirmed toggle unless date is filled & valid
                                      if (item.key === 'spk_confirmed' && !checked) {
                                        if (receipt?.so_status !== 'approved') {
                                          toast.error('Approve Sales Order terlebih dahulu sebelum menandai SPK Confirmed.');
                                          return;
                                        }
                                        if (!receipt?.spk_confirmed_file_url) {
                                          toast.error('Upload bukti SPK yang telah dikonfirmasi customer terlebih dahulu.');
                                          return;
                                        }
                                        const currentSpkConfirmedDate = toDateInputValue(spkConfirmedDateInputRef.current?.value || spkConfirmedDateInputValue || receipt?.spk_confirmed_at);
                                        if (!isValidDateInputValue(currentSpkConfirmedDate)) {
                                          toast.error('Isi "Tgl SPK Confirmed" terlebih dahulu dengan tanggal yang valid.');
                                          return;
                                        }
                                        if (currentSpkConfirmedDate !== spkConfirmedDateInputValue) handleSetSpkConfirmedDate(currentSpkConfirmedDate);
                                      }
                                      onToggle(receiptId, item.key);
                                    }}
                                    className={cn(
                                      "flex items-start gap-2.5 w-full text-left rounded-lg p-1.5 transition-colors",
                                      keyAllowed ? "hover:bg-muted/40 cursor-pointer" : "cursor-default opacity-70",
                                      checked && "bg-muted/30",
                                    )}
                                  >
                                    {checked
                                      ? <CheckSquare className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                      : <Square className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                    }
                                    <div className="flex-1 min-w-0">
                                      <p className={cn("text-sm", checked && "line-through text-muted-foreground")}>
                                        {item.label}
                                      </p>
                                      {checked && ts && <p className="text-xs text-muted-foreground">✓ {ts}</p>}
                                    </div>
                                  </button>
                                );
                              })}

                              {/* Completed: input Tgl Pembayaran (Payment Verified) */}
                              {col.id === 'completed' && receiptId && (
                                <div className="rounded-lg border border-dashed p-2.5 bg-muted/20 mt-2">
                                  <label className="text-[11px] text-muted-foreground block mb-1">
                                    Tgl Pembayaran
                                  </label>
                                  <Input
                                    type="date"
                                    className="h-8 text-sm"
                                    value={paymentDateInputValue}
                                    disabled={!FINANCE_CHECKLIST_ROLES.includes(user?.role || '')}
                                    onChange={(e) => handleSetPaymentDate(e.target.value || null)}
                                  />
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Tanggal saat pembayaran diverifikasi. Hanya Finance / Admin / Super Admin yang dapat mengubah.
                                  </p>
                                </div>
                              )}

                              {/* Instrument Received: input Tgl SPK Confirmed di bawah checklist */}
                              {col.id === 'instrument_received' && canToggle && receiptId && (
                                <div className="rounded-lg border border-dashed p-2.5 bg-muted/20 mt-2">
                                  <label className="text-[11px] text-muted-foreground block mb-1">
                                    Tgl SPK Confirmed
                                  </label>
                                  <Input
                                    ref={spkConfirmedDateInputRef}
                                    type="date"
                                    className="h-8 text-sm"
                                    value={
                                      spkConfirmedDateInputValue
                                    }
                                    onChange={(e) =>
                                      handleSetSpkConfirmedDate(e.target.value || null)
                                    }
                                  />
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Wajib diisi sebelum mencentang "SPK Confirmed" untuk pindah ke Calibration In Progress.
                                  </p>
                                  {/* Status SO */}
                                  <div className="mt-2 flex items-center gap-2">
                                    <span className="text-[11px] text-muted-foreground">Status SO:</span>
                                    {receipt?.so_status === 'approved' ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 h-5 px-1.5 text-[10px]">Approved</Badge>
                                    ) : (
                                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 h-5 px-1.5 text-[10px]">
                                        Please Approve SO First
                                      </Badge>
                                    )}
                                  </div>
                                  {/* Upload bukti SPK Confirmed */}
                                  <div className="mt-2">
                                    <label className="text-[11px] text-muted-foreground block mb-1">
                                      Bukti SPK Dikonfirmasi Customer <span className="text-red-500">*</span>
                                    </label>
                                    {receipt?.spk_confirmed_file_url ? (
                                      <div className="flex items-center gap-2 text-xs">
                                        <a
                                          href={receipt.spk_confirmed_file_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary underline truncate max-w-[180px]"
                                          title={receipt.spk_confirmed_file_name || 'Lihat bukti SPK'}
                                        >
                                          {receipt.spk_confirmed_file_name || 'Lihat bukti SPK'}
                                        </a>
                                        <label className="inline-flex items-center gap-1 text-[11px] text-primary cursor-pointer hover:underline">
                                          Ganti
                                          <input
                                            type="file"
                                            accept="application/pdf,image/*"
                                            className="hidden"
                                            disabled={uploadingSpkFile}
                                            onChange={(e) => {
                                              const f = e.target.files?.[0];
                                              if (f) handleUploadSpkConfirmedFile(f);
                                              e.target.value = '';
                                            }}
                                          />
                                        </label>
                                      </div>
                                    ) : (
                                      <label className="inline-flex items-center gap-1 text-xs border rounded-md px-2 py-1 cursor-pointer hover:bg-muted/40">
                                        {uploadingSpkFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                                        {uploadingSpkFile ? 'Mengupload...' : 'Upload file'}
                                        <input
                                          type="file"
                                          accept="application/pdf,image/*"
                                          className="hidden"
                                          disabled={uploadingSpkFile}
                                          onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) handleUploadSpkConfirmedFile(f);
                                            e.target.value = '';
                                          }}
                                        />
                                      </label>
                                    )}
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      PDF / gambar SPK yang sudah ditandatangani/dikonfirmasi customer. Wajib sebelum "SPK Confirmed".
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Scheduled: tanggal terima di bawah checklist */}
                              {col.id === 'scheduled' && canToggle && receiptId && (
                                <div className="rounded-lg border border-dashed p-2.5 bg-muted/20 mt-2">
                                  <label className="text-[11px] text-muted-foreground block mb-1">
                                    Tanggal Terima Alat
                                  </label>
                                  <Input
                                    ref={receivedDateInputRef}
                                    type="date"
                                    className="h-8 text-sm"
                                    value={receivedDateInputValue}
                                    onChange={(e) =>
                                      handleSetReceivedDate(e.target.value || null)
                                    }
                                  />
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Isi tanggal & centang "Receive Instrument" untuk pindah kolom.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PDF */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    <SectionTitle>Dokumen PDF</SectionTitle>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline" size="sm"
                      disabled={!receiptId || pdfLoading !== null || !isChecked('spk_issued')}
                      title={!isChecked('spk_issued') ? 'Centang "SPK Issued" dulu untuk mengaktifkan preview & download SPK' : undefined}
                      onClick={async () => {
                        if (!receiptId) return;
                        setPdfLoading("spk");
                        try { await generateSPKPdf(receiptId); }
                        catch (e) { toast.error("Gagal generate SPK PDF"); console.error(e); setPdfLoading(null); return; }
                        finally { setPdfLoading(null); }
                        await logCalibrationDoc('spk', receipt?.spk_number ?? null);
                      }}
                      className="gap-1.5 text-xs"
                    >
                      {pdfLoading === "spk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                      SPK (F-KAL-02)
                    </Button>
                    {/* Generate PI — sama seperti Kanban Request Delivery */}
                    {(() => {
                      const termsUpper = customerPaymentTerms?.toUpperCase() || '';
                      const isCBDTerms = termsUpper === 'CBD';
                      const isDpTermTerms = termsUpper.includes('DP') && (termsUpper.includes('TERMIN') || termsUpper.includes('TOP') || /\d+\s*HARI/.test(termsUpper));
                      const hasCBDLabel = cardLabelNames.some((n) => n === 'CBD' || n.includes('CBD') || n.includes('CASH BEFORE DELIVERY'));
                      const hasDpTermLabel = cardLabelNames.some((n) => n.includes('DP') && (n.includes('TERMIN') || n.includes('TOP')));
                      const eligible = isCBDTerms || isDpTermTerms || hasCBDLabel || hasDpTermLabel;
                      const useDpFlow = isDpTermTerms || hasDpTermLabel;
                      const canGenerate = user?.role === 'sales' || user?.role === 'super_admin' || user?.role === 'finance';
                      const spkIssued = isChecked('spk_issued');
                      if (existingPI) {
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            onClick={() => { onClose(); navigate('/proforma-invoice'); }}
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            PI: {existingPI}
                          </Button>
                        );
                      }
                      if (!eligible || !canGenerate) return null;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          disabled={!receiptId || generatingPI || !spkIssued}
                          title={!spkIssued ? 'Centang "SPK Issued" dulu untuk generate PI' : undefined}
                          onClick={() => {
                            if (useDpFlow) {
                              setDpPercentInput("30");
                              setTermDaysInput("30");
                              setShowDpTerminDialog(true);
                            } else {
                              handleGeneratePI();
                            }
                          }}
                        >
                          {generatingPI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
                          Generate PI
                        </Button>
                      );
                    })()}
                    {getBoardColumn(checklists, receipt?.status)?.id === 'delivered' && (
                    <>
                    <Button
                      variant="outline" size="sm"
                      disabled={!receiptId || pdfLoading !== null || instruments.length === 0}
                      onClick={async () => {
                        if (!receiptId) return;
                        setPdfLoading("cert");
                        let issuedCerts: Array<{ certificate_number?: string | null }> = [];
                        try {
                          issuedCerts = await generateCertificatePdf(receiptId) as Array<{ certificate_number?: string | null }>;
                        } catch (e) {
                          toast.error("Gagal generate Sertifikat PDF");
                          console.error(e);
                          return;
                        } finally {
                          setPdfLoading(null);
                        }
                        await fetchReceipt();
                        const firstCert = issuedCerts.find((i) => i.certificate_number)?.certificate_number
                          ?? instruments.find(i => (i as any).certificate_number)?.['certificate_number' as any] as string | undefined;
                        await logCalibrationDoc('certificate', firstCert ?? receipt?.spk_number ?? null);
                      }}
                      className="gap-1.5 text-xs"
                    >
                      {pdfLoading === "cert" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                      Sertifikat (F-KAL-05)
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      disabled={!receiptId || pdfLoading !== null}
                      onClick={async () => {
                        if (!receiptId) return;
                        setPdfLoading("bast");
                        try { await generateBASTPdf(receiptId); }
                        catch (e) { toast.error("Gagal generate BAST PDF"); console.error(e); setPdfLoading(null); return; }
                        finally { setPdfLoading(null); }
                        await logCalibrationDoc('bast', receipt?.spk_number ?? receipt?.receipt_number ?? null);
                      }}
                      className="gap-1.5 text-xs"
                    >
                      {pdfLoading === "bast" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                      BAST (F-KAL-06)
                    </Button>
                    </>
                    )}
                  </div>

                  {/* Attachments panel */}
                  <div className="mt-3 rounded-lg border bg-muted/20">
                    <div className="px-3 py-2 border-b flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Lampiran Dokumen
                      </span>
                      <Badge variant="secondary" className="h-4 text-[10px] px-1.5 ml-auto">
                        {attachments.length}
                      </Badge>
                    </div>
                    <div className="p-3 space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile || !receiptId}
                        className="w-full gap-1.5 text-xs"
                      >
                        {uploadingFile
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />}
                        {uploadingFile ? "Mengupload..." : "Upload File"}
                      </Button>
                      {attachments.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground italic text-center py-2">
                          Belum ada lampiran.
                        </div>
                      ) : (
                        <div className="divide-y rounded border bg-background">
                          {attachments.map((att) => (
                            <div key={att.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                              <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate" title={att.file_name || ''}>
                                  {att.file_name || att.file_key.split('/').pop()}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {formatFileSize(att.file_size)}
                                  {att.uploader_name ? ` · ${att.uploader_name}` : ''}
                                  {` · ${format(new Date(att.uploaded_at), 'dd MMM yyyy HH:mm', { locale: idLocale })}`}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 flex-shrink-0"
                                onClick={() => handleDownloadAttachment(att)}
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                              {(att.uploaded_by === user?.id || user?.role === 'super_admin' || user?.role === 'admin') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteAttachment(att)}
                                  title="Hapus"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
              </ScrollArea>{/* end LEFT */}

              {/* ── RIGHT: comments ── */}
              <div className="w-full md:w-[340px] flex-shrink-0 flex flex-col md:min-h-0 border-t md:border-t-0 md:border-l">
                <div className="flex items-center gap-2 px-4 py-3 border-b">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold">Comments & Activity</span>
                  {comments.length > 0 && (
                    <Badge variant="secondary" className="h-4 text-[10px] px-1.5">{comments.length}</Badge>
                  )}
                </div>

                {/* Comment input */}
                <div className="px-4 py-3 border-b">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Tulis komentar... (ketik @ untuk mention)"
                        className="text-xs min-h-[50px] resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); }
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1 self-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setNewComment((prev) => prev + "@")}
                      >
                        <AtSign className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={sendComment}
                        disabled={!newComment.trim() || sending}
                        className="h-8"
                      >
                        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Comments list */}
                <ScrollArea className="md:flex-1 !overflow-visible md:!overflow-hidden [&>div[data-radix-scroll-area-viewport]]:!overflow-visible md:[&>div[data-radix-scroll-area-viewport]]:!overflow-auto">
                  <div className="px-4 py-3">
                    {loadingComments ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        <p className="text-xs">Belum ada komentar</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {comments.map((c) => (
                          <div key={c.id} className={cn("flex gap-2 group", c.type === "activity" && "opacity-70")}>
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                              {(c.user_name ?? "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold">{c.user_name ?? "Pengguna"}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: idLocale })}
                                </span>
                              </div>
                              <p className={cn(
                                "text-xs mt-0.5 whitespace-pre-wrap break-words",
                                c.type === "activity" && "text-muted-foreground italic",
                              )}>
                                {c.message}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div ref={commentEndRef} />
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

            </div>{/* end body */}
          </>
        )}
      </div>

      {/* DP + Termin Setup Dialog */}
      <Dialog open={showDpTerminDialog} onOpenChange={setShowDpTerminDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" />
              Setup DP + Termin
            </DialogTitle>
            <DialogDescription>
              Tentukan persentase Down Payment dan jumlah hari termin sebelum PI dibuat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="kal-dp-percent">DP (%)</Label>
                <Input
                  id="kal-dp-percent"
                  type="number"
                  min={1}
                  max={99}
                  value={dpPercentInput}
                  onChange={(e) => setDpPercentInput(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="kal-term-days">Termin (hari)</Label>
                <Input
                  id="kal-term-days"
                  type="number"
                  min={1}
                  value={termDaysInput}
                  onChange={(e) => setTermDaysInput(e.target.value)}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              Note di PDF: <span className="italic">"Sisa pembayaran {termDaysInput || 'N'} hari setelah invoice diterbitkan"</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDpTerminDialog(false)} disabled={generatingPI}>
              Batal
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={generatingPI}
              onClick={async () => {
                const dp = parseFloat(dpPercentInput);
                const days = parseInt(termDaysInput, 10);
                if (!dp || dp <= 0 || dp >= 100) {
                  toast.error("DP harus antara 1-99%");
                  return;
                }
                if (!days || days <= 0) {
                  toast.error("Termin harus minimal 1 hari");
                  return;
                }
                const note = `Sisa pembayaran ${days} hari setelah invoice diterbitkan`;
                await handleGeneratePI({ dpPercent: dp, termDays: days, paymentNote: note });
                setShowDpTerminDialog(false);
              }}
            >
              {generatingPI ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Generate PI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
