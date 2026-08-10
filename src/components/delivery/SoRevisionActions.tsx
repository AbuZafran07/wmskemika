/**
 * SoRevisionActions
 *
 * Aksi revisi SO yang sudah delivered (super_admin only):
 *  - Tier 1: Koreksi Harga/Diskon (in-place, tanpa sentuh stok)
 *  - Tier 2: Revisi Qty (undo delivery -> edit qty -> approve ulang -> kirim ulang)
 *
 * Catatan: invoice AR TIDAK diubah oleh fitur ini.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2, Pencil, Tag } from "lucide-react";
import {
  reviseSalesOrderPricing,
  forceSalesOrderRevisionQty,
  reviseSalesOrderQty,
  DeliveredSnapshotEntry,
} from "@/hooks/useSalesOrders";

interface SoRevisionActionsProps {
  cardId: string;
  salesOrderId: string;
  salesOrderNumber: string;
  boardStatus: string;
  soStatus: string;
  onChanged?: () => void;
  /** Jika true, tombol trigger tidak dirender (digantikan dropdown di parent). */
  hideTriggers?: boolean;
  /** Controlled dialog open props. Jika tidak diset, komponen mengelola sendiri. */
  pricingOpen?: boolean;
  onPricingOpenChange?: (open: boolean) => void;
  forceOpen?: boolean;
  onForceOpenChange?: (open: boolean) => void;
  qtyOpen?: boolean;
  onQtyOpenChange?: (open: boolean) => void;
}

interface SoItemRow {
  id: string;
  product_name: string;
  ordered_qty: number;
  qty_delivered: number;
  unit_price: number;
  discount: number;
}

interface SoHeaderInfo {
  discount: number;
  shipping_cost: number;
  grand_total: number;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

/** Formula identik dengan helper DB recompute_sales_order_totals */
function computeTotals(rows: Array<{ ordered_qty: number; unit_price: number }>, header: SoHeaderInfo) {
  const gross = rows.reduce((s, r) => s + Number(r.ordered_qty || 0) * Number(r.unit_price || 0), 0);
  const dpp = gross - Number(header.discount || 0);
  const dppP = Math.round((dpp * 11) / 12);
  const tax = Math.round((dppP * 12) / 100);
  return { dpp, tax, grand: dpp + tax + Number(header.shipping_cost || 0) };
}

export function SoRevisionActions({
  cardId,
  salesOrderId,
  salesOrderNumber,
  boardStatus,
  soStatus,
  onChanged,
  hideTriggers = false,
  pricingOpen: pricingOpenProp,
  onPricingOpenChange,
  forceOpen: forceOpenProp,
  onForceOpenChange,
  qtyOpen: qtyOpenProp,
  onQtyOpenChange,
}: SoRevisionActionsProps) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [items, setItems] = useState<SoItemRow[]>([]);
  const [header, setHeader] = useState<SoHeaderInfo>({ discount: 0, shipping_cost: 0, grand_total: 0 });
  const [loading, setLoading] = useState(false);

  // Tier 1
  const [internalPricingOpen, setInternalPricingOpen] = useState(false);
  const pricingOpen = pricingOpenProp ?? internalPricingOpen;
  const setPricingOpen = (open: boolean) => {
    setInternalPricingOpen(open);
    onPricingOpenChange?.(open);
  };
  const [pricingReason, setPricingReason] = useState("");
  const [pricingDraft, setPricingDraft] = useState<Record<string, { unit_price: number; discount: number }>>({});
  const [savingPricing, setSavingPricing] = useState(false);

  // Tier 2
  const [internalForceOpen, setInternalForceOpen] = useState(false);
  const forceOpen = forceOpenProp ?? internalForceOpen;
  const setForceOpen = (open: boolean) => {
    setInternalForceOpen(open);
    onForceOpenChange?.(open);
  };
  const [forceReason, setForceReason] = useState("");
  const [forceConfirm, setForceConfirm] = useState("");
  const [forcing, setForcing] = useState(false);

  const [internalQtyOpen, setInternalQtyOpen] = useState(false);
  const qtyOpen = qtyOpenProp ?? internalQtyOpen;
  const setQtyOpen = (open: boolean) => {
    setInternalQtyOpen(open);
    onQtyOpenChange?.(open);
  };
  const [qtyReason, setQtyReason] = useState("");
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const [savingQty, setSavingQty] = useState(false);
  const [snapshot, setSnapshot] = useState<DeliveredSnapshotEntry[]>([]);

