import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ClipboardList, Download, FileSignature, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { generateUniqueSPKNumber } from "@/lib/transactionNumberUtils";
import { generateSPKPdf } from "@/lib/calibrationPdf";

interface Props {
  salesOrderId: string;
  salesOrderNumber: string;
  spkNumber: string | null;
  spkIssuedAt: string | null;
  calibrationStatus: string | null;
  onChanged?: () => void;
}

function fmt(dt: string | null) {
  if (!dt) return "-";
  try {
    return new Date(dt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dt;
  }
}

export function CalibrationSPKPanel({ salesOrderId, salesOrderNumber, spkNumber, spkIssuedAt, calibrationStatus, onChanged }: Props) {
  const [issuing, setIssuing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [localSpk, setLocalSpk] = useState<string | null>(spkNumber);
  const [localIssuedAt, setLocalIssuedAt] = useState<string | null>(spkIssuedAt);
  const [localStatus, setLocalStatus] = useState<string | null>(calibrationStatus);

  useEffect(() => {
    setLocalSpk(spkNumber);
    setLocalIssuedAt(spkIssuedAt);
    setLocalStatus(calibrationStatus);
  }, [spkNumber, spkIssuedAt, calibrationStatus, salesOrderId]);

  const canIssue = localStatus === "received" && !localSpk;
  const canSign = !!localSpk && localStatus === "spk_issued";
  const canStart = localStatus === "spk_signed";
  const canPrint = !!localSpk;

  const patchHeader = async (patch: Record<string, any>) => {
    const { error } = await (supabase as any).from("sales_order_headers").update(patch).eq("id", salesOrderId);
    if (error) throw error;
  };

  const handleIssue = async () => {
    setIssuing(true);
    try {
      const number = await generateUniqueSPKNumber();
      const issuedAt = new Date().toISOString();
      await patchHeader({ spk_number: number, spk_issued_at: issuedAt, calibration_status: "spk_issued", customer_po_number: number });
      setLocalSpk(number);
      setLocalIssuedAt(issuedAt);
      setLocalStatus("spk_issued");
      toast.success(`SPK ${number} diterbitkan`);
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menerbitkan SPK");
    } finally {
      setIssuing(false);
    }
  };

  const handleSign = async () => {
    setSigning(true);
    try {
      await patchHeader({ calibration_status: "spk_signed" });
      setLocalStatus("spk_signed");
      toast.success("SPK ditandai sudah ditandatangani");
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Gagal update status");
    } finally {
      setSigning(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await patchHeader({ calibration_status: "in_progress" });
      setLocalStatus("in_progress");
      toast.success("Proses kalibrasi dimulai");
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "Gagal update status");
    } finally {
      setStarting(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await generateSPKPdf(salesOrderId);
    } catch (err: any) {
      toast.error(err?.message || "Gagal mencetak SPK");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          <span className="font-semibold">Surat Perintah Kerja (SPK)</span>
          {localSpk && <Badge variant="default">{localSpk}</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          Diterbitkan: <span className="font-medium text-foreground">{fmt(localIssuedAt)}</span>
        </div>
      </div>

      {!localSpk && localStatus !== "received" && (
        <p className="text-xs text-muted-foreground">
          Konfirmasi penerimaan alat terlebih dahulu untuk menerbitkan SPK.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canIssue && (
          <Button size="sm" onClick={handleIssue} disabled={issuing} className="gap-1.5">
            {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            Terbitkan SPK
          </Button>
        )}
        {canPrint && (
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={printing} className="gap-1.5">
            {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Cetak SPK
          </Button>
        )}
        {canSign && (
          <Button size="sm" variant="secondary" onClick={handleSign} disabled={signing} className="gap-1.5">
            {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
            Tandai SPK Ditandatangani
          </Button>
        )}
        {canStart && (
          <Button size="sm" onClick={handleStart} disabled={starting} className="gap-1.5">
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Mulai Kalibrasi
          </Button>
        )}
        {localStatus === "in_progress" && (
          <Badge variant="default" className="self-center">
            <CheckCircle className="w-3 h-3 mr-1" /> Sedang dikalibrasi
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground border-t pt-2">
        Alur: Terima Alat → Terbitkan SPK → SPK Ditandatangani → Mulai Kalibrasi → Selesai (via Tracker Kalibrasi). SO: {salesOrderNumber}
      </p>
    </div>
  );
}