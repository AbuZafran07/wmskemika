import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, CheckCircle, Save, Wrench } from "lucide-react";
import { toast } from "sonner";

interface Props {
  salesOrderId: string;
  salesOrderNumber: string;
  calibrationStatus: string | null;
  onChanged?: () => void;
}

interface Row {
  _key: string;
  id?: string;
  instrument_name: string;
  brand_model: string;
  serial_number: string;
  measurement_range: string;
  calibration_method: string;
  unit_price: string;
  sla_working_days: string;
}

const emptyRow = (): Row => ({
  _key: crypto.randomUUID(),
  instrument_name: "",
  brand_model: "",
  serial_number: "",
  measurement_range: "",
  calibration_method: "",
  unit_price: "0",
  sla_working_days: "5",
});

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

const statusLabel: Record<string, { label: string; variant: any }> = {
  pending_receipt: { label: "Menunggu Penerimaan", variant: "secondary" },
  received: { label: "Alat Diterima", variant: "default" },
  spk_issued: { label: "SPK Terbit", variant: "default" },
  spk_signed: { label: "SPK Ditandatangani", variant: "default" },
  in_progress: { label: "Dikalibrasi", variant: "default" },
  completed: { label: "Selesai", variant: "success" },
  cancelled: { label: "Dibatalkan", variant: "destructive" },
};

export function CalibrationInstrumentsPanel({ salesOrderId, salesOrderNumber, calibrationStatus, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const readOnly = !!calibrationStatus && !["pending_receipt", "draft", null].includes(calibrationStatus);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sales_order_items")
      .select("id, instrument_name, instrument_brand_model, instrument_serial_number, measurement_range, calibration_method, unit_price, sla_working_days, description")
      .eq("sales_order_id", salesOrderId)
      .eq("item_type", "calibration")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Gagal memuat daftar alat");
      setLoading(false);
      return;
    }
    const mapped: Row[] = (data ?? []).map((d: any) => ({
      _key: d.id,
      id: d.id,
      instrument_name: d.instrument_name ?? d.description ?? "",
      brand_model: d.instrument_brand_model ?? "",
      serial_number: d.instrument_serial_number ?? "",
      measurement_range: d.measurement_range ?? "",
      calibration_method: d.calibration_method ?? "",
      unit_price: String(d.unit_price ?? 0),
      sla_working_days: String(d.sla_working_days ?? 5),
    }));
    setRows(mapped.length ? mapped : [emptyRow()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrderId]);

  const total = useMemo(() => rows.reduce((s, r) => s + (parseFloat(r.unit_price) || 0), 0), [rows]);

  const update = (key: string, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((r) => (r._key === key ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (key: string) => setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r._key !== key)));

  const handleSave = async () => {
    const valid = rows.filter((r) => r.instrument_name.trim() !== "");
    if (valid.length === 0) {
      toast.error("Minimal 1 alat dengan nama harus diisi");
      return;
    }
    setSaving(true);
    try {
      const grandTotal = valid.reduce((s, r) => s + (parseFloat(r.unit_price) || 0), 0);
      // Replace strategy: delete then insert (simpler & matches usePenerimaanKalibrasi update)
      const { error: delErr } = await (supabase as any)
        .from("sales_order_items")
        .delete()
        .eq("sales_order_id", salesOrderId)
        .eq("item_type", "calibration");
      if (delErr) throw delErr;

      const payload = valid.map((r) => ({
        sales_order_id: salesOrderId,
        item_type: "calibration",
        product_id: null,
        ordered_qty: 1,
        unit_price: parseFloat(r.unit_price) || 0,
        instrument_name: r.instrument_name.trim(),
        instrument_brand_model: r.brand_model.trim() || null,
        instrument_serial_number: r.serial_number.trim() || null,
        measurement_range: r.measurement_range.trim() || null,
        calibration_method: r.calibration_method.trim() || null,
        sla_working_days: parseInt(r.sla_working_days) || 5,
        description: r.instrument_name.trim(),
      }));
      const { error: insErr } = await (supabase as any).from("sales_order_items").insert(payload);
      if (insErr) throw insErr;

      const { error: hdrErr } = await (supabase as any)
        .from("sales_order_headers")
        .update({ total_amount: grandTotal, grand_total: grandTotal })
        .eq("id", salesOrderId);
      if (hdrErr) throw hdrErr;

      toast.success("Daftar alat tersimpan");
      onChanged?.();
      await fetchItems();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReceipt = async () => {
    const valid = rows.filter((r) => r.instrument_name.trim() !== "");
    if (valid.length === 0) {
      toast.error("Simpan daftar alat sebelum konfirmasi penerimaan");
      return;
    }
    setConfirming(true);
    try {
      const { error } = await (supabase as any)
        .from("sales_order_headers")
        .update({
          calibration_status: "received",
          calibration_received_at: new Date().toISOString(),
        })
        .eq("id", salesOrderId);
      if (error) throw error;
      toast.success(`Penerimaan alat ${salesOrderNumber} dikonfirmasi`);
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Gagal konfirmasi penerimaan");
    } finally {
      setConfirming(false);
    }
  };

  const cfg = statusLabel[calibrationStatus || "pending_receipt"] ?? statusLabel.pending_receipt;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Memuat daftar alat...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          <span className="font-semibold">Penerimaan Alat</span>
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          Total nilai: <span className="font-semibold text-foreground">{formatRupiah(total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">No.</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[160px]">Nama Alat *</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">Merk/Model</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[110px]">No. Seri</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[110px]">Range</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">Metode</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">Harga (Rp)</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">SLA</th>
              {!readOnly && <th className="px-3 py-2 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, idx) => (
              <tr key={row._key} className="hover:bg-muted/20">
                <td className="px-3 py-1.5 text-muted-foreground text-center">{idx + 1}</td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-sm" value={row.instrument_name} disabled={readOnly}
                    onChange={(e) => update(row._key, "instrument_name", e.target.value)} placeholder="Nama alat" />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-sm" value={row.brand_model} disabled={readOnly}
                    onChange={(e) => update(row._key, "brand_model", e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-sm" value={row.serial_number} disabled={readOnly}
                    onChange={(e) => update(row._key, "serial_number", e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-sm" value={row.measurement_range} disabled={readOnly}
                    onChange={(e) => update(row._key, "measurement_range", e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-sm" value={row.calibration_method} disabled={readOnly}
                    onChange={(e) => update(row._key, "calibration_method", e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-sm" type="number" min="0" value={row.unit_price} disabled={readOnly}
                    onChange={(e) => update(row._key, "unit_price", e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <Input className="h-8 text-sm w-16" type="number" min="1" value={row.sla_working_days} disabled={readOnly}
                    onChange={(e) => update(row._key, "sla_working_days", e.target.value)} />
                </td>
                {!readOnly && (
                  <td className="px-2 py-1.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeRow(row._key)} disabled={rows.length === 1}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
            <Plus className="w-4 h-4" /> Tambah Alat
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
            </Button>
            <Button size="sm" onClick={handleConfirmReceipt} disabled={confirming || saving} className="gap-1.5">
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Konfirmasi Penerimaan
            </Button>
          </div>
        </div>
      )}

      {readOnly && (
        <p className="text-xs text-muted-foreground">
          Penerimaan sudah dikonfirmasi. Daftar alat tidak dapat diubah lagi dari sini.
        </p>
      )}
    </div>
  );
}