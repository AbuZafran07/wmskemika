import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useCustomers } from "@/hooks/useMasterData";
import { useAuth } from "@/contexts/AuthContext";
import { createCalibrationReceipt } from "@/hooks/usePenerimaanKalibrasi";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (soId: string, soNumber: string) => void;
}

const DEFAULT_LOCATION = "Lab Kemika, Tangerang";

export function CreateCalibrationSODialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { customers } = useCustomers();

  const [customerId, setCustomerId] = useState("");
  const [picName, setPicName] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetDate, setTargetDate] = useState("");
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCustomerId("");
      setPicName("");
      setPicPhone("");
      setReceivedDate(new Date().toISOString().slice(0, 10));
      setTargetDate("");
      setLocation(DEFAULT_LOCATION);
      setNotes("");
      setSaving(false);
    }
  }, [open]);

  const customerOptions = useMemo(
    () => customers.map((c: any) => ({ value: c.id, label: `${c.code ? c.code + " - " : ""}${c.name}` })),
    [customers],
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
    if (!customerId) return toast.error("Pilih customer terlebih dahulu");
    if (!receivedDate) return toast.error("Tanggal terima wajib diisi");
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

          <div className="space-y-2">
            <Label>Lokasi Kalibrasi</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={DEFAULT_LOCATION} />
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
