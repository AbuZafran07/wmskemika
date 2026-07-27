import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, FileDown, ExternalLink, QrCode } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { generateCertificatePdf } from "@/lib/calibrationPdf";
import { toast } from "sonner";

interface Row {
  id: string;
  sales_order_id: string;
  certificate_number: string;
  certificate_issued_at: string | null;
  instrument_name: string | null;
  instrument_brand_model: string | null;
  instrument_serial_number: string | null;
  header: { sales_order_number: string | null; spk_number: string | null; customer: { name: string | null } | null } | null;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMM yyyy", { locale: idLocale }); } catch { return d; }
}

export default function ArsipSertifikat() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sales_order_items")
      .select(`
        id, sales_order_id, certificate_number, certificate_issued_at,
        instrument_name, instrument_brand_model, instrument_serial_number,
        header:sales_order_headers!inner(sales_order_number, spk_number, customer:customers(name))
      `)
      .eq("item_type", "calibration")
      .not("certificate_number", "is", null)
      .order("certificate_issued_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) {
      toast.error("Gagal memuat arsip sertifikat");
    } else {
      setRows((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((r) =>
      [
        r.certificate_number,
        r.instrument_name,
        r.instrument_brand_model,
        r.instrument_serial_number,
        r.header?.sales_order_number,
        r.header?.spk_number,
        r.header?.customer?.name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw)),
    );
  }, [rows, q]);

  const handleDownload = async (r: Row) => {
    setGenerating(r.id);
    try {
      await generateCertificatePdf(r.sales_order_id, r.id);
    } catch (e: any) {
      toast.error(e?.message || "Gagal generate PDF");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Arsip Sertifikat Kalibrasi</h1>
          <p className="text-sm text-muted-foreground">Daftar semua sertifikat kalibrasi yang telah diterbitkan.</p>
        </div>
        <Badge variant="secondary">{filtered.length} sertifikat</Badge>
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari nomor sertifikat, alat, no. seri, pelanggan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Sertifikat</TableHead>
              <TableHead>Tgl Terbit</TableHead>
              <TableHead>Alat</TableHead>
              <TableHead>Merk / Model</TableHead>
              <TableHead>No. Seri</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>No. SPK</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin inline text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Belum ada sertifikat terbit.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.certificate_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.certificate_issued_at)}</TableCell>
                  <TableCell>{r.instrument_name || "-"}</TableCell>
                  <TableCell>{r.instrument_brand_model || "-"}</TableCell>
                  <TableCell>{r.instrument_serial_number || "-"}</TableCell>
                  <TableCell>{r.header?.customer?.name || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.header?.spk_number || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/verify/${encodeURIComponent(r.certificate_number)}`, "_blank")}
                        title="Halaman verifikasi publik"
                      >
                        <QrCode className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/verify/${encodeURIComponent(r.certificate_number)}`, "_blank")}
                        title="Buka verifikasi"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDownload(r)}
                        disabled={generating === r.id}
                      >
                        {generating === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}