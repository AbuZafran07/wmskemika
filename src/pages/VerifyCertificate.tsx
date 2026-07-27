import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, ShieldCheck, Ban } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface CertData {
  status: "valid" | "revoked" | "not_found";
  certificate_number: string;
  certificate_issued_at: string | null;
  instrument_name: string | null;
  brand_model: string | null;
  serial_number: string | null;
  measurement_range: string | null;
  calibration_method: string | null;
  sales_order_number: string | null;
  spk_number: string | null;
  customer_name: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMMM yyyy", { locale: idLocale }); } catch { return d; }
}

export default function VerifyCertificate() {
  const { certNumber } = useParams<{ certNumber: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CertData | null>(null);

  useEffect(() => {
    (async () => {
      if (!certNumber) return;
      const { data: rows } = await (supabase as any).rpc("verify_certificate", { p_number: certNumber });
      const row = Array.isArray(rows) ? rows[0] : rows;
      setData(row || null);
      setLoading(false);
    })();
  }, [certNumber]);

  const status = data?.status ?? "not_found";
  const isValid = status === "valid";
  const isRevoked = status === "revoked";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card border rounded-2xl shadow-lg p-8 space-y-6">
        <div className="flex items-center gap-3 border-b pb-4">
          <ShieldCheck className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Verifikasi Sertifikat Kalibrasi</h1>
            <p className="text-xs text-muted-foreground">PT. Kemika Karya Pratama — Calibration Laboratory</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : status !== "not_found" ? (
          <>
            {isValid ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-semibold">Sertifikat Valid</div>
                  <div className="text-xs opacity-80">Certificate is authentic and issued by PT Kemika Karya Pratama.</div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                <div className="flex items-center gap-2">
                  <Ban className="w-5 h-5 shrink-0" />
                  <div className="font-semibold">Sertifikat Dibatalkan (Revoked)</div>
                </div>
                <div className="text-xs mt-1 opacity-90">
                  Sertifikat ini telah dibatalkan oleh laboratorium pada {fmtDate(data!.revoked_at)}.
                </div>
                {data!.revoked_reason && (
                  <div className="text-xs mt-2">
                    <span className="opacity-70">Alasan:</span> <span className="font-medium">{data!.revoked_reason}</span>
                  </div>
                )}
              </div>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row k="No. Sertifikat" v={data!.certificate_number} />
              <Row k="Tanggal Terbit" v={fmtDate(data!.certificate_issued_at)} />
              <Row k="Nama Alat" v={data!.instrument_name || "-"} />
              <Row k="Merk / Model" v={data!.brand_model || "-"} />
              <Row k="No. Seri" v={data!.serial_number || "-"} />
              <Row k="Rentang Ukur" v={data!.measurement_range || "-"} />
              <Row k="Metode Kalibrasi" v={data!.calibration_method || "-"} />
              <Row k="No. SPK" v={data!.spk_number || "-"} />
              <Row k="Pelanggan" v={data!.customer_name || "-"} full />
            </dl>
          </>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
            <XCircle className="w-5 h-5" />
            <div>
              <div className="font-semibold">Sertifikat Tidak Ditemukan</div>
              <div className="text-xs opacity-80">Nomor sertifikat <b>{certNumber}</b> tidak terdaftar pada sistem.</div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t text-center text-xs text-muted-foreground">
          <Link to="/login" className="hover:text-primary">Masuk ke Sistem</Link> • www.kemika.co.id
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium break-words">{v}</dd>
    </div>
  );
}