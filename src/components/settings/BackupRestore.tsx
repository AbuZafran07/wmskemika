import React, { useState, useEffect, useRef } from 'react';
import { 
  CloudDownload, Download, Upload, Loader2, CheckCircle2, 
  AlertTriangle, RefreshCw, Trash2, FileJson, Clock, Shield, Cloud, PlugZap,
  History as HistoryIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import JSZip from 'jszip';
import { Progress } from '@/components/ui/progress';

const STORAGE_BUCKETS = ['avatars', 'chat-attachments', 'documents', 'product-photos', 'signatures'] as const;

const BACKUP_TABLES = [
  // Master Data
  { key: 'products', label: 'Produk', icon: '📦' },
  { key: 'categories', label: 'Kategori', icon: '📂' },
  { key: 'units', label: 'Satuan', icon: '📏' },
  { key: 'suppliers', label: 'Supplier', icon: '🏭' },
  { key: 'customers', label: 'Customer', icon: '👥' },
  // Transaksi - Plan / Sales Order
  { key: 'plan_order_headers', label: 'Plan Order (Header)', icon: '📋' },
  { key: 'plan_order_items', label: 'Plan Order (Items)', icon: '📝' },
  { key: 'sales_order_headers', label: 'Sales Order (Header)', icon: '🧾' },
  { key: 'sales_order_items', label: 'Sales Order (Items)', icon: '📝' },
  // Proforma Invoice
  { key: 'proforma_invoices', label: 'Proforma Invoice (Header)', icon: '💰' },
  { key: 'proforma_invoice_items', label: 'Proforma Invoice (Items)', icon: '📝' },
  // Stock In / Out / Adjustment
  { key: 'stock_in_headers', label: 'Stock In (Header)', icon: '📥' },
  { key: 'stock_in_items', label: 'Stock In (Items)', icon: '📝' },
  { key: 'stock_out_headers', label: 'Stock Out (Header)', icon: '📤' },
  { key: 'stock_out_items', label: 'Stock Out (Items)', icon: '📝' },
  { key: 'stock_adjustments', label: 'Stock Adjustment (Header)', icon: '⚖️' },
  { key: 'stock_adjustment_items', label: 'Stock Adjustment (Items)', icon: '📝' },
  { key: 'inventory_batches', label: 'Inventory Batches', icon: '🗃️' },
  { key: 'stock_transactions', label: 'Stock Transactions', icon: '🔄' },
  // Delivery / Kanban
  { key: 'delivery_requests', label: 'Delivery Requests', icon: '🚚' },
  { key: 'delivery_orders', label: 'Delivery Orders', icon: '📦' },
  { key: 'delivery_comments', label: 'Delivery Comments', icon: '💬' },
  { key: 'delivery_checklists', label: 'Delivery Checklists', icon: '✅' },
  { key: 'delivery_labels', label: 'Delivery Labels', icon: '🏷️' },
  { key: 'delivery_card_labels', label: 'Delivery Card Labels', icon: '🏷️' },
  // Tracker PO
  { key: 'po_tracker_checklists', label: 'Tracker PO - Checklists', icon: '📋' },
  { key: 'po_tracker_comments', label: 'Tracker PO - Komentar', icon: '💬' },
  { key: 'po_tracker_labels', label: 'Tracker PO - Labels', icon: '🏷️' },
  { key: 'po_tracker_card_labels', label: 'Tracker PO - Card Labels', icon: '🏷️' },
  { key: 'po_tracker_archived', label: 'Tracker PO - Archived', icon: '🗄️' },
  // Kalibrasi
  { key: 'calibration_items', label: 'Kalibrasi - Data Alat', icon: '⚙️' },
  { key: 'calibration_spare_parts', label: 'Kalibrasi - Spare Parts', icon: '🔧' },
  { key: 'calibration_tracker_checklists', label: 'Kalibrasi - Checklists', icon: '✅' },
  { key: 'calibration_tracker_comments', label: 'Kalibrasi - Komentar', icon: '💬' },
  { key: 'calibration_labels', label: 'Kalibrasi - Labels', icon: '🏷️' },
  { key: 'calibration_card_labels', label: 'Kalibrasi - Card Labels', icon: '🏷️' },
  { key: 'calibration_document_logs', label: 'Kalibrasi - Log Dokumen', icon: '📄' },
  // Chat K'talk
  { key: 'chat_messages', label: "K'talk Messages", icon: '💬' },
  { key: 'chat_reactions', label: "K'talk Reactions", icon: '😀' },
  // Lainnya
  { key: 'attachments', label: 'Attachments (Metadata)', icon: '📎' },
  { key: 'national_holidays', label: 'Hari Libur Nasional', icon: '📅' },
  { key: 'profiles', label: 'Profiles (User)', icon: '👤' },
  { key: 'user_roles', label: 'User Roles', icon: '🔐' },
  { key: 'user_signatures', label: 'User Signatures', icon: '✍️' },
  { key: 'audit_logs', label: 'Audit Logs (30 hari terakhir)', icon: '📜' },
  { key: 'settings', label: 'Pengaturan Sistem', icon: '⚙️' },
] as const;

type BackupTableKey = typeof BACKUP_TABLES[number]['key'];

interface BackupHistoryEntry {
  file: string;
  created_at: string;
  size: number;
  table_count: number;
  total_records: number;
  status?: string;
}

interface AutoBackupInfo {
  enabled: boolean;
  last_backup_at: string | null;
  backups: Array<{ name: string; created_at: string; size: number }>;
  history: BackupHistoryEntry[];
}

export default function BackupRestore() {
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Manual backup state
  const [selectedTables, setSelectedTables] = useState<Set<BackupTableKey>>(
    new Set(BACKUP_TABLES.map(t => t.key))
  );
  const [backingUp, setBackingUp] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(false);
  const [backupProgress, setBackupProgress] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressEta, setProgressEta] = useState<string>('');
  const [progressBytes, setProgressBytes] = useState(0);
  
  // Restore state
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<{ tables: string[]; recordCount: number; date: string } | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  
  // Auto backup state
  const [autoBackup, setAutoBackup] = useState<AutoBackupInfo>({
    enabled: false,
    last_backup_at: null,
    backups: [],
    history: [],
  });
  const [loadingAuto, setLoadingAuto] = useState(true);

  // Baca pesan error asli dari edge function (bukan "non-2xx status code")
  const readFunctionError = async (error: any): Promise<string> => {
    try {
      const ctx = error?.context;
      if (ctx && typeof ctx.text === 'function') {
        const text = await ctx.text();
        try {
          const parsed = JSON.parse(text);
          return parsed.error || parsed.message || text;
        } catch {
          return text || error?.message;
        }
      }
    } catch { /* ignore */ }
    return error?.message || 'Terjadi kesalahan';
  };

  // Google Drive backup state
  const [gdriveConfig, setGdriveConfig] = useState<{
    enabled: boolean;
    last_backup_at: string | null;
    last_backup_file: string | null;
    last_backup_records: number;
  }>({
    enabled: false,
    last_backup_at: null,
    last_backup_file: null,
    last_backup_records: 0,
  });
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveTesting, setGdriveTesting] = useState(false);

  useEffect(() => {
    fetchAutoBackupInfo();
    fetchGdriveConfig();
  }, []);

  const fetchGdriveConfig = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'gdrive_backup_config')
        .maybeSingle();
      const cfg = (data?.value ?? {}) as Record<string, unknown>;
      setGdriveConfig({
        enabled: cfg.enabled === true,
        last_backup_at: (cfg.last_backup_at as string) || null,
        last_backup_file: (cfg.last_backup_file as string) || null,
        last_backup_records: Number(cfg.last_backup_records ?? 0),
      });
    } catch (err) {
      console.error('Error fetching gdrive config:', err);
    }
  };

  const toggleGdriveBackup = async () => {
    try {
      const newEnabled = !gdriveConfig.enabled;
      const { error } = await supabase.from('settings').upsert({
        key: 'gdrive_backup_config',
        value: { ...gdriveConfig, enabled: newEnabled } as any,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) throw error;
      setGdriveConfig(prev => ({ ...prev, enabled: newEnabled }));
      toast.success(newEnabled
        ? 'Google Drive backup diaktifkan — jalan otomatis tiap 01.00 WIB'
        : 'Google Drive backup dinonaktifkan');
    } catch (err) {
      console.error('Toggle gdrive backup error:', err);
      toast.error('Gagal mengubah pengaturan Google Drive backup');
    }
  };

  const testGdriveConnection = async () => {
    setGdriveTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('gdrive-backup', {
        body: { test: true },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.success) toast.success(data.message || 'Koneksi Google Drive OK');
      else toast.error(data?.message || data?.error || 'Koneksi Google Drive gagal');
    } catch (err: any) {
      console.error('Test gdrive error:', err);
      toast.error(err.message || 'Gagal menguji koneksi Google Drive', { duration: 12000 });
    }
    setGdriveTesting(false);
  };

  const runGdriveBackupNow = async () => {
    setGdriveLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gdrive-backup', { body: {} });
      if (error) throw new Error(await readFunctionError(error));
      if (data?.error) throw new Error(data.error);
      toast.success(`Backup terkirim ke Google Drive — ${Number(data?.total_records || 0).toLocaleString('id-ID')} record`);
      await fetchGdriveConfig();
    } catch (err: any) {
      console.error('Run gdrive backup error:', err);
      toast.error(err.message || 'Gagal menjalankan backup Google Drive', { duration: 12000 });
    }
    setGdriveLoading(false);
  };

  const fetchAutoBackupInfo = async () => {
    setLoadingAuto(true);
    try {
      // Check settings for auto backup config
      const { data: settingData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'auto_backup_config')
        .maybeSingle();

      const config = settingData?.value as Record<string, unknown> | null;
      
      // List backup files from storage
      const { data: files } = await supabase.storage
        .from('backups')
        .list('auto', { limit: 12, sortBy: { column: 'created_at', order: 'desc' } });

      const rawHistory = Array.isArray((config as any)?.history) ? (config as any).history : [];
      const history: BackupHistoryEntry[] = rawHistory.map((h: any) => ({
        file: String(h?.file ?? ''),
        created_at: String(h?.created_at ?? ''),
        size: Number(h?.size ?? 0),
        table_count: Number(h?.table_count ?? 0),
        total_records: Number(h?.total_records ?? 0),
        status: h?.status ? String(h.status) : 'success',
      }));

      setAutoBackup({
        enabled: config?.enabled === true,
        last_backup_at: (config?.last_backup_at as string) || null,
        backups: (files || []).map(f => ({
          name: f.name,
          created_at: f.created_at || '',
          size: f.metadata?.size || 0,
        })),
        history,
      });
    } catch (err) {
      console.error('Error fetching auto backup info:', err);
    }
    setLoadingAuto(false);
  };

  const toggleTable = (key: BackupTableKey) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedTables(new Set(BACKUP_TABLES.map(t => t.key)));
  };

  const deselectAll = () => {
    setSelectedTables(new Set());
  };

  // ============ MANUAL BACKUP ============
  const handleManualBackup = async () => {
    if (selectedTables.size === 0) {
      toast.error('Pilih minimal satu tabel untuk di-backup');
      return;
    }

    setBackingUp(true);
    setProgressPercent(0);
    setProgressEta('');
    setProgressBytes(0);
    try {
      setBackupProgress('Mengambil data dari tabel...');
      const backupData: Record<string, unknown[]> = {};
      const tableKeys = Array.from(selectedTables);

      // Fetch all selected tables in parallel
      const results = await Promise.all(
        tableKeys.map(async (table) => {
          let query = supabase.from(table).select('*');
          if (table === 'audit_logs') {
            query = query
              .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
              .order('created_at', { ascending: false });
          }
          const { data, error } = await query;
          if (error) throw new Error(`Gagal fetch ${table}: ${error.message}`);
          return { table, data: data || [] };
        })
      );

      results.forEach(({ table, data }) => {
        backupData[table] = data;
      });
      setProgressPercent(30);

      const exportPayload = {
        _meta: {
          app: 'WMS Kemika',
          version: '1.0.0',
          exported_at: new Date().toISOString(),
          tables: tableKeys,
          total_records: Object.values(backupData).reduce((sum, arr) => sum + arr.length, 0),
          includes_files: includeFiles,
        },
        data: backupData,
      };

      const stamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
      let blob: Blob;
      let fileName: string;
      let totalFiles = 0;
      let totalFileBytes = 0;

      if (includeFiles) {
        const zip = new JSZip();
        zip.file('data.json', JSON.stringify(exportPayload, null, 2));

        const BATCH_SIZE = 10;
        // Kumpulkan daftar file semua bucket dulu agar persentase akurat
        setBackupProgress('Menyusun daftar file storage...');
        const bucketPaths: Array<{ bucket: string; paths: string[] }> = [];
        for (const bucket of STORAGE_BUCKETS) {
          bucketPaths.push({ bucket, paths: await listBucketRecursive(bucket) });
        }
        const totalToDownload = bucketPaths.reduce((s, b) => s + b.paths.length, 0) || 1;
        let processed = 0;
        const startedAt = Date.now();

        for (const { bucket, paths } of bucketPaths) {
          for (let i = 0; i < paths.length; i += BATCH_SIZE) {
            const batch = paths.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(async (path) => {
                try {
                  const { data: fileBlob, error } = await supabase.storage.from(bucket).download(path);
                  if (error || !fileBlob) return;
                  zip.file(`files/${bucket}/${path}`, fileBlob);
                  totalFiles++;
                  totalFileBytes += fileBlob.size;
                } catch (e) {
                  console.warn(`Skip file ${bucket}/${path}:`, e);
                }
              })
            );
            processed += batch.length;
            const elapsed = (Date.now() - startedAt) / 1000;
            const rate = processed / Math.max(elapsed, 0.001);
            const remaining = Math.max(totalToDownload - processed, 0);
            const etaSec = rate > 0 ? Math.round(remaining / rate) : 0;
            setProgressEta(
              remaining > 0
                ? etaSec >= 60
                  ? `± ${Math.ceil(etaSec / 60)} menit tersisa`
                  : `± ${etaSec} detik tersisa`
                : ''
            );
            setProgressBytes(totalFileBytes);
            setProgressPercent(30 + Math.round((processed / totalToDownload) * 60));
            setBackupProgress(
              `Bucket "${bucket}": ${Math.min(i + BATCH_SIZE, paths.length)}/${paths.length} file...`
            );
          }
        }

        setProgressEta('');
        setBackupProgress(`Mengompres ZIP (${totalFiles} file)...`);
        setProgressPercent(95);
        blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        fileName = `backup-kemika-full-${stamp}.zip`;
      } else {
        blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
        fileName = `backup-kemika-${stamp}.json`;
        setProgressPercent(95);
      }
      setProgressBytes(blob.size);
      setProgressPercent(100);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Audit log
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: userData.user?.id,
        user_email: userData.user?.email,
        action: 'MANUAL_BACKUP',
        module: 'backup',
        ref_table: 'settings',
        new_data: {
          tables: tableKeys,
          total_records: exportPayload._meta.total_records,
          includes_files: includeFiles,
          total_files: totalFiles,
          total_file_bytes: totalFileBytes,
        },
      });

      toast.success(
        `Backup berhasil! ${exportPayload._meta.total_records} record${includeFiles ? ` + ${totalFiles} file` : ''} dari ${tableKeys.length} tabel.`
      );
    } catch (err: any) {
      console.error('Backup error:', err);
      toast.error(err.message || 'Gagal membuat backup');
    }
    setBackupProgress('');
    setProgressPercent(0);
    setProgressEta('');
    setProgressBytes(0);
    setBackingUp(false);
  };

  // Recursively list all file paths inside a bucket
  const listBucketRecursive = async (bucket: string, prefix = ''): Promise<string[]> => {
    const out: string[] = [];
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data) return out;
    for (const item of data) {
      // Folder entries have id = null in Supabase storage list
      if ((item as any).id === null) {
        const sub = await listBucketRecursive(bucket, prefix ? `${prefix}/${item.name}` : item.name);
        out.push(...sub);
      } else {
        out.push(prefix ? `${prefix}/${item.name}` : item.name);
      }
    }
    return out;
  };

  // ============ RESTORE ============
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Hanya file JSON yang didukung');
      return;
    }

    setRestoreFile(file);
    
    // Preview file contents
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed._meta || !parsed.data) {
          toast.error('Format file backup tidak valid');
          setRestoreFile(null);
          return;
        }
        setRestorePreview({
          tables: parsed._meta.tables || Object.keys(parsed.data),
          recordCount: parsed._meta.total_records || 0,
          date: parsed._meta.exported_at || 'Unknown',
        });
      } catch {
        toast.error('File JSON tidak valid');
        setRestoreFile(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    setShowRestoreConfirm(false);
    setRestoring(true);

    try {
      const text = await restoreFile.text();
      const parsed = JSON.parse(text);
      const data = parsed.data as Record<string, unknown[]>;
      
      let restoredCount = 0;
      const errors: string[] = [];

      for (const [table, rows] of Object.entries(data)) {
        if (!rows || rows.length === 0) continue;
        
        // Upsert data (insert with conflict handling)
        const { error } = await supabase.from(table as any).upsert(rows as any[], { 
          onConflict: 'id',
          ignoreDuplicates: false 
        });
        
        if (error) {
          errors.push(`${table}: ${error.message}`);
        } else {
          restoredCount += rows.length;
        }
      }

      // Audit log
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: userData.user?.id,
        user_email: userData.user?.email,
        action: 'RESTORE_DATA',
        module: 'backup',
        ref_table: 'settings',
        new_data: { 
          tables: Object.keys(data), 
          total_restored: restoredCount,
          errors: errors.length > 0 ? errors : undefined,
          source_file: restoreFile.name,
          source_date: parsed._meta?.exported_at,
        },
      });

      if (errors.length > 0) {
        toast.warning(`Restore selesai dengan ${errors.length} error. ${restoredCount} record berhasil.`);
        console.error('Restore errors:', errors);
      } else {
        toast.success(`Restore berhasil! ${restoredCount} record dari ${Object.keys(data).length} tabel.`);
      }

      // Reset
      setRestoreFile(null);
      setRestorePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error('Restore error:', err);
      toast.error(err.message || 'Gagal melakukan restore');
    }
    setRestoring(false);
  };

  // ============ AUTO BACKUP TOGGLE ============
  const toggleAutoBackup = async () => {
    try {
      const newEnabled = !autoBackup.enabled;
      
      await supabase.from('settings').upsert({
        key: 'auto_backup_config',
        value: {
          enabled: newEnabled,
          last_backup_at: autoBackup.last_backup_at,
          history: autoBackup.history,
        } as any,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      setAutoBackup(prev => ({ ...prev, enabled: newEnabled }));
      
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        user_id: userData.user?.id,
        user_email: userData.user?.email,
        action: newEnabled ? 'ENABLE_AUTO_BACKUP' : 'DISABLE_AUTO_BACKUP',
        module: 'backup',
        ref_table: 'settings',
        new_data: { enabled: newEnabled },
      });

      toast.success(newEnabled ? 'Auto backup diaktifkan' : 'Auto backup dinonaktifkan');
    } catch (err) {
      console.error('Toggle auto backup error:', err);
      toast.error('Gagal mengubah pengaturan auto backup');
    }
  };

  const downloadBackupPath = async (path: string, downloadName?: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('backups')
        .download(path);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName || path.split('/').pop() || 'backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download backup error:', err);
      toast.error('Gagal mengunduh backup');
    }
  };

  const downloadAutoBackup = (fileName: string) => downloadBackupPath(`auto/${fileName}`, fileName);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="grid gap-6">
      {/* Auto Backup Cloud */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CloudDownload className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Auto Backup Cloud</CardTitle>
                <CardDescription>
                  Backup otomatis berjalan setiap minggu dan menyimpan 4 backup terakhir
                </CardDescription>
              </div>
            </div>
            <Badge variant={autoBackup.enabled ? 'default' : 'secondary'}>
              {autoBackup.enabled ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Aktifkan Auto Backup Mingguan</span>
            </div>
            <Button 
              variant={autoBackup.enabled ? 'destructive' : 'default'} 
              size="sm"
              onClick={toggleAutoBackup}
            >
              {autoBackup.enabled ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </div>

          {loadingAuto ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : autoBackup.backups.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Backup Tersedia:</p>
              {autoBackup.backups.map((backup) => (
                <div key={backup.name} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <FileJson className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{backup.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {backup.created_at ? format(new Date(backup.created_at), 'dd MMM yyyy, HH:mm', { locale: idLocale }) : '-'}
                        {backup.size > 0 && ` • ${formatFileSize(backup.size)}`}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => downloadAutoBackup(backup.name)}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Belum ada backup otomatis. Backup pertama akan dibuat pada jadwal berikutnya.
            </div>
          )}

          {autoBackup.last_backup_at && (
            <p className="text-xs text-muted-foreground">
              Backup terakhir: {format(new Date(autoBackup.last_backup_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dashboard Riwayat Backup Mingguan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <HistoryIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Riwayat Backup Mingguan</CardTitle>
                <CardDescription>
                  Ringkasan jumlah tabel, jumlah record, ukuran arsip, dan unduhan tiap backup otomatis
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAutoBackupInfo} disabled={loadingAuto}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingAuto ? 'animate-spin' : ''}`} />
              Muat Ulang
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingAuto ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : autoBackup.history.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Belum ada riwayat backup mingguan. Riwayat akan terisi setelah backup otomatis berjalan.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Total Backup Tercatat</p>
                  <p className="text-lg font-semibold">{autoBackup.history.length}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Record Backup Terakhir</p>
                  <p className="text-lg font-semibold">
                    {autoBackup.history[0].total_records.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Ukuran Arsip Terakhir</p>
                  <p className="text-lg font-semibold">{formatFileSize(autoBackup.history[0].size)}</p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Tanggal</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Tabel</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Records</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Ukuran</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Unduh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoBackup.history.map((h, idx) => (
                      <tr key={`${h.file}-${idx}`} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {h.created_at
                            ? format(new Date(h.created_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })
                            : '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{h.table_count}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{h.total_records.toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatFileSize(h.size)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge variant={h.status === 'success' ? 'default' : 'destructive'}>
                            {h.status === 'success' ? 'Sukses' : h.status || 'Gagal'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadBackupPath(h.file)}
                            disabled={!h.file}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Catatan: file arsip lama otomatis dibersihkan (4 backup terakhir disimpan), sehingga baris riwayat lama mungkin tidak bisa diunduh lagi.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Google Drive Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-info/10">
                <Cloud className="w-5 h-5 text-info" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Drive Backup</CardTitle>
                <CardDescription>
                  Backup otomatis ke Google Drive setiap malam (01.00 WIB) tanpa perlu PC menyala
                </CardDescription>
              </div>
            </div>
            <Badge variant={gdriveConfig.enabled ? 'default' : 'secondary'}>
              {gdriveConfig.enabled ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Aktifkan Backup Harian ke Google Drive</span>
            </div>
            <Button
              variant={gdriveConfig.enabled ? 'destructive' : 'default'}
              size="sm"
              onClick={toggleGdriveBackup}
            >
              {gdriveConfig.enabled ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Backup terakhir: </span>
              <span className="font-medium">
                {gdriveConfig.last_backup_at
                  ? `${format(new Date(gdriveConfig.last_backup_at), 'dd MMM yyyy, HH:mm', { locale: idLocale })} WIB`
                  : 'Belum pernah'}
              </span>
            </p>
            {gdriveConfig.last_backup_file && (
              <p className="text-xs text-muted-foreground font-mono break-all">
                {gdriveConfig.last_backup_file}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Records: {gdriveConfig.last_backup_records.toLocaleString('id-ID')} data • Retensi 30 file terakhir
            </p>
          </div>

          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Perlu setup sekali</p>
                <p className="text-muted-foreground">
                  Service Account Google Drive & ID folder harus dikonfigurasi terlebih dahulu. Klik "Test Koneksi Drive" untuk memastikan setup sudah benar, atau hubungi admin IT.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={testGdriveConnection} disabled={gdriveTesting}>
              {gdriveTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlugZap className="w-4 h-4 mr-2" />}
              Test Koneksi Drive
            </Button>
            <Button size="sm" onClick={runGdriveBackupNow} disabled={gdriveLoading}>
              {gdriveLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CloudDownload className="w-4 h-4 mr-2" />}
              Jalankan Backup Sekarang
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <Download className="w-5 h-5 text-info" />
            </div>
            <div>
              <CardTitle className="text-lg">Backup Manual</CardTitle>
              <CardDescription>
                Ekspor data ke file JSON untuk backup lokal
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Pilih data yang akan di-backup:</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>Pilih Semua</Button>
              <Button variant="ghost" size="sm" onClick={deselectAll}>Hapus Semua</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BACKUP_TABLES.map((table) => (
              <label
                key={table.key}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  checked={selectedTables.has(table.key)}
                  onCheckedChange={() => toggleTable(table.key)}
                />
                <span className="text-base">{table.icon}</span>
                <span className="text-sm font-medium">{table.label}</span>
              </label>
            ))}
          </div>

          <Separator />

          <label className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-accent/40 transition-colors">
            <Checkbox
              checked={includeFiles}
              onCheckedChange={(v) => setIncludeFiles(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Sertakan file fisik dari Storage (ZIP)</p>
              <p className="text-xs text-muted-foreground">
                Mengikutkan foto produk, signature, lampiran dokumen PO/DO, dan file K'talk. Hasil akan diunduh sebagai <span className="font-mono">.zip</span>. Ukuran bisa besar & proses lebih lama.
              </p>
            </div>
          </label>

          <Button onClick={handleManualBackup} disabled={backingUp || selectedTables.size === 0}>
            {backingUp ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {includeFiles ? 'Download Backup (ZIP + Files)' : 'Download Backup (JSON)'}
            {selectedTables.size > 0 && (
              <Badge variant="secondary" className="ml-2">{selectedTables.size} tabel</Badge>
            )}
          </Button>
          {backingUp && backupProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm gap-2">
                <span className="flex items-center gap-2 truncate">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span className="truncate">{backupProgress}</span>
                </span>
                <span className="text-muted-foreground shrink-0">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progressBytes > 0 ? formatFileSize(progressBytes) : ''}</span>
                <span>{progressEta}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Data */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Upload className="w-5 h-5 text-warning" />
            </div>
            <div>
              <CardTitle className="text-lg">Restore Data</CardTitle>
              <CardDescription>
                Impor data dari file backup JSON
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pilih file backup</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
          </div>

          {restorePreview && (
            <>
              <Separator />
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm font-medium">File valid</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Tanggal Backup</p>
                    <p className="font-medium">
                      {restorePreview.date !== 'Unknown' 
                        ? format(new Date(restorePreview.date), 'dd MMM yyyy, HH:mm', { locale: idLocale })
                        : 'Tidak diketahui'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Record</p>
                    <p className="font-medium">{restorePreview.recordCount.toLocaleString()}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Tabel yang akan di-restore:</p>
                  <div className="flex flex-wrap gap-1">
                    {restorePreview.tables.map(t => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm text-destructive">
                <p className="font-medium">Peringatan!</p>
                <p>Restore akan menimpa data yang sudah ada jika ID-nya sama. Pastikan Anda sudah membuat backup terlebih dahulu sebelum melakukan restore.</p>
              </div>
            </div>
          </div>

          <Button 
            variant="warning"
            onClick={() => setShowRestoreConfirm(true)} 
            disabled={restoring || !restoreFile || !restorePreview}
          >
            {restoring ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Restore Data
          </Button>
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Konfirmasi Restore Data
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Anda akan melakukan restore data dari file:</p>
              <p className="font-semibold text-foreground">{restoreFile?.name}</p>
              {restorePreview && (
                <p>{restorePreview.tables.length} tabel, {restorePreview.recordCount.toLocaleString()} record akan di-import.</p>
              )}
              <p className="text-destructive font-medium">
                Data dengan ID yang sama akan ditimpa. Tindakan ini tidak dapat dibatalkan!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Ya, Restore Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
