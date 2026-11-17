import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudDownload, Database, Loader2, RefreshCw, Save, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FILE_BUCKETS = ['signatures', 'avatars', 'chat-attachments', 'product-photos'] as const;

type ExternalConfig = {
  audit_logs_days: number | null;
  sync_logs_days: number;
  include_buckets: string[];
  include_documents: boolean;
};

type ManifestTable = {
  name: string;
  row_count: number;
  part_count: number;
  source_count_after?: number;
  count_delta?: number;
};

type BackupRun = {
  started_at: string;
  completed_at?: string;
  status: 'success' | 'failed' | 'partial';
  folder?: string;
  total_rows?: number;
  total_bytes?: number;
  failed_tables?: string[];
  error?: string;
  manifest?: { tables?: ManifestTable[] };
};

type ExternalStatus = {
  last_success_at?: string | null;
  history?: BackupRun[];
};

const DEFAULT_CONFIG: ExternalConfig = {
  audit_logs_days: null,
  sync_logs_days: 30,
  include_buckets: [...FILE_BUCKETS],
  include_documents: false,
};

function formatBytes(value = 0) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function safeConfig(value: unknown): ExternalConfig {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const buckets = Array.isArray(raw.include_buckets)
    ? raw.include_buckets.filter((item): item is string => FILE_BUCKETS.includes(item as typeof FILE_BUCKETS[number]))
    : DEFAULT_CONFIG.include_buckets;
  return {
    audit_logs_days: typeof raw.audit_logs_days === 'number' ? Math.max(1, Math.floor(raw.audit_logs_days)) : null,
    sync_logs_days: typeof raw.sync_logs_days === 'number' ? Math.min(365, Math.max(1, Math.floor(raw.sync_logs_days))) : 30,
    include_buckets: buckets,
    include_documents: raw.include_documents === true,
  };
}

async function functionError(error: unknown): Promise<string> {
  const err = error as { context?: { text?: () => Promise<string> }; message?: string };
  try {
    const text = await err.context?.text?.();
    if (text) {
      const parsed = JSON.parse(text);
      return parsed.error || parsed.message || text;
    }
  } catch { /* use the generic message */ }
  return err.message || 'Backup eksternal gagal';
}

