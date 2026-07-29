import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, FileDown, QrCode, Ban } from "lucide-react";
import { DataTablePagination } from "@/components/DataTablePagination";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { generateCertificatePdf } from "@/lib/calibrationPdf";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Row {
  id: string;
  sales_order_id: string;
  certificate_number: string;
  certificate_issued_at: string | null;
  instrument_name: string | null;
  instrument_brand_model: string | null;
  instrument_serial_number: string | null;
  certificate_revoked_at: string | null;
  certificate_revoked_reason: string | null;
  header: { sales_order_number: string | null; spk_number: string | null; customer: { name: string | null } | null } | null;
}

interface ScanLog {
  id: string;
  certificate_number: string;
  result: string;
  scanned_at: string;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  try { return format(new Date(d), "dd MMM yyyy", { locale: idLocale }); } catch { return d; }
}

function addOneYear(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

function certStatus(r: { certificate_revoked_at: string | null; certificate_issued_at: string | null }): {
  key: "revoked" | "expired" | "expiring" | "valid";
  label: string;
  daysLeft: number | null;
} {
  if (r.certificate_revoked_at) return { key: "revoked", label: "Revoked", daysLeft: null };
  const exp = addOneYear(r.certificate_issued_at);
  if (!exp) return { key: "valid", label: "Valid", daysLeft: null };
  const diffMs = exp.getTime() - Date.now();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return { key: "expired", label: "Expired", daysLeft: days };
  if (days <= 30) return { key: "expiring", label: `Expiring (${days}h)`, daysLeft: days };
  return { key: "valid", label: "Valid", daysLeft: days };
}

export default function ArsipSertifikat() {
  const { user } = useAuth();
  const canRevoke = ["super_admin", "admin", "finance"].includes(user?.role || "");
  const canViewLogs = ["super_admin", "admin"].includes(user?.role || "");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "valid" | "expiring" | "archived">("all");
  const [page, setPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [logsPageSize, setLogsPageSize] = useState(20);

  const [revokeTarget, setRevokeTarget] = useState<Row | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  // Scan logs state
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logQ, setLogQ] = useState("");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sales_order_items")
      .select(`
        id, sales_order_id, certificate_number, certificate_issued_at,
        instrument_name, instrument_brand_model, instrument_serial_number,
        certificate_revoked_at, certificate_revoked_reason,
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

  const fetchLogs = async () => {
    if (!canViewLogs) return;
    setLogsLoading(true);
    let query: any = (supabase as any)
      .from("certificate_verification_logs")
      .select("id, certificate_number, result, scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(500);
    if (logQ.trim()) query = query.ilike("certificate_number", `%${logQ.trim()}%`);
    if (logFrom) query = query.gte("scanned_at", `${logFrom}T00:00:00`);
    if (logTo) query = query.lte("scanned_at", `${logTo}T23:59:59`);
    const { data, error } = await query;
    if (error) toast.error("Gagal memuat riwayat scan");
    else setLogs((data as any) || []);
    setLogsLoading(false);
  };

  useEffect(() => { if (canViewLogs) fetchLogs(); /* eslint-disable-next-line */ }, [canViewLogs]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let base = rows;
    if (statusFilter !== "all") {
      base = base.filter((r) => {
        const k = certStatus(r).key;
        if (statusFilter === "archived") return k === "expired" || k === "revoked";
        return k === statusFilter;
      });
    }
    if (!kw) return base;
    return base.filter((r) =>
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
  }, [rows, q, statusFilter]);

  useEffect(() => { setPage(1); }, [q, statusFilter, rows]);
  useEffect(() => { setLogsPage(1); }, [logs]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalLogPages = Math.max(1, Math.ceil(logs.length / logsPageSize));
  const pageLogs = logs.slice((logsPage - 1) * logsPageSize, logsPage * logsPageSize);

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

  const submitRevoke = async () => {
    if (!revokeTarget) return;
    if (revokeReason.trim().length < 10) {
      toast.error("Alasan minimal 10 karakter");
      return;
    }
    setRevoking(true);
    const { data, error } = await (supabase as any).rpc("revoke_certificate", {
      p_item_id: revokeTarget.id,
      p_reason: revokeReason.trim(),
    });
    setRevoking(false);
    if (error || !data?.success) {
      toast.error(error?.message || data?.error || "Gagal revoke sertifikat");
      return;
    }
    toast.success("Sertifikat berhasil di-revoke");
    setRevokeTarget(null);
    setRevokeReason("");
    fetchRows();
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

      <Tabs defaultValue="archive">
        <TabsList>
          <TabsTrigger value="archive">Arsip Sertifikat</TabsTrigger>
          {canViewLogs && <TabsTrigger value="logs">Riwayat Scan</TabsTrigger>}
        </TabsList>

        <TabsContent value="archive" className="space-y-4">
          <Card className="p-3">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nomor sertifikat, alat, no. seri, pelanggan…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { k: "all", label: "Semua" },
                  { k: "valid", label: "Valid" },
                  { k: "expiring", label: "Akan Expired" },
                  { k: "archived", label: "Expired / Revoked" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.k}
                    size="sm"
                    variant={statusFilter === opt.k ? "default" : "outline"}
                    onClick={() => setStatusFilter(opt.k)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Sertifikat</TableHead>
              <TableHead>Tgl Terbit</TableHead>
              <TableHead>Berlaku Sampai</TableHead>
              <TableHead>Status</TableHead>
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
                <TableCell colSpan={10} className="text-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin inline text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                  Belum ada sertifikat terbit.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r) => {
                const st = certStatus(r);
                const expiresAt = addOneYear(r.certificate_issued_at);
                return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.certificate_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.certificate_issued_at)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {expiresAt ? fmtDate(expiresAt.toISOString()) : "-"}
                  </TableCell>
                  <TableCell>
                    {st.key === "revoked" && (
                      <Badge variant="destructive" title={r.certificate_revoked_reason || ""}>Revoked</Badge>
                    )}
                    {st.key === "expired" && (
                      <Badge variant="destructive">Expired</Badge>
                    )}
                    {st.key === "expiring" && (
                      <Badge className="bg-amber-500 hover:bg-amber-500">{st.label}</Badge>
                    )}
                    {st.key === "valid" && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">Valid</Badge>
                    )}
                  </TableCell>
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
                        onClick={() => handleDownload(r)}
                        disabled={generating === r.id}
                      >
                        {generating === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                      </Button>
                      {canRevoke && !r.certificate_revoked_at && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => { setRevokeTarget(r); setRevokeReason(""); }}
                          title="Revoke sertifikat"
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
          </Card>
          {filtered.length > 0 && (
            <DataTablePagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              totalItems={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          )}
        </TabsContent>

        {canViewLogs && (
          <TabsContent value="logs" className="space-y-4">
            <Card className="p-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input
                  placeholder="Filter nomor sertifikat…"
                  value={logQ}
                  onChange={(e) => setLogQ(e.target.value)}
                />
                <Input type="date" value={logFrom} onChange={(e) => setLogFrom(e.target.value)} />
                <Input type="date" value={logTo} onChange={(e) => setLogTo(e.target.value)} />
                <Button onClick={fetchLogs} disabled={logsLoading}>
                  {logsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Terapkan Filter
                </Button>
              </div>
            </Card>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu Scan</TableHead>
                    <TableHead>No. Sertifikat</TableHead>
                    <TableHead>Hasil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline text-muted-foreground" /></TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">Belum ada aktivitas scan.</TableCell></TableRow>
                  ) : (
                    pageLogs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(l.scanned_at), "dd MMM yyyy HH:mm:ss", { locale: idLocale })}</TableCell>
                        <TableCell className="font-mono text-xs">{l.certificate_number}</TableCell>
                        <TableCell>
                          {l.result === "valid" && <Badge className="bg-emerald-600 hover:bg-emerald-600">Valid</Badge>}
                          {l.result === "revoked" && <Badge variant="destructive">Revoked</Badge>}
                          {l.result === "expired" && <Badge variant="destructive">Expired</Badge>}
                          {l.result === "not_found" && <Badge variant="secondary">Not Found</Badge>}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
            {logs.length > 0 && (
              <DataTablePagination
                currentPage={logsPage}
                totalPages={totalLogPages}
                pageSize={PAGE_SIZE}
                totalItems={logs.length}
                onPageChange={setLogsPage}
                onPageSizeChange={() => {}}
              />
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!revokeTarget} onOpenChange={(o) => { if (!o) { setRevokeTarget(null); setRevokeReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Sertifikat</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div>
              No. Sertifikat: <span className="font-mono font-semibold">{revokeTarget?.certificate_number}</span>
            </div>
            <div className="text-muted-foreground text-xs">
              Setelah di-revoke, halaman verifikasi & QR akan menampilkan status <b>Revoked</b> beserta alasan berikut.
            </div>
            <Textarea
              placeholder="Alasan revoke (min 10 karakter)…"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoking}>Batal</Button>
            <Button variant="destructive" onClick={submitRevoke} disabled={revoking}>
              {revoking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Ban className="w-4 h-4 mr-2" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}