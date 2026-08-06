import React, { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportOrdersToExcel, exportOrdersToPdf, type OrderExportKind } from "@/lib/orderListExport";

interface ExportOrdersButtonProps {
  kind: OrderExportKind;
  /** Sembunyikan kolom harga (Plan Order) bila user tidak berhak melihat harga beli. */
  showPrice?: boolean;
  language?: "en" | "id";
}

export const ExportOrdersButton: React.FC<ExportOrdersButtonProps> = ({
  kind,
  showPrice = true,
  language = "id",
}) => {
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);

  const run = async (format: "xlsx" | "pdf") => {
    setBusy(format);
    const loadingId = toast.loading(
      language === "en" ? "Preparing export..." : "Menyiapkan data export...",
    );
    try {
      const res =
        format === "xlsx"
          ? await exportOrdersToExcel(kind, showPrice)
          : await exportOrdersToPdf(kind, showPrice);
      toast.success(
        language === "en"
          ? `Export ready: ${res.headerCount} documents, ${res.itemCount} item rows`
          : `Export selesai: ${res.headerCount} dokumen, ${res.itemCount} baris item`,
        { id: loadingId },
      );
    } catch (err) {
      console.error("export orders error:", err);
      toast.error(language === "en" ? "Export failed" : "Gagal export data", { id: loadingId });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy !== null}>
          {busy ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {language === "en" ? "Export Data" : "Export Data"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {language === "en" ? "All data (Header + Items)" : "Semua data (Header + Item)"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run("xlsx")}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("pdf")}>
          <FileText className="w-4 h-4 mr-2" />
          PDF (.pdf)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportOrdersButton;