export default function ExternalBackupCard() {
  const [config, setConfig] = useState<ExternalConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<ExternalStatus>({});
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('external-backup', { body: { action: 'status' } });
      if (error) throw new Error(await functionError(error));
      setConfigured(data?.configured === true);
      setConfig(safeConfig(data?.config));
      setStatus((data?.status || {}) as ExternalStatus);
      if (!quiet) toast.success(data?.configured ? 'Status backup eksternal diperbarui' : 'Kunci tujuan backup belum dikonfigurasi');
    } catch (error) {
      toast.error(await functionError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(true); }, [loadStatus]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('settings').upsert({
        key: 'external_backup_config',
        value: config as never,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) throw error;
      toast.success('Pengaturan backup eksternal disimpan');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const runBackup = async () => {
    setRunning(true);
    toast.info('Backup eksternal sedang berjalan. Jangan tutup halaman ini.');
    try {
      const { data, error } = await supabase.functions.invoke('external-backup', { body: { action: 'backup' } });
      if (error) throw new Error(await functionError(error));
      if (!data?.success) throw new Error(data?.error || 'Backup eksternal tidak berhasil');
      toast.success(`Backup selesai: ${Number(data.total_rows || 0).toLocaleString('id-ID')} baris, ${formatBytes(data.total_bytes)}`);
      await loadStatus(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backup eksternal gagal', { duration: 12000 });
      await loadStatus(true);
    } finally {
      setRunning(false);
    }
  };

  const latest = status.history?.[0];
  const tables = latest?.manifest?.tables || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><Database className="h-5 w-5 text-primary" /></div>
            <div>
              <CardTitle className="text-lg">Backup Eksternal (HRGA Kemika)</CardTitle>
              <CardDescription>Salinan harian privat ke penyimpanan HRGA Kemika, setiap 02.30 WIB</CardDescription>
            </div>
          </div>
          <Badge variant={configured ? 'default' : 'secondary'}>{configured ? 'Terkonfigurasi' : 'Belum dikonfigurasi'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <>
            {!configured && (
              <div className="flex gap-2 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p>Kunci akses tujuan belum tersedia. Admin IT perlu mengisi kunci rahasia backup eksternal sebelum backup dapat dijalankan.</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Hasil terakhir</p>
                <p className="mt-1 font-semibold">{latest?.status === 'success' ? 'Sukses' : latest?.status === 'partial' ? 'Sebagian' : latest?.status === 'failed' ? 'Gagal' : 'Belum pernah'}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Backup sukses terakhir</p>
                <p className="mt-1 text-sm font-semibold">{status.last_success_at ? `${format(new Date(status.last_success_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })} WIB` : 'Belum ada'}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Data run terakhir</p>
                <p className="mt-1 font-semibold">{Number(latest?.total_rows || 0).toLocaleString('id-ID')} baris · {formatBytes(latest?.total_bytes)}</p>
              </div>
            </div>

            {latest?.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{latest.error}</p>}
            {running && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Membaca seluruh tabel, mengunggah per bagian, lalu memverifikasi hasil…</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={runBackup} disabled={!configured || running || saving}>
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />}
                {running ? 'Backup Berjalan…' : 'Backup Sekarang'}
              </Button>
              <Button variant="outline" onClick={() => void loadStatus()} disabled={loading || running}>
                <RefreshCw className="mr-2 h-4 w-4" />Cek Status
              </Button>
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground" /><h3 className="font-medium">Cakupan backup</h3></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="external-audit-days">Riwayat audit (hari)</Label>
                  <Input id="external-audit-days" type="number" min={1} value={config.audit_logs_days ?? ''} placeholder="Kosong = seluruh riwayat" onChange={(event) => setConfig((old) => ({ ...old, audit_logs_days: event.target.value ? Math.max(1, Number(event.target.value)) : null }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="external-sync-days">Log teknis Sales Pulse (hari)</Label>
                  <Input id="external-sync-days" type="number" min={1} max={365} value={config.sync_logs_days} onChange={(event) => setConfig((old) => ({ ...old, sync_logs_days: Math.min(365, Math.max(1, Number(event.target.value) || 30)) }))} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {FILE_BUCKETS.map((bucket) => (
                  <label key={bucket} className="flex items-center gap-3 text-sm">
                    <Checkbox checked={config.include_buckets.includes(bucket)} onCheckedChange={(checked) => setConfig((old) => ({ ...old, include_buckets: checked === true ? [...old.include_buckets, bucket] : old.include_buckets.filter((item) => item !== bucket) }))} />
                    <span className="font-mono text-xs">{bucket}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/10 p-3">
                <Checkbox className="mt-0.5" checked={config.include_documents} onCheckedChange={(checked) => setConfig((old) => ({ ...old, include_documents: checked === true }))} />
                <span className="text-sm"><span className="block font-medium">Sertakan bucket documents</span><span className="text-muted-foreground">Berukuran sekitar 3,7 GB dan dapat memenuhi kuota penyimpanan proyek tujuan. Bucket backups tidak pernah disalin.</span></span>
              </label>
              <Button variant="outline" size="sm" onClick={saveConfig} disabled={saving || running}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Simpan Pengaturan
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">10 run terakhir</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Waktu</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Baris</th><th className="px-3 py-2">Ukuran</th></tr></thead>
                  <tbody>
                    {status.history?.length ? status.history.slice(0, 10).map((run, index) => (
                      <tr key={`${run.started_at}-${index}`} className="border-t">
                        <td className="whitespace-nowrap px-3 py-2">{format(new Date(run.started_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })}</td>
                        <td className="px-3 py-2"><Badge variant={run.status === 'success' ? 'default' : 'destructive'}>{run.status}</Badge></td>
                        <td className="px-3 py-2">{Number(run.total_rows || 0).toLocaleString('id-ID')}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatBytes(run.total_bytes)}</td>
                      </tr>
                    )) : <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Belum ada riwayat backup eksternal.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {tables.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Baris per tabel pada run sukses terakhir</h3>
                <div className="max-h-80 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-left"><tr><th className="px-3 py-2">Tabel</th><th className="px-3 py-2 text-right">Baris</th><th className="px-3 py-2 text-right">Bagian</th><th className="px-3 py-2 text-right">Selisih saat verifikasi</th></tr></thead>
                    <tbody>{tables.map((table) => <tr key={table.name} className="border-t"><td className="px-3 py-2 font-mono text-xs">{table.name}</td><td className="px-3 py-2 text-right">{table.row_count.toLocaleString('id-ID')}</td><td className="px-3 py-2 text-right">{table.part_count}</td><td className="px-3 py-2 text-right">{table.count_delta || 0}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}
            <p className="flex gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0" />Akun autentikasi internal (auth.users) tidak termasuk dalam JSON. Profil dan peran pengguna tetap dicadangkan. Hanya 14 run lengkap terakhir yang disimpan.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
