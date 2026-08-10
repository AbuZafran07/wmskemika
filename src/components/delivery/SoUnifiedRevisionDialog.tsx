/**
 * SoUnifiedRevisionDialog
 *
 * Dialog terpadu "Revisi (Qty & Harga)" untuk SO yang sudah delivered.
 * Auto-routing saat simpan:
 *  - Hanya harga/diskon berubah -> Tier 1: sales_order_revise_pricing (stok tidak disentuh)
 *  - Ada qty berubah           -> Tier 2: sales_order_force_revision_qty lalu sales_order_revise_qty
 *                                 (+ koreksi harga bila juga berubah, + draft stock adjustment bila qty turun)
 *
 * Tidak memakai sales_order_update. Invoice AR TIDAK diubah.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Loader2, Pencil } from "lucide-react";
import {
  reviseSalesOrderPricing,
  forceSalesOrderRevisionQty,
  reviseSalesOrderQty,
  DeliveredSnapshotEntry,
} from "@/hooks/useSalesOrders";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  salesOrderId: string;
  salesOrderNumber: string;
  onChanged?: () => void;
}

interface Row {
  id: string;
  product_name: string;
  ordered_qty: number;
  unit_price: number;
  discount: number;
}

interface HeaderInfo {
  discount: number;
  shipping_cost: number;
  grand_total: number;
}

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

/** Formula identik dengan helper DB recompute_sales_order_totals */
function computeTotals(rows: Array<{ ordered_qty: number; unit_price: number }>, header: HeaderInfo) {
  const gross = rows.reduce((s, r) => s + Number(r.ordered_qty || 0) * Number(r.unit_price || 0), 0);
  const dpp = gross - Number(header.discount || 0);
  const dppP = Math.round((dpp * 11) / 12);
  const tax = Math.round((dppP * 12) / 100);
  return { dpp, tax, grand: dpp + tax + Number(header.shipping_cost || 0) };
}

