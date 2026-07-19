import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Plus, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  salesOrderId: string;
  calibrationStatus: string | null;
  onChanged?: () => void;
}

interface Instrument {
  id: string;
  instrument_name: string | null;
  description: string | null;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
}

interface SparePart {
  id: string;
  instrument_id: string;
  product_id: string;
  qty_used: number;
  unit_price: number;
  notes: string | null;
  product?: { name: string | null; sku: string | null } | null;
}

const fmtRp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export function CalibrationSparepartsPanel({ salesOrderId, calibrationStatus, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({
    instrument_id: "",
    product_id: "",
    qty_used: "1",
    unit_price: "0",
    notes: "",
  });

  const canManage = !["completed", "cancelled"].includes(calibrationStatus ?? "");

  const printRequestForm = async () => {
    if (parts.length === 0) {
      toast.error("Belum ada sparepart untuk dicetak");
      return;
    }
    const { data: header } = await supabase
      .from("sales_order_headers")
      .select("sales_order_number, order_date, pic_name, calibration_location, notes, customer:customers(name, code)")
      .eq("id", salesOrderId)
      .single();

    const h: any = header || {};
    const doc = new jsPDF({ format: "a4", unit: "mm" });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date();
    const fmtD = (d: Date) =>
      d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("FORM PERMINTAAN PENGELUARAN SPAREPART", pageW / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("PT. Kemika Karya Pratama — Kalibrasi", pageW / 2, 21, { align: "center" });
    doc.setLineWidth(0.3);
    doc.line(14, 25, pageW - 14, 25);

    let y = 31;
    const line = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(`: ${value || "-"}`, 55, y);
      y += 5.5;
    };
    line("No. SO / Referensi", h.sales_order_number || "-");
    line("Tanggal Cetak", fmtD(now));
    line(
      "Customer",
      h.customer?.name ? `${h.customer.name}${h.customer.code ? ` (${h.customer.code})` : ""}` : "-",
    );
    line("PIC / Teknisi", h.pic_name || "-");
    line("Lokasi Kalibrasi", h.calibration_location || "-");

    const body = parts.map((p, i) => [
      String(i + 1),
      instrumentName(p.instrument_id),
      p.product?.name ?? "-",
      p.product?.sku ?? "-",
      String(p.qty_used),
      p.notes ?? "-",
      "",
    ]);

    autoTable(doc, {
      startY: y + 3,
      head: [["No", "Alat / Instrumen", "Sparepart", "SKU", "Qty", "Catatan", "Qty Diserahkan"]],
      body,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        4: { cellWidth: 14, halign: "center" },
        6: { cellWidth: 28 },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(9);
    doc.text(
      "Catatan: Form ini merupakan permintaan resmi pengeluaran sparepart dari warehouse untuk keperluan pekerjaan kalibrasi di atas.",
      14,
      finalY,
      { maxWidth: pageW - 28 },
    );

    const sigY = Math.max(finalY + 15, doc.internal.pageSize.getHeight() - 45);
    const colW = (pageW - 28) / 3;
    const roles = ["Diminta oleh (Sales/Teknisi)", "Diperiksa (Supervisor)", "Diserahkan (Warehouse)"];
    roles.forEach((r, i) => {
      const x = 14 + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.text(r, x, sigY, { align: "center" });
      doc.line(14 + colW * i + 10, sigY + 22, 14 + colW * (i + 1) - 10, sigY + 22);
      doc.setFont("helvetica", "normal");
      doc.text("Nama & Tanda Tangan", x, sigY + 27, { align: "center" });
      doc.text("Tgl: ______________", x, sigY + 32, { align: "center" });
    });

    doc.save(`Permintaan-Sparepart-${h.sales_order_number || salesOrderId}.pdf`);
    toast.success("Form permintaan sparepart berhasil dicetak");
  };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: items }, { data: prods }] = await Promise.all([
      supabase
        .from("sales_order_items")
        .select("id, instrument_name, description, item_type")
        .eq("sales_order_id", salesOrderId)
        .eq("item_type", "calibration")
        .order("created_at", { ascending: true }),
      supabase.from("products").select("id, name, sku").order("name", { ascending: true }).limit(500),
    ]);
    const inst: Instrument[] = (items || []).map((r: any) => ({
      id: r.id,
      instrument_name: r.instrument_name,
      description: r.description,
    }));
    setInstruments(inst);
    setProducts((prods || []) as Product[]);

    if (inst.length > 0) {
      const { data: sp } = await (supabase as any)
        .from("calibration_spare_parts")
        .select("id, instrument_id, product_id, qty_used, unit_price, notes, product:products(name, sku)")
        .in(
          "instrument_id",
          inst.map((i) => i.id),
        )
        .order("created_at", { ascending: false });
      setParts((sp || []) as SparePart[]);
    } else {
      setParts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrderId]);

  const instrumentName = (id: string) => {
    const i = instruments.find((x) => x.id === id);
    return i?.instrument_name || i?.description || "-";
  };

  const totalCost = useMemo(
    () => parts.reduce((s, p) => s + Number(p.qty_used || 0) * Number(p.unit_price || 0), 0),
    [parts],
  );

  const addPart = async () => {
    if (!newRow.instrument_id || !newRow.product_id) {
      toast.error("Pilih alat dan produk");
      return;
    }
    const qty = parseFloat(newRow.qty_used) || 0;
    if (qty <= 0) {
      toast.error("Qty harus > 0");
      return;
    }
    setAdding(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from("calibration_spare_parts")
      .insert({
        instrument_id: newRow.instrument_id,
        product_id: newRow.product_id,
        qty_used: qty,
        unit_price: parseFloat(newRow.unit_price) || 0,
        notes: newRow.notes.trim() || null,
        created_by: userRes.user?.id ?? null,
      })
      .select("id, instrument_id, product_id, qty_used, unit_price, notes, product:products(name, sku)")
      .single();
    setAdding(false);
    if (error) {
      toast.error("Gagal tambah sparepart: " + error.message);
      return;
    }
    setParts((prev) => [data as SparePart, ...prev]);
    setNewRow({ instrument_id: newRow.instrument_id, product_id: "", qty_used: "1", unit_price: "0", notes: "" });
    toast.success("Sparepart dicatat. Warehouse dapat mengeluarkan stok dari menu Stock Out.");
    onChanged?.();
  };

  const deletePart = async (id: string) => {
    if (!confirm("Hapus sparepart ini?")) return;
    const { error } = await (supabase as any).from("calibration_spare_parts").delete().eq("id", id);
    if (error) {
      toast.error("Gagal hapus: " + error.message);
      return;
    }
    setParts((prev) => prev.filter((p) => p.id !== id));
    onChanged?.();
  };

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h4 className="font-semibold">Sparepart Kalibrasi</h4>
          <Badge variant="secondary">{parts.length} item</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{fmtRp(totalCost)}</span>
          </div>
          <Button size="sm" variant="outline" onClick={printRequestForm} disabled={parts.length === 0}>
            <Printer className="w-4 h-4 mr-1" /> Cetak Form Permintaan
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : instruments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Tambahkan alat kalibrasi terlebih dulu di panel Penerimaan Alat.
        </p>
      ) : (
        <>
          {canManage && (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-3 p-3 rounded-md border bg-muted/30">
              <div className="md:col-span-2">
                <Select
                  value={newRow.instrument_id}
                  onValueChange={(v) => setNewRow((r) => ({ ...r, instrument_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih alat" /></SelectTrigger>
                  <SelectContent>
                    {instruments.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.instrument_name || i.description || "Alat"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Select
                  value={newRow.product_id}
                  onValueChange={(v) => setNewRow((r) => ({ ...r, product_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.sku ? `(${p.sku})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="number"
                min="0"
                placeholder="Qty"
                value={newRow.qty_used}
                onChange={(e) => setNewRow((r) => ({ ...r, qty_used: e.target.value }))}
              />
              <Input
                type="number"
                min="0"
                placeholder="Harga"
                value={newRow.unit_price}
                onChange={(e) => setNewRow((r) => ({ ...r, unit_price: e.target.value }))}
              />
              <div className="md:col-span-5">
                <Input
                  placeholder="Catatan (opsional)"
                  value={newRow.notes}
                  onChange={(e) => setNewRow((r) => ({ ...r, notes: e.target.value }))}
                />
              </div>
              <Button onClick={addPart} disabled={adding} className="md:col-span-1">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" />Tambah</>}
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alat</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead>Catatan</TableHead>
                {canManage && <TableHead className="w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 8 : 7} className="text-center text-sm text-muted-foreground py-6">
                    Belum ada sparepart dicatat.
                  </TableCell>
                </TableRow>
              ) : (
                parts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{instrumentName(p.instrument_id)}</TableCell>
                    <TableCell>{p.product?.name ?? "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.product?.sku ?? "-"}</TableCell>
                    <TableCell className="text-right">{p.qty_used}</TableCell>
                    <TableCell className="text-right">{fmtRp(Number(p.unit_price || 0))}</TableCell>
                    <TableCell className="text-right font-medium">
                      {fmtRp(Number(p.qty_used || 0) * Number(p.unit_price || 0))}
                    </TableCell>
                    <TableCell className="text-xs">{p.notes ?? "-"}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deletePart(p.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}