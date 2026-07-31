import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Search, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function VerifyCertificateLanding() {
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = number.trim();
    if (!trimmed) {
      setError("Masukkan nomor sertifikat terlebih dahulu.");
      return;
    }
    setError("");
    navigate(`/verify/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-start justify-center px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="w-full max-w-lg bg-card border rounded-2xl shadow-lg p-5 sm:p-8 space-y-6">
        <div className="flex items-center gap-3 border-b pb-4">
          <ShieldCheck className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Portal Verifikasi Sertifikat Kalibrasi</h1>
            <p className="text-xs text-muted-foreground">PT. Kemika Karya Pratama — Calibration Laboratory</p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Selamat datang di portal verifikasi sertifikat kalibrasi resmi PT. Kemika Karya Pratama.
          </p>
          <p>
            Masukkan nomor sertifikat pada kolom di bawah untuk memeriksa keabsahan, masa berlaku, dan detail kalibrasi.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Contoh: LAB-SK-20260101.01"
              className="pl-9"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2">
            Verifikasi Sertifikat
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        <div className="pt-4 border-t text-center text-xs text-muted-foreground">
          PT. Kemika Karya Pratama • www.kemika.co.id
        </div>
      </div>
    </div>
  );
}
