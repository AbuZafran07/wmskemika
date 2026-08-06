import React, { useCallback, useEffect, useState } from "react";
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
  fetchSalesNameGroups,
  fetchSupplierOptions,
  fetchOrderExportPreview,
  type OrderExportFilter,
  type OrderExportKind,
  type SalesNameGroup,
  type OrderExportPreview,
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
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [salesSearch, setSalesSearch] = useState("");
  const [supplierId, setSupplierId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [salesGroups, setSalesGroups] = useState<SalesNameGroup[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<OrderExportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        if (kind === "sales_order") setSalesGroups(await fetchSalesNameGroups());
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

  const buildFilter = useCallback((): OrderExportFilter => {
    return {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      salesNames:
        kind === "sales_order" && selectedSales.length
          ? salesGroups.filter((g) => selectedSales.includes(g.label)).flatMap((g) => g.variants)
          : undefined,
      salesLabels: kind === "sales_order" && selectedSales.length ? selectedSales : undefined,
      supplierId: kind === "plan_order" && supplierId !== ALL ? supplierId : undefined,
      status: status !== ALL ? status : undefined,
      includeDeleted,
    };
  }, [dateFrom, dateTo, kind, selectedSales, salesGroups, supplierId, status, includeDeleted]);

  // Preview jumlah dokumen & total nominal, dihitung ulang otomatis saat filter berubah.
  useEffect(() => {
    if (!open) return;
    if (dateFrom && dateTo && dateFrom > dateTo) return;
    let cancelled = false;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchOrderExportPreview(kind, buildFilter());
        if (!cancelled) setPreview(res);
      } catch (err) {
        console.error("export preview error:", err);
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, kind, buildFilter, dateFrom, dateTo]);

  const run = async (format: "xlsx" | "pdf") => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      toast.error(en ? "Start date is after end date" : "Tanggal awal melebihi tanggal akhir");
      return;
    }

    const filter = buildFilter();

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

  const filteredSales = salesGroups.filter((g) =>
    g.label.toLowerCase().includes(salesSearch.trim().toLowerCase()),
  );
  const allSelected = salesGroups.length > 0 && selectedSales.length === salesGroups.length;

  const toggleSales = (label: string) =>
    setSelectedSales((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label],
    );

  const showAmount = kind === "sales_order" || showPrice;
  const fmtRp = (v: number) =>
    `Rp${Number(v || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
              <div className="flex items-center justify-between">
                <Label>
                  Sales{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {selectedSales.length === 0
                      ? en
                        ? "(all sales)"
                        : "(semua sales)"
                      : `(${selectedSales.length} ${en ? "selected" : "dipilih"})`}
                  </span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    setSelectedSales(allSelected ? [] : salesGroups.map((g) => g.label))
                  }
                >
                  {allSelected ? (en ? "Clear" : "Kosongkan") : en ? "Select all" : "Pilih semua"}
                </Button>
              </div>
              <Input
                placeholder={en ? "Search sales name..." : "Cari nama sales..."}
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                className="h-8"
              />
              <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1.5">
                {filteredSales.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1 py-2">
                    {en ? "No sales found" : "Nama sales tidak ditemukan"}
                  </p>
                ) : (
                  filteredSales.map((g) => (
                    <div key={g.label} className="flex items-start gap-2">
                      <Checkbox
                        id={`sales-${g.label}`}
                        checked={selectedSales.includes(g.label)}
                        onCheckedChange={() => toggleSales(g.label)}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`sales-${g.label}`}
                        className="font-normal flex-1 cursor-pointer text-sm"
                      >
                        {g.label}
                        <span className="text-muted-foreground text-xs"> ({g.count})</span>
                        {g.variants.length > 1 && (
                          <span className="text-muted-foreground text-[11px] block">
                            {en ? "variants" : "varian"}: {g.variants.join(" • ")}
                          </span>
                        )}
                      </Label>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {en
                  ? "Spelling variants of the same name are grouped, so no rows are missed."
                  : "Varian ejaan nama yang sama otomatis digabung, jadi data tidak ada yang terlewat."}
              </p>
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

          <div className="rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                {en ? "Export preview" : "Preview data yang akan di-export"}
              </Label>
              {previewLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>

            {!preview ? (
              <p className="text-xs text-muted-foreground">
                {previewLoading
                  ? en
                    ? "Calculating..."
                    : "Menghitung..."
                  : en
                    ? "No data"
                    : "Belum ada data"}
              </p>
            ) : preview.totalDocs === 0 ? (
              <p className="text-xs text-muted-foreground">
                {en ? "No data matches this filter" : "Tidak ada data sesuai filter ini"}
              </p>
            ) : (
              <>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b">
                        <th className="text-left font-medium py-1">
                          {kind === "sales_order" ? "Sales" : "Supplier"}
                        </th>
                        <th className="text-right font-medium py-1">{en ? "Docs" : "Dokumen"}</th>
                        {showAmount && (
                          <th className="text-right font-medium py-1">
                            {en ? "Amount" : "Total Nominal"}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.groups.map((g) => (
                        <tr key={g.label} className="border-b last:border-0">
                          <td className="py-1 pr-2">{g.label}</td>
                          <td className="py-1 text-right tabular-nums">{g.count}</td>
                          {showAmount && (
                            <td className="py-1 text-right tabular-nums">{fmtRp(g.total)}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                  <span>
                    {en ? "Total" : "Total"} — {preview.totalDocs} {en ? "documents" : "dokumen"}
                  </span>
                  {showAmount && <span className="tabular-nums">{fmtRp(preview.totalAmount)}</span>}
                </div>
                {showAmount && (
                  <p className="text-[11px] text-muted-foreground">
                    {en
                      ? "Amount = grand total per document (incl. tax & shipping)."
                      : "Total nominal = grand total per dokumen (termasuk PPN & biaya kirim)."}
                  </p>
                )}
              </>
            )}
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