  const canPricing = isSuperAdmin && boardStatus === "delivered";
  const canForceQty = isSuperAdmin && boardStatus === "delivered";
  const pendingRedeliver = soStatus === "revision_requested" || soStatus === "draft";

  const fetchSo = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: h }, { data: its }] = await Promise.all([
        supabase
          .from("sales_order_headers")
          .select("discount, shipping_cost, grand_total")
          .eq("id", salesOrderId)
          .maybeSingle(),
        supabase
          .from("sales_order_items")
          .select("id, ordered_qty, qty_delivered, unit_price, discount, description, products(name)")
          .eq("sales_order_id", salesOrderId)
          .order("created_at"),
      ]);

      setHeader({
        discount: Number(h?.discount || 0),
        shipping_cost: Number(h?.shipping_cost || 0),
        grand_total: Number(h?.grand_total || 0),
      });

      const rows: SoItemRow[] = (its || []).map((it: any) => ({
        id: it.id,
        product_name: it.products?.name || it.description || "-",
        ordered_qty: Number(it.ordered_qty || 0),
        qty_delivered: Number(it.qty_delivered || 0),
        unit_price: Number(it.unit_price || 0),
        discount: Number(it.discount || 0),
      }));
      setItems(rows);
      setPricingDraft(
        Object.fromEntries(rows.map((r) => [r.id, { unit_price: r.unit_price, discount: r.discount }])),
      );
      setQtyDraft(Object.fromEntries(rows.map((r) => [r.id, r.ordered_qty])));
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

  useEffect(() => {
    if (pricingOpen || qtyOpen) fetchSo();
  }, [pricingOpen, qtyOpen, fetchSo]);

  const pricingPreview = useMemo(
    () =>
      computeTotals(
        items.map((r) => ({ ordered_qty: r.ordered_qty, unit_price: pricingDraft[r.id]?.unit_price ?? r.unit_price })),
        header,
      ),
    [items, pricingDraft, header],
  );

  const qtyPreview = useMemo(
    () =>
      computeTotals(
        items.map((r) => ({ ordered_qty: qtyDraft[r.id] ?? r.ordered_qty, unit_price: r.unit_price })),
        header,
      ),
    [items, qtyDraft, header],
  );

  const addActivityComment = async (message: string) => {
    if (!user) return;
    try {
      await supabase.from("delivery_comments").insert({
        delivery_request_id: cardId,
        user_id: user.id,
        message,
        type: "activity",
      });
    } catch (err) {
      console.warn("Gagal menambah komentar aktivitas:", err);
    }
  };

  const handleSavePricing = async () => {
    const reason = pricingReason.trim();
    if (reason.length < 20) return;
    setSavingPricing(true);
    try {
      const payload = items.map((r) => ({
        item_id: r.id,
        unit_price: Number(pricingDraft[r.id]?.unit_price ?? r.unit_price),
        discount: Number(pricingDraft[r.id]?.discount ?? r.discount),
      }));
      const res = await reviseSalesOrderPricing(salesOrderId, reason, payload);
      if (!res.success) {
        toast.error(res.error || "Gagal koreksi harga");
        return;
      }
      toast.success(`Harga SO ${salesOrderNumber} dikoreksi. Grand total baru: ${rupiah(res.grandTotal || 0)}`);
      await addActivityComment(
        `💰 Koreksi harga SO ${salesOrderNumber} oleh ${user?.name || user?.email}. Grand total baru: ${rupiah(res.grandTotal || 0)}. Alasan: ${reason}. (Invoice AR tidak berubah otomatis.)`,
      );
      setPricingOpen(false);
      setPricingReason("");
      onChanged?.();
    } finally {
      setSavingPricing(false);
    }
  };

  const handleForceRevision = async () => {
    const reason = forceReason.trim();
    if (reason.length < 20 || forceConfirm.trim() !== salesOrderNumber) return;
    setForcing(true);
    try {
      const res = await forceSalesOrderRevisionQty(salesOrderId, reason);
      if (!res.success) {
        toast.error(res.error || "Gagal memaksa revisi qty");
        return;
      }
      setSnapshot(res.deliveredSnapshot || []);
      toast.success("Pengiriman di-undo & stok dikembalikan. Silakan koreksi qty, lalu approve & kirim ulang SO ini.");
      setForceOpen(false);
      setForceReason("");
      setForceConfirm("");
      setQtyReason(reason);
      setQtyOpen(true);
      onChanged?.();
    } finally {
      setForcing(false);
    }
  };

  const handleSaveQty = async () => {
    const reason = qtyReason.trim();
    if (reason.length < 20) return;
    setSavingQty(true);
    try {
      const payload = items.map((r) => ({
        item_id: r.id,
        ordered_qty: Math.max(0, Math.floor(Number(qtyDraft[r.id] ?? r.ordered_qty))),
      }));
      const res = await reviseSalesOrderQty(salesOrderId, reason, payload, snapshot);
      if (!res.success) {
        toast.error(res.error || "Gagal revisi qty");
        return;
      }
      if (res.warning) toast.warning(res.warning);
      if (res.adjustmentNumber) {
        toast.success(
          `Qty SO ${salesOrderNumber} direvisi. Draft Stock Adjustment ${res.adjustmentNumber} dibuat untuk selisih kelebihan kirim — wajib direview.`,
        );
      } else {
        toast.success(`Qty SO ${salesOrderNumber} direvisi. WAJIB approve ulang & kirim ulang SO ini.`);
      }
      await addActivityComment(
        `🔢 Revisi qty SO ${salesOrderNumber} oleh ${user?.name || user?.email}. Alasan: ${reason}.${
          res.adjustmentNumber ? ` Draft Stock Adjustment: ${res.adjustmentNumber} (write-off selisih kelebihan kirim).` : ""
        } SO WAJIB di-approve ulang dan dikirim ulang.`,
      );
      setQtyOpen(false);
      onChanged?.();
    } finally {
      setSavingQty(false);
    }
  };

  if (!isSuperAdmin) return null;

  return (
    <>
      {pendingRedeliver && (
        <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 text-[10px]">
          <AlertTriangle className="h-3 w-3 mr-1" /> SO dalam revisi qty — belum dikirim ulang
        </Badge>
      )}

      {!hideTriggers && canPricing && (
        <Button variant="outline" size="sm" onClick={() => setPricingOpen(true)}>
          <Tag className="h-4 w-4 mr-1" /> Koreksi Harga
        </Button>
      )}

      {!hideTriggers && canForceQty && (
        <Button
          variant="outline"
          size="sm"
          className="text-amber-600 border-amber-500/50 hover:bg-amber-500/10"
          onClick={() => setForceOpen(true)}
        >
          <Pencil className="h-4 w-4 mr-1" /> Revisi Qty (delivered)
        </Button>
      )}

      {!hideTriggers && pendingRedeliver && (
        <Button variant="outline" size="sm" onClick={() => setQtyOpen(true)}>
          <Pencil className="h-4 w-4 mr-1" /> Lanjutkan Edit Qty
        </Button>
      )}

      {/* ── Tier 1: Koreksi Harga ── */}
      <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" /> Koreksi Harga / Diskon — {salesOrderNumber}
            </DialogTitle>
            <DialogDescription>
              Qty & stok tidak berubah. Harga akan berubah di WMS. Invoice AR TIDAK ikut berubah (perlu koreksi manual
              bila perlu).
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <ScrollArea className="max-h-[45vh] pr-2">
              <div className="space-y-2">
                {items.map((r) => (
                  <div key={r.id} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
                    <div className="col-span-5">
                      <p className="text-xs font-medium truncate">{r.product_name}</p>
                      <p className="text-[10px] text-muted-foreground">Qty: {r.ordered_qty} (read-only)</p>
                    </div>
                    <div className="col-span-4">
                      <Label className="text-[10px]">Harga satuan</Label>
                      <Input
                        type="number"
                        min={0}
                        value={pricingDraft[r.id]?.unit_price ?? r.unit_price}
                        onChange={(e) =>
                          setPricingDraft((p) => ({
                            ...p,
                            [r.id]: { unit_price: Number(e.target.value), discount: p[r.id]?.discount ?? r.discount },
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[10px]">Diskon item</Label>
                      <Input
                        type="number"
                        min={0}
                        value={pricingDraft[r.id]?.discount ?? r.discount}
                        onChange={(e) =>
                          setPricingDraft((p) => ({
                            ...p,
                            [r.id]: { unit_price: p[r.id]?.unit_price ?? r.unit_price, discount: Number(e.target.value) },
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
            <div className="flex justify-between"><span>DPP</span><span>{rupiah(pricingPreview.dpp)}</span></div>
            <div className="flex justify-between"><span>PPN</span><span>{rupiah(pricingPreview.tax)}</span></div>
            <div className="flex justify-between font-semibold">
              <span>Grand total baru</span><span>{rupiah(pricingPreview.grand)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Sebelumnya: {rupiah(header.grand_total)}</p>
          </div>

          <div>
            <Label className="text-xs">Alasan koreksi (min 20 karakter)</Label>
            <Textarea
              value={pricingReason}
              onChange={(e) => setPricingReason(e.target.value.slice(0, 500))}
              rows={3}
              className="mt-1 text-sm"
              placeholder="Jelaskan alasan koreksi harga/diskon..."
            />
            <p className="text-[10px] text-muted-foreground text-right">{pricingReason.length}/500</p>
          </div>

          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setPricingOpen(false)}>Tutup</Button>
            <Button size="sm" onClick={handleSavePricing} disabled={savingPricing || pricingReason.trim().length < 20}>
              {savingPricing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Simpan Koreksi Harga
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Tier 2a: Konfirmasi paksa revisi qty ── */}
      <Dialog
        open={forceOpen}
        onOpenChange={(o) => {
          setForceOpen(o);
          if (!o) { setForceReason(""); setForceConfirm(""); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> Revisi Qty SO yang Sudah Terkirim
            </DialogTitle>
            <DialogDescription className="text-amber-600 font-medium">
              Ini akan MEMBATALKAN pengiriman (stok dikembalikan) agar qty bisa dikoreksi. Setelah revisi, Anda WAJIB
              meng-approve ulang dan MENGIRIM ULANG SO ini. Jika qty dikurangi, sistem membuat draft stock adjustment
              untuk selisih kelebihan kirim.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Alasan revisi (min 20 karakter)</Label>
              <Textarea
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value.slice(0, 500))}
                rows={3}
                className="mt-1 text-sm"
                placeholder="Jelaskan alasan revisi qty..."
              />
              <p className="text-[10px] text-muted-foreground text-right">{forceReason.length}/500</p>
            </div>
            <div>
              <Label className="text-xs">
                Ketik ulang nomor SO <span className="font-semibold text-foreground">{salesOrderNumber}</span> untuk konfirmasi
              </Label>
              <Input
                value={forceConfirm}
                onChange={(e) => setForceConfirm(e.target.value)}
                placeholder={salesOrderNumber}
                className="mt-1 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setForceOpen(false)}>Tutup</Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleForceRevision}
              disabled={forcing || forceReason.trim().length < 20 || forceConfirm.trim() !== salesOrderNumber}
            >
              {forcing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Lanjutkan Revisi Qty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Tier 2b: Form edit qty ── */}
      <Dialog open={qtyOpen} onOpenChange={setQtyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-amber-600" /> Revisi Qty — {salesOrderNumber}
            </DialogTitle>
            <DialogDescription>
              Setelah menyimpan, approve ulang SO lalu kirim ulang lewat board delivery. Qty yang diturunkan akan
              membuat draft stock adjustment (write-off selisih) untuk direview.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <ScrollArea className="max-h-[45vh] pr-2">
              <div className="space-y-2">
                {items.map((r) => {
                  const delivered = snapshot
                    .filter((s) => s.item_id === r.id)
                    .reduce((s, x) => s + Number(x.qty || 0), 0);
                  return (
                    <div key={r.id} className="grid grid-cols-12 gap-2 items-end border rounded-md p-2">
                      <div className="col-span-8">
                        <p className="text-xs font-medium truncate">{r.product_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Harga: {rupiah(r.unit_price)} · Terkirim sebelum revisi: {delivered}
                        </p>
                      </div>
                      <div className="col-span-4">
                        <Label className="text-[10px]">Qty pesanan</Label>
                        <Input
                          type="number"
                          min={0}
                          value={qtyDraft[r.id] ?? r.ordered_qty}
                          onChange={(e) => setQtyDraft((p) => ({ ...p, [r.id]: Number(e.target.value) }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          <div className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
            <div className="flex justify-between"><span>DPP</span><span>{rupiah(qtyPreview.dpp)}</span></div>
            <div className="flex justify-between"><span>PPN</span><span>{rupiah(qtyPreview.tax)}</span></div>
            <div className="flex justify-between font-semibold">
              <span>Grand total baru</span><span>{rupiah(qtyPreview.grand)}</span>
            </div>
          </div>

          <div>
            <Label className="text-xs">Alasan revisi (min 20 karakter)</Label>
            <Textarea
              value={qtyReason}
              onChange={(e) => setQtyReason(e.target.value.slice(0, 500))}
              rows={3}
              className="mt-1 text-sm"
            />
            <p className="text-[10px] text-muted-foreground text-right">{qtyReason.length}/500</p>
          </div>

          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setQtyOpen(false)}>Tutup</Button>
            <Button size="sm" onClick={handleSaveQty} disabled={savingQty || qtyReason.trim().length < 20}>
              {savingQty && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Simpan Revisi Qty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SoRevisionActions;