import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useCustomers } from "@/hooks/useMasterData";
import { useAuth } from "@/contexts/AuthContext";
import { createCalibrationReceipt } from "@/hooks/usePenerimaanKalibrasi";
import { listSalesPulseOpenReferences, type SalesPulseReference } from "@/lib/salesPulseSync";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (soId: string, soNumber: string) => void;
}

const DEFAULT_LOCATION = "Lab Kemika, Tangerang";
const ALLOCATION_OPTIONS = ["Internal", "Selling", "Sample", "Stock", "Project"] as const;
const CUSTOMER_PO_REGEX = /^[A-Za-z0-9/_.\-]+$/;

export function CreateCalibrationSODialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { customers } = useCustomers();

  const [customerId, setCustomerId] = useState("");
  const [picName, setPicName] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [salesPulseRef, setSalesPulseRef] = useState("");
  const [customerPO, setCustomerPO] = useState("");
  const [customerPOError, setCustomerPOError] = useState<string | null>(null);
  const [salesPulseOptions, setSalesPulseOptions] = useState<SalesPulseReference[]>([]);
  const [salesPulseSearch, setSalesPulseSearch] = useState("");
  const [salesPulseLoading, setSalesPulseLoading] = useState(false);
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState("");
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [notes, setNotes] = useState("");
  const [allocationType, setAllocationType] = useState<string>("Internal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCustomerId("");
      setPicName("");
      setPicPhone("");
      setSalesPulseRef("");
      setCustomerPO("");
      setCustomerPOError(null);
      setSalesPulseOptions([]);
      setSalesPulseSearch("");
      setReceivedDate(new Date().toISOString().slice(0, 10));
      setTargetDate("");
      setLocation(DEFAULT_LOCATION);
      setNotes("");
      setAllocationType("Internal");
      setSaving(false);
    }
  }, [open]);

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
        if (active) toast.error("Gagal memuat referensi SalesPulse");
      } finally {
        if (active) setSalesPulseLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [open, salesPulseSearch, salesPulseRef]);

  const customerOptions = useMemo(
    () => customers.map((c: any) => ({ value: c.id, label: `${c.code ? c.code + " - " : ""}${c.name}` })),
    [customers],
  );

  const salesPulseSelectOptions = useMemo(
    () =>
      salesPulseOptions.map((r) => ({
        value: r.reference_number,
        label: r.reference_number,
        description: `${r.deal_name} • ${r.customer_name}${r.sales_name ? ` • ${r.sales_name}` : ""}`,
      })),
    [salesPulseOptions],
  );

  const handleSalesPulseChange = (ref: string) => {
    setSalesPulseRef(ref);
    const picked = salesPulseOptions.find((r) => r.reference_number === ref);
    if (picked) {
      const match = customers.find((c: any) =>
        (picked.customer_code && c.code === picked.customer_code) ||
        c.name?.toLowerCase() === picked.customer_name?.toLowerCase(),
      ) as any;
      if (match && !customerId) handleCustomerChange(match.id);
    }
  };

  const handleCustomerChange = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x: any) => x.id === id) as any;
    if (c) {
      if (!picName && c.pic) setPicName(c.pic);
      if (!picPhone && c.phone) setPicPhone(c.phone);
    }
  };

  const handleSubmit = async () => {
    if (!customerId) return toast.error("Pilih customer terlebih dahulu");
    if (!receivedDate) return toast.error("Tanggal terima wajib diisi");
    if (!salesPulseRef.trim()) return toast.error("Nomor Referensi SalesPulse wajib diisi");
    const trimmedPO = customerPO.trim();
    if (trimmedPO) {
      if (trimmedPO.length < 3 || trimmedPO.length > 50) {
        setCustomerPOError("No. PO Customer harus 3–50 karakter");
        return toast.error("Format No. PO Customer tidak valid");
      }
      if (!CUSTOMER_PO_REGEX.test(trimmedPO)) {
        setCustomerPOError("Hanya huruf, angka, dan karakter / _ . -");
        return toast.error("Format No. PO Customer tidak valid");
      }
    }
    setCustomerPOError(null);
    setSaving(true);
    const res = await createCalibrationReceipt(
      {
        customer_id: customerId,
        service_pic_name: picName,
        service_pic_phone: picPhone,
        service_location: location || DEFAULT_LOCATION,
        received_date: receivedDate,
        target_completion_date: targetDate,
        customer_request_notes: notes,
        created_by: user?.id ?? null,
        sales_pulse_reference_number: salesPulseRef.trim(),
        allocation_type: allocationType,
        customer_po_number: trimmedPO || null,
      },
      [], // alat ditambahkan nanti di tab Penerimaan
    );
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || "Gagal membuat SO Kalibrasi");
      return;
    }
    toast.success(`SO Kalibrasi ${res.receipt_number} berhasil dibuat`);
    onOpenChange(false);
    if (res.id && res.receipt_number) onCreated?.(res.id, res.receipt_number);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Buat Sales Order Kalibrasi
          </DialogTitle>
          <DialogDescription>
            Nomor SO otomatis diterbitkan dengan format SO/YYYYMMDD.NN (seragam dengan Sales Order reguler). Daftar alat & harga bisa ditambahkan di tab Penerimaan Alat setelah SO tersimpan.
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
              onValueChange={handleSalesPulseChange}
              onSearchChange={setSalesPulseSearch}
              placeholder={salesPulseLoading ? "Memuat referensi..." : "Pilih No. Referensi SalesPulse"}
              searchPlaceholder="Cari nomor / deal / customer..."
              emptyMessage={salesPulseLoading ? "Memuat..." : "Tidak ada referensi terbuka"}
            />
            <p className="text-xs text-muted-foreground">Wajib diisi. Daftar diambil dari deal Sales Pulse yang masih terbuka.</p>
          </div>

          <div className="space-y-2">
            <Label>No. PO Customer</Label>
            <Input
              value={customerPO}
              onChange={(e) => {
                setCustomerPO(e.target.value);
                if (customerPOError) setCustomerPOError(null);
              }}
              placeholder="Contoh: PO/2026/001 — kosongkan jika belum ada"
              maxLength={50}
              aria-invalid={!!customerPOError}
              className={customerPOError ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {customerPOError ? (
              <p className="text-xs text-destructive">{customerPOError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Opsional (3–50 karakter, huruf/angka/<code>/ _ . -</code>). Isi setelah customer mengirim PO resmi.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nama PIC</Label>
              <Input value={picName} onChange={(e) => setPicName(e.target.value)} placeholder="Nama kontak customer" />
            </div>
            <div className="space-y-2">
              <Label>Telepon PIC</Label>
              <Input value={picPhone} onChange={(e) => setPicPhone(e.target.value)} placeholder="+62 ..." />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Lokasi Kalibrasi</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={DEFAULT_LOCATION} />
            </div>
            <div className="space-y-2">
              <Label>Alokasi Alat & Sparepart</Label>
              <Select value={allocationType} onValueChange={setAllocationType}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih alokasi" />
                </SelectTrigger>
                <SelectContent>
                  {ALLOCATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Sumber alokasi alat & sparepart (default Internal).</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Catatan / Permintaan Customer</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Opsional" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
            Buat SO Kalibrasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
