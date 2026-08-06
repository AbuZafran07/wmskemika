import React, { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportOrdersToExcel,
  exportOrdersToPdf,
  fetchSalesNames,
  fetchSupplierOptions,
  type OrderExportFilter,
  type OrderExportKind,
} from "@/lib/orderListExport";

interface ExportOrdersButtonProps {
  kind: OrderExportKind;
  /** Sembunyikan kolom harga (Plan Order) bila user tidak berhak melihat harga beli. */
  showPrice?: boolean;
  language?: "en" | "id";
}

const ALL = "__all__";

const SO_STATUS = ["draft", "pending", "approved", "partially_delivered", "delivered", "cancelled"];
const PO_STATUS = ["draft", "pending", "approved", "partially_delivered", "received", "cancelled"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type PresetKey = "this_month" | "last_month" | "this_quarter" | "this_year" | "all";

function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":
      return { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
    case "this_quarter": {
      const qs = Math.floor(m / 3) * 3;
      return { from: toISO(new Date(y, qs, 1)), to: toISO(new Date(y, qs + 3, 0)) };
    }
    case "this_year":
      return { from: toISO(new Date(y, 0, 1)), to: toISO(new Date(y, 11, 31)) };
    default:
      return { from: "", to: "" };
  }
}

export const ExportOrdersButton: React.FC<ExportOrdersButtonProps> = ({
  kind,
  showPrice = true,
  language = "id",
}) => {
  const en = language === "en";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [salesName, setSalesName] = useState(ALL);
  const [supplierId, setSupplierId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [salesOptions, setSalesOptions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        if (kind === "sales_order") setSalesOptions(await fetchSalesNames());
        else setSupplierOptions(await fetchSupplierOptions());
      } catch (err) {
        console.error("load export filter options error:", err);
      }
    })();
  }, [open, kind]);

  const applyPreset = (key: PresetKey) => {
    const r = presetRange(key);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const run = async (format: "xlsx" | "pdf") => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.error(en ? "Start date is after end date" : "Tanggal awal melebihi tanggal akhir");
      return;
    }

    const filter: OrderExportFilter = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      salesName: kind === "sales_order" && salesName !== ALL ? salesName : undefined,
      supplierId: kind === "plan_order" && supplierId !== ALL ? supplierId : undefined,
      status: status !== ALL ? status : undefined,
      includeDeleted,
    };

    setBusy(format);
    const loadingId = toast.loading(en ? "Preparing export..." : "Menyiapkan data export...");
    try {
      const res =
        format === "xlsx"
          ? await exportOrdersToExcel(kind, showPrice, filter)
          : await exportOrdersToPdf(kind, showPrice, filter);

      if (res.headerCount === 0) {
        toast.warning(
          en ? "No data matches the selected filter" : "Tidak ada data sesuai filter yang dipilih",
          { id: loadingId },
        );
        return;
      }

      toast.success(
        en
          ? `Export ready: ${res.headerCount} documents, ${res.itemCount} item rows`
          : `Export selesai: ${res.headerCount} dokumen, ${res.itemCount} baris item`,
        { id: loadingId },
      );
      setOpen(false);
    } catch (err) {
      console.error("export orders error:", err);
      toast.error(en ? "Export failed" : "Gagal export data", { id: loadingId });
    } finally {
      setBusy(null);
    }
  };

  const statusList = kind === "sales_order" ? SO_STATUS : PO_STATUS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {en ? "Export Data" : "Export Data"}{" "}
            {kind === "sales_order" ? "Sales Order" : "Plan Order"}
          </DialogTitle>
          <DialogDescription>
            {en
              ? "Choose the period and filters, then pick the output format (Header + Items)."
              : "Pilih periode & filter, lalu pilih format file (berisi Header + Detail Item)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{en ? "Quick period" : "Periode cepat"}</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset("this_month")}>
                {en ? "This month" : "Bulan ini"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset("last_month")}>
                {en ? "Last month" : "Bulan lalu"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset("this_quarter")}>
                {en ? "This quarter" : "Kuartal ini"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => applyPreset("this_year")}>
                {en ? "This year" : "Tahun ini"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => applyPreset("all")}>
                {en ? "All dates" : "Semua tanggal"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-from">{en ? "From date" : "Tanggal dari"}</Label>
              <Input
                id="exp-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-to">{en ? "To date" : "Tanggal sampai"}</Label>
              <Input
                id="exp-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {kind === "sales_order" ? (
            <div className="space-y-1.5">
              <Label>Sales</Label>
              <Select value={salesName} onValueChange={setSalesName}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{en ? "All sales" : "Semua sales"}</SelectItem>
                  {salesOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{en ? "All suppliers" : "Semua supplier"}</SelectItem>
                  {supplierOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{en ? "All statuses" : "Semua status"}</SelectItem>
                {statusList.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="exp-deleted"
              checked={includeDeleted}
              onCheckedChange={(v) => setIncludeDeleted(v === true)}
            />
            <Label htmlFor="exp-deleted" className="font-normal">
              {en ? "Include deleted documents" : "Sertakan dokumen yang sudah dihapus"}
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => run("xlsx")} disabled={busy !== null}>
            {busy === "xlsx" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            Excel (.xlsx)
          </Button>
          <Button onClick={() => run("pdf")} disabled={busy !== null}>
            {busy === "pdf" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            PDF (.pdf)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportOrdersButton;