export function SoUnifiedRevisionDialog({
  open,
  onOpenChange,
  cardId,
  salesOrderId,
  salesOrderNumber,
  onChanged,
}: Props) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [header, setHeader] = useState<HeaderInfo>({ discount: 0, shipping_cost: 0, grand_total: 0 });
  const [draft, setDraft] = useState<Record<string, { ordered_qty: number; unit_price: number; discount: number }>>({});
  const [reason, setReason] = useState("");
  const [soConfirm, setSoConfirm] = useState("");

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
          .select("id, ordered_qty, unit_price, discount, description, products(name)")
          .eq("sales_order_id", salesOrderId)
          .order("created_at"),
      ]);

      setHeader({
        discount: Number(h?.discount || 0),
        shipping_cost: Number(h?.shipping_cost || 0),
        grand_total: Number(h?.grand_total || 0),
      });

      const mapped: Row[] = (its || []).map((it: any) => ({
        id: it.id,
        product_name: it.products?.name || it.description || "-",
        ordered_qty: Number(it.ordered_qty || 0),
        unit_price: Number(it.unit_price || 0),
        discount: Number(it.discount || 0),
      }));
      setRows(mapped);
      setDraft(
        Object.fromEntries(
          mapped.map((r) => [r.id, { ordered_qty: r.ordered_qty, unit_price: r.unit_price, discount: r.discount }]),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

  useEffect(() => {
    if (open) {
      setReason("");
      setSoConfirm("");
      fetchSo();
    }
  }, [open, fetchSo]);

  const val = (r: Row) => draft[r.id] ?? { ordered_qty: r.ordered_qty, unit_price: r.unit_price, discount: r.discount };

  const qtyChanged = useMemo(() => rows.some((r) => val(r).ordered_qty !== r.ordered_qty), [rows, draft]);
  const priceChanged = useMemo(
    () => rows.some((r) => val(r).unit_price !== r.unit_price || val(r).discount !== r.discount),
    [rows, draft],
  );
  const hasChange = qtyChanged || priceChanged;

  const preview = useMemo(
    () => computeTotals(rows.map((r) => ({ ordered_qty: val(r).ordered_qty, unit_price: val(r).unit_price })), header),
    [rows, draft, header],
  );

  const canSave =
    hasChange && reason.trim().length >= 20 && (!qtyChanged || soConfirm.trim() === salesOrderNumber) && !saving;

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

  const handleSave = async () => {
    if (!canSave) return;
    const trimmed = reason.trim();
    setSaving(true);
    try {
      if (!qtyChanged) {
        // ── Tier 1: koreksi harga/diskon saja ──
        const payload = rows
          .filter((r) => val(r).unit_price !== r.unit_price || val(r).discount !== r.discount)
          .map((r) => ({ item_id: r.id, unit_price: val(r).unit_price, discount: val(r).discount }));
        const res = await reviseSalesOrderPricing(salesOrderId, trimmed, payload);
        if (!res.success) {
          toast.error(res.error || "Gagal koreksi harga");
          return;
        }
        toast.success(`Harga SO ${salesOrderNumber} dikoreksi. Grand total baru: ${rupiah(res.grandTotal || 0)}`);
        await addActivityComment(
          `💰 Koreksi harga SO ${salesOrderNumber} oleh ${user?.name || user?.email}. Grand total baru: ${rupiah(
            res.grandTotal || 0,
          )}. Alasan: ${trimmed}. (Invoice AR tidak berubah otomatis.)`,
        );
        onOpenChange(false);
        onChanged?.();
        return;
      }

      // ── Tier 2: qty berubah ──
      const force = await forceSalesOrderRevisionQty(salesOrderId, trimmed);
      if (!force.success) {
        toast.error(force.error || "Gagal memaksa revisi qty");
        return;
      }
      const snapshot: DeliveredSnapshotEntry[] = force.deliveredSnapshot || [];

      const qtyPayload = rows.map((r) => ({
        item_id: r.id,
        ordered_qty: Math.max(0, Math.floor(Number(val(r).ordered_qty))),
      }));
      const res = await reviseSalesOrderQty(salesOrderId, trimmed, qtyPayload, snapshot);
      if (!res.success) {
        toast.error(res.error || "Gagal revisi qty");
        return;
      }
      if (res.warning) toast.warning(res.warning);

      // Bila harga juga berubah, koreksi harga lewat RPC Tier 1
      if (priceChanged) {
        const pricePayload = rows
          .filter((r) => val(r).unit_price !== r.unit_price || val(r).discount !== r.discount)
          .map((r) => ({ item_id: r.id, unit_price: val(r).unit_price, discount: val(r).discount }));
        const pr = await reviseSalesOrderPricing(salesOrderId, trimmed, pricePayload);
        if (!pr.success) toast.warning(`Qty direvisi, namun koreksi harga gagal: ${pr.error}`);
      }

      if (res.adjustmentNumber) {
        toast.success(
          `Qty SO ${salesOrderNumber} direvisi. Draft Stock Adjustment ${res.adjustmentNumber} dibuat untuk selisih kelebihan kirim — wajib direview.`,
        );
      } else {
        toast.success(`Qty SO ${salesOrderNumber} direvisi. WAJIB approve ulang & kirim ulang SO ini.`);
      }
      await addActivityComment(
        `🔢 Revisi ${priceChanged ? "qty & harga" : "qty"} SO ${salesOrderNumber} oleh ${
          user?.name || user?.email
        }. Alasan: ${trimmed}.${
          res.adjustmentNumber ? ` Draft Stock Adjustment: ${res.adjustmentNumber} (write-off selisih kelebihan kirim).` : ""
        } SO WAJIB di-approve ulang dan dikirim ulang.`,
      );
      onOpenChange(false);
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" /> Revisi — {salesOrderNumber}
          </DialogTitle>
          <DialogDescription>
            Ubah qty dan/atau harga. Sistem otomatis memilih cara teraman saat menyimpan.
          </DialogDescription>
        </DialogHeader>

        {/* Banner mode dinamis */}
        {hasChange && (
          <div
            className={`rounded-md border p-2 text-xs flex items-start gap-2 ${
              qtyChanged
                ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {qtyChanged ? (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>
              {qtyChanged
                ? "Mode Revisi Qty: pengiriman dibatalkan (stok dikembalikan) lalu dikirim ulang. Jika qty turun, dibuat draft stock adjustment."
                : "Mode Koreksi Harga: aman, stok & pengiriman tidak disentuh."}
            </span>
          </div>
        )}

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="max-h-[40vh] pr-2">
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground px-2">
                <span className="col-span-5">Produk</span>
                <span className="col-span-2">Qty</span>
                <span className="col-span-3">Harga (Rp)</span>
                <span className="col-span-2">Diskon</span>
              </div>
              {rows.map((r) => {
                const d = val(r);
                const qDirty = d.ordered_qty !== r.ordered_qty;
                const pDirty = d.unit_price !== r.unit_price;
                const disDirty = d.discount !== r.discount;
                const dirtyCls = "border-primary ring-1 ring-primary/40";
                return (
                  <div key={r.id} className="grid grid-cols-12 gap-2 items-center border rounded-md p-2">
                    <div className="col-span-5">
                      <p className="text-xs font-medium truncate">{r.product_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Awal: {r.ordered_qty} × {rupiah(r.unit_price)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={0}
                        value={d.ordered_qty}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [r.id]: { ...d, ordered_qty: Number(e.target.value) } }))
                        }
                        className={`h-8 text-xs ${qDirty ? dirtyCls : ""}`}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={0}
                        value={d.unit_price}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [r.id]: { ...d, unit_price: Number(e.target.value) } }))
                        }
                        className={`h-8 text-xs ${pDirty ? dirtyCls : ""}`}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={0}
                        value={d.discount}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, [r.id]: { ...d, discount: Number(e.target.value) } }))
                        }
                        className={`h-8 text-xs ${disDirty ? dirtyCls : ""}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
          <div className="flex justify-between"><span>DPP</span><span>{rupiah(preview.dpp)}</span></div>
          <div className="flex justify-between"><span>PPN</span><span>{rupiah(preview.tax)}</span></div>
          <div className="flex justify-between font-semibold">
            <span>Grand total baru</span><span>{rupiah(preview.grand)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Sebelumnya: {rupiah(header.grand_total)}</p>
          <p className="text-[10px] text-muted-foreground">
            Perubahan harga tidak otomatis mengubah invoice AR.
          </p>
        </div>

        <div>
          <Label className="text-xs">Alasan revisi (min 20 karakter)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            rows={3}
            className="mt-1 text-sm"
            placeholder="Jelaskan alasan revisi qty/harga..."
          />
          <p className="text-[10px] text-muted-foreground text-right">{reason.length}/500</p>
        </div>

        {qtyChanged && (
          <div>
            <Label className="text-xs">
              Ketik ulang nomor SO <span className="font-semibold text-foreground">{salesOrderNumber}</span> untuk konfirmasi
            </Label>
            <Input
              value={soConfirm}
              onChange={(e) => setSoConfirm(e.target.value)}
              placeholder={salesOrderNumber}
              className="mt-1 text-sm"
            />
          </div>
        )}

        {!hasChange && !loading && (
          <p className="text-xs text-muted-foreground">Tidak ada perubahan — ubah qty atau harga terlebih dahulu.</p>
        )}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Simpan Revisi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SoUnifiedRevisionDialog;
