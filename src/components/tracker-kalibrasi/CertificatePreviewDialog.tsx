import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Printer, Download, RefreshCw, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { generateCertificatePdf } from "@/lib/calibrationPdf";

export interface CertificatePreviewInstrument {
  id: string;
  item_number?: number;
  instrument_name: string;
  brand_model?: string | null;
  serial_number?: string | null;
  certificate_number?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptId: string;
  instruments: CertificatePreviewInstrument[];
  /** Called after a PDF is generated (issued certificates from the RPC). */
  onGenerated?: (issued: Array<{ certificate_number?: string | null }>) => void | Promise<void>;
}

/**
 * Preview PDF Sertifikat Kalibrasi sebelum dicetak.
 * Pengguna memilih instrumen (checklist) yang ingin disertakan, melihat hasil
 * PDF di viewer, lalu mencetak atau mengunduhnya.
 */
/**
 * iOS Safari & sebagian besar browser mobile tidak bisa menampilkan PDF
 * di dalam <iframe> (blob) — halaman jadi kosong/putih. Untuk perangkat
 * tersebut kita tampilkan tombol "Buka di tab baru" sebagai gantinya.
 */
function canEmbedPdf() {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  return !isIOS && !isAndroid;
}

export default function CertificatePreviewDialog({
  open,
  onOpenChange,
  receiptId,
  instruments,
  onGenerated,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("Sertifikat.pdf");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const urlRef = useRef<string | null>(null);
  const [embeddable] = useState<boolean>(() => canEmbedPdf());

  const allIds = useMemo(() => instruments.map((i) => i.id), [instruments]);

  // Reset state whenever the dialog opens
  useEffect(() => {
    if (open) {
      setSelected(allIds);
      revoke();
      setPreviewUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup blob URL on unmount
  useEffect(() => () => revoke(), []);

  function revoke() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const allChecked = selected.length === allIds.length && allIds.length > 0;

  const handlePreview = async () => {
    if (!receiptId || selected.length === 0) return;
    setLoading(true);
    try {
      const res = await generateCertificatePdf(
        receiptId,
        selected.length === allIds.length ? undefined : selected,
        { preview: true },
      );
      revoke();
      urlRef.current = res.blobUrl;
      setPreviewUrl(res.blobUrl);
      setFilename(res.filename);
      await onGenerated?.(res.issued ?? []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Gagal membuat preview sertifikat");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!previewUrl) return;
    if (!embeddable) {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      win.focus();
      win.print();
    } catch {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) revoke(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            Preview Sertifikat Kalibrasi (F-KAL-05)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pilih instrumen yang ingin dicetak, tinjau hasilnya, lalu cetak atau unduh.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_1fr]">
          {/* Checklist instrumen */}
          <div className="border-r flex flex-col min-h-0">
            <div className="px-4 py-2 border-b flex items-center gap-2">
              <Checkbox
                id="cert-all"
                checked={allChecked}
                onCheckedChange={(v) => setSelected(v ? allIds : [])}
              />
              <label htmlFor="cert-all" className="text-xs font-medium cursor-pointer">
                Pilih semua ({instruments.length})
              </label>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {instruments.length === 0 && (
                  <p className="text-xs text-muted-foreground">Tidak ada instrumen.</p>
                )}
                {instruments.map((inst) => (
                  <label
                    key={inst.id}
                    className="flex gap-2 items-start rounded-md border p-2 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selected.includes(inst.id)}
                      onCheckedChange={() => toggle(inst.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {inst.item_number ? `${inst.item_number}. ` : ""}{inst.instrument_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {[inst.brand_model, inst.serial_number].filter(Boolean).join(" • ") || "-"}
                      </p>
                      <Badge
                        variant={inst.certificate_number ? "secondary" : "outline"}
                        className="mt-1 h-4 text-[10px] px-1.5"
                      >
                        {inst.certificate_number || "Belum terbit"}
                      </Badge>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
            <div className="p-3 border-t">
              <Button
                className="w-full gap-1.5"
                size="sm"
                disabled={loading || selected.length === 0}
                onClick={handlePreview}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {previewUrl ? "Perbarui Preview" : "Tampilkan Preview"}
              </Button>
            </div>
          </div>

          {/* Viewer */}
          <div className="flex flex-col min-h-0">
            <div className="flex-1 min-h-0 bg-muted/40">
              {previewUrl && embeddable ? (
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  title="Preview Sertifikat Kalibrasi"
                  className="w-full h-full border-0"
                />
              ) : previewUrl ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Browser di perangkat ini tidak dapat menampilkan PDF secara langsung.
                    Buka dokumen di tab baru untuk melihat hasilnya.
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="w-4 h-4" /> Buka di Tab Baru
                  </Button>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center px-6">
                  <p className="text-xs text-muted-foreground">
                    {loading
                      ? "Menyiapkan dokumen..."
                      : "Pilih instrumen lalu klik “Tampilkan Preview” untuk melihat sertifikat sebelum dicetak."}
                  </p>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!previewUrl} onClick={handleDownload}>
                <Download className="w-4 h-4" /> Unduh
              </Button>
              <Button size="sm" className="gap-1.5" disabled={!previewUrl} onClick={handlePrint}>
                <Printer className="w-4 h-4" /> Cetak
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}