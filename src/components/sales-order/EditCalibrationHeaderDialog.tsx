import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Save, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useCustomers } from "@/hooks/useMasterData";
import { updateCalibrationReceipt } from "@/hooks/usePenerimaanKalibrasi";
import { listSalesPulseOpenReferences, type SalesPulseReference } from "@/lib/salesPulseSync";

const DEFAULT_LOCATION = "Lab Kemika, Tangerang";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any | null;
  onSaved?: () => void;
}

export function EditCalibrationHeaderDialog({ open, onOpenChange, order, onSaved }: Props) {
  const { customers } = useCustomers();

  const [customerId, setCustomerId] = useState("");
  const [picName, setPicName] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [salesPulseRef, setSalesPulseRef] = useState("");
  const [salesPulseOptions, setSalesPulseOptions] = useState<SalesPulseReference[]>([]);
  const [salesPulseSearch, setSalesPulseSearch] = useState("");
  const [salesPulseLoading, setSalesPulseLoading] = useState(false);
  const [receivedDate, setReceivedDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setCustomerId(order.customer_id ?? "");
    setPicName(order.service_pic_name ?? "");
    setPicPhone(order.service_pic_phone ?? "");
    setSalesPulseRef(order.sales_pulse_reference_number ?? "");
    const rec = order.calibration_received_at ?? order.order_date ?? "";
    setReceivedDate(rec ? String(rec).slice(0, 10) : "");
    setTargetDate(order.target_completion_date ? String(order.target_completion_date).slice(0, 10) : "");
    setLocation(order.service_location ?? DEFAULT_LOCATION);
    setNotes(order.customer_request_notes ?? "");
    setSalesPulseSearch("");
  }, [open, order]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = window.setTimeout(async () => {
      setSalesPulseLoading(true);
      try {
        const data = await listSalesPulseOpenReferences({
          search: salesPulseSearch.trim() || undefined,
          includeSelectedReference: salesPulseRef || undefined,
        });
        if (active) setSalesPulseOptions(data);
      } catch (e) {
        console.error("Failed to load Sales Pulse references:", e);
      } finally {
        if (active) setSalesPulseLoading(false);
      }
    }, 300);
    return () => { active = false; window.clearTimeout(t); };
  }, [open, salesPulseSearch, salesPulseRef]);

  const customerOptions = useMemo(
    () => customers.map((c: any) => ({ value: c.id, label: `${c.code ? c.code + " - " : ""}${c.name}` })),
    [customers],
  );

  const salesPulseSelectOptions = useMemo(
    () => salesPulseOptions.map((r) => ({
      value: r.reference_number,
      label: r.reference_number,
      description: `${r.deal_name} • ${r.customer_name}${r.sales_name ? ` • ${r.sales_name}` : ""}`,
    })),
    [salesPulseOptions],
  );

  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x: any) => x.id === id) as any;
    if (c) {
      if (!picName && c.pic) setPicName(c.pic);
      if (!picPhone && c.phone) setPicPhone(c.phone);
    }
  };

  const handleSubmit = async () => {
    if (!order) return;
    if (!customerId) return toast.error("Pilih customer terlebih dahulu");
    if (!receivedDate) return toast.error("Tanggal terima wajib diisi");
    if (!salesPulseRef.trim()) return toast.error("No. Referensi SalesPulse wajib diisi");
    setSaving(true);
    const res = await updateCalibrationReceipt(order.id, {
      customer_id: customerId,
      service_pic_name: picName,
      service_pic_phone: picPhone,
      service_location: location || DEFAULT_LOCATION,
      received_date: receivedDate,
      target_completion_date: targetDate,
      customer_request_notes: notes,
      sales_pulse_reference_number: salesPulseRef.trim(),
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || "Gagal memperbarui SO Kalibrasi");
      return;
    }
    toast.success("Info SO Kalibrasi berhasil diperbarui");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Edit Info SO Kalibrasi
          </DialogTitle>
          <DialogDescription>
            Ubah customer, referensi, PIC, tanggal & catatan. Daftar alat & sparepart tetap dikelola dari panel di detail SO.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Customer <span className="text-destructive">*</span></Label>
            <SearchableSelect
              options={customerOptions}
              value={customerId}
              onValueChange={handleCustomerChange}
              placeholder="Pilih customer"
              searchPlaceholder="Cari customer..."
            />
          </div>

          <div className="space-y-2">
            <Label>No. Referensi SalesPulse <span className="text-destructive">*</span></Label>
            <SearchableSelect
              options={salesPulseSelectOptions}
              value={salesPulseRef}
              onValueChange={setSalesPulseRef}
              onSearchChange={setSalesPulseSearch}
              placeholder={salesPulseLoading ? "Memuat referensi..." : "Pilih No. Referensi SalesPulse"}
              searchPlaceholder="Cari nomor / deal / customer..."
              emptyMessage={salesPulseLoading ? "Memuat..." : "Tidak ada referensi terbuka"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nama PIC</Label>
              <Input value={picName} onChange={(e) => setPicName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telepon PIC</Label>
              <Input value={picPhone} onChange={(e) => setPicPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tanggal Terima <span className="text-destructive">*</span></Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target Selesai</Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lokasi Kalibrasi</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={DEFAULT_LOCATION} />
          </div>

          <div className="space-y-2">
            <Label>Catatan / Permintaan Customer</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
