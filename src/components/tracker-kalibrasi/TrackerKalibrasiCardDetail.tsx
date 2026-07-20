import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FlaskConical, X, Send, Loader2, CheckSquare, Square,
  MapPin, Phone, User, CalendarDays, FileText, Download,
  Plus, Trash2, Package, MessageSquare, Printer,
} from "lucide-react";
import { format } from "date-fns";
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
} from "@/hooks/useTrackerKalibrasi";
import { useProducts } from "@/hooks/useMasterData";
import { generateSPKPdf, generateCertificatePdf } from "@/lib/calibrationPdf";
import { printCalibrationSparepartRequest } from "@/lib/calibrationSparepartRequestPdf";
import CalibrationLabelPicker from "./CalibrationLabelPicker";

// ─── types ────────────────────────────────────────────────────────────────────

interface ReceiptDetail {
  id: string;
  receipt_number: string;
  customer_po_number: string | null;
  spk_number: string | null;
  spk_issued_at: string | null;
  spk_signed_at: string | null;
  status: string;
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
  onSetDecision?: (receiptId: string, decision: 'accepted' | 'rejected') => void;
  onClose: () => void;
}

export default function TrackerKalibrasiCardDetail({
  receiptId,
  checklists,
  canToggle,
  onToggle,
  onSetReceivedDate,
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
  const [pdfLoading, setPdfLoading] = useState<"spk" | "cert" | null>(null);

  // spare parts add form
  const [addingPart, setAddingPart] = useState(false);
  const [newPart, setNewPart] = useState({ instrument_id: "", product_id: "", qty_used: "1", unit_price: "0", notes: "" });
  const [selectedProductStock, setSelectedProductStock] = useState<number | null>(null);

  const commentEndRef = useRef<HTMLDivElement>(null);

  // ── fetch receipt + instruments ─────────────────────────────────────────

  useEffect(() => {
    if (!receiptId) { setReceipt(null); setInstruments([]); setSpareParts([]); return; }
    setLoadingReceipt(true);

    (async () => {
      const [{ data: hdr }, { data: items }] = await Promise.all([
        (supabase as any)
          .from("sales_order_headers")
          .select(`
            id, sales_order_number, customer_po_number, spk_number, spk_issued_at,
            calibration_status, status, calibration_received_at,
            target_completion_date, service_location, service_pic_name,
            service_pic_phone, customer_request_notes, created_at, created_by,
            sales_name, allocation_type, project_instansi,
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
            status: h.calibration_status ?? h.status ?? "draft",
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
          })) as SparePart[]
        );
      }

      setLoadingReceipt(false);
    })();
  }, [receiptId]);

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
      toast.error(`Stok tidak cukup. Tersedia: ${totalStock} unit`);
      return;
    }

    // 2. Simpan spare part — warehouse proses pengeluaran dari menu Stock Out
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

  // ── checklist helpers ───────────────────────────────────────────────────

  const isChecked = (key: string) => checklists.some((c) => c.checklist_key === key && c.is_checked);
  const checkedAt = (key: string) => {
    const c = checklists.find((c) => c.checklist_key === key && c.is_checked);
    return c?.checked_at ? fmtDateTime(c.checked_at) : null;
  };

  const totalValue = instruments.reduce((s, i) => s + (i.unit_price ?? 0), 0);

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
                    <span className="text-sm font-semibold text-primary">{formatRupiah(totalValue)}</span>
                  </div>
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
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {instruments.length === 0 ? (
                          <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada data alat</td></tr>
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
                      {canToggle && !addingPart && (
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
                                : "⚠ Stok habis — tidak bisa disimpan"}
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
                                {p.stock_issued ? (
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
                    {COLUMN_DEFS.filter((col) => col.id === (getBoardColumn(checklists, receipt?.status)?.id ?? "scheduled")).map((col) => {
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
                                    value={receipt?.status === 'rejected' ? 'rejected' : ''}
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
                                return (
                                  <button
                                    key={item.key}
                                    disabled={!canToggle || !receiptId}
                                    onClick={() => receiptId && onToggle(receiptId, item.key)}
                                    className={cn(
                                      "flex items-start gap-2.5 w-full text-left rounded-lg p-1.5 transition-colors",
                                      canToggle ? "hover:bg-muted/40 cursor-pointer" : "cursor-default",
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

                              {/* Scheduled: tanggal terima di bawah checklist */}
                              {col.id === 'scheduled' && canToggle && receiptId && (
                                <div className="rounded-lg border border-dashed p-2.5 bg-muted/20 mt-2">
                                  <label className="text-[11px] text-muted-foreground block mb-1">
                                    Tanggal Terima Alat
                                  </label>
                                  <Input
                                    type="date"
                                    className="h-8 text-sm"
                                    value={receipt?.received_date ?? ''}
                                    onChange={(e) =>
                                      onSetReceivedDate?.(receiptId, e.target.value || null)
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
                        catch (e) { toast.error("Gagal generate SPK PDF"); console.error(e); }
                        finally { setPdfLoading(null); }
                      }}
                      className="gap-1.5 text-xs"
                    >
                      {pdfLoading === "spk" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                      SPK (F-KAL-02)
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      disabled={!receiptId || pdfLoading !== null || instruments.length === 0}
                      onClick={async () => {
                        if (!receiptId) return;
                        setPdfLoading("cert");
                        try { await generateCertificatePdf(receiptId); }
                        catch (e) { toast.error("Gagal generate Sertifikat PDF"); console.error(e); }
                        finally { setPdfLoading(null); }
                      }}
                      className="gap-1.5 text-xs"
                    >
                      {pdfLoading === "cert" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                      Sertifikat (F-KAL-05)
                    </Button>
                  </div>
                </div>

              </div>
              </ScrollArea>{/* end LEFT */}

              {/* ── RIGHT: comments ── */}
              <div className="w-full md:w-80 lg:w-96 flex flex-col border-t md:border-t-0 md:border-l flex-shrink-0 max-h-[55vh] md:max-h-none">
                <div className="px-4 py-3 border-b flex-shrink-0 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    Komentar & Aktivitas
                  </h3>
                  {comments.length > 0 && (
                    <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                      {comments.length}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {loadingComments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Belum ada komentar</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className={cn("flex gap-2", c.user_id === user?.id && "flex-row-reverse")}>
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-muted-foreground">
                          {(c.user_name ?? "?")[0].toUpperCase()}
                        </div>
                        <div className={cn(
                          "max-w-[80%] rounded-xl px-3 py-2 text-xs",
                          c.user_id === user?.id
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted rounded-tl-sm",
                        )}>
                          {c.user_id !== user?.id && (
                            <p className="font-semibold mb-0.5 opacity-70 text-[10px]">{c.user_name ?? "Pengguna"}</p>
                          )}
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{c.message}</p>
                          <p className={cn("text-[9px] mt-1 opacity-60", c.user_id === user?.id && "text-right")}>
                            {fmtDateTime(c.created_at)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={commentEndRef} />
                </div>

                <div className="border-t p-3 flex gap-2 flex-shrink-0">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Tulis komentar..."
                    className="min-h-[38px] max-h-[90px] resize-none text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={sendComment}
                    disabled={!newComment.trim() || sending}
                    className="flex-shrink-0 h-9 w-9"
                  >
                    {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

            </div>{/* end body */}
          </>
        )}
      </div>
    </div>
  );
}
