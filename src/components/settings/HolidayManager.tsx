import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Plus, Trash2, Loader2, Upload, Download, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  year: number;
}

interface CsvRow {
  holiday_date: string;
  name: string;
  valid: boolean;
  error?: string;
  isDuplicate?: boolean;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function isValidDate(str: string): boolean {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const d = new Date(str + 'T00:00:00');
  return !isNaN(d.getTime());
}

export default function HolidayManager() {
  const { language } = useLanguage();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  useEffect(() => {
    fetchHolidays();
  }, [selectedYear]);

  const fetchHolidays = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('national_holidays')
      .select('*')
      .eq('year', parseInt(selectedYear))
      .order('holiday_date', { ascending: true });

    if (error) {
      console.error('Error fetching holidays:', error);
      toast.error('Gagal memuat data hari libur');
    } else {
      setHolidays((data as any[]) || []);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newDate || !newName.trim()) {
      toast.error('Tanggal dan nama hari libur wajib diisi');
      return;
    }

    setAdding(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('national_holidays')
      .insert({
        holiday_date: newDate,
        name: newName.trim(),
        created_by: userData.user?.id,
      } as any);

    if (error) {
      if (error.code === '23505') {
        toast.error('Hari libur dengan tanggal dan nama ini sudah ada');
      } else {
        console.error('Error adding holiday:', error);
        toast.error('Gagal menambahkan hari libur');
      }
    } else {
      toast.success('Hari libur berhasil ditambahkan');
      setNewDate('');
      setNewName('');
      fetchHolidays();
    }
    setAdding(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus hari libur "${name}"?`)) return;

    const { error } = await supabase
      .from('national_holidays')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting holiday:', error);
      toast.error('Gagal menghapus hari libur');
    } else {
      toast.success('Hari libur berhasil dihapus');
      fetchHolidays();
    }
  };

  const handleDownloadTemplate = () => {
    const csv = 'holiday_date,name\n2026-01-01,Tahun Baru Masehi\n2026-08-17,Hari Kemerdekaan RI';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_hari_libur.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (holidays.length === 0) {
      toast.error('Tidak ada data untuk diekspor');
      return;
    }
    const lines = ['holiday_date,name'];
    holidays.forEach(h => {
      const name = h.name.includes(',') ? `"${h.name}"` : h.name;
      lines.push(`${h.holiday_date},${name}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hari_libur_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('File harus berformat CSV');
      return;
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());

    if (lines.length < 2) {
      toast.error('File CSV harus memiliki header dan minimal 1 baris data');
      return;
    }

    const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const dateIdx = header.findIndex(h => h === 'holiday_date' || h === 'tanggal' || h === 'date');
    const nameIdx = header.findIndex(h => h === 'name' || h === 'nama' || h === 'nama_hari_libur');

    if (dateIdx === -1 || nameIdx === -1) {
      toast.error('CSV harus memiliki kolom "holiday_date" dan "name"');
      return;
    }

    // Fetch all existing holidays for duplicate check
    const { data: existingData } = await supabase
      .from('national_holidays')
      .select('holiday_date, name');
    const existingSet = new Set(
      (existingData as any[] || []).map(h => `${h.holiday_date}|${h.name}`)
    );

    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const holiday_date = (cols[dateIdx] || '').trim();
      const name = (cols[nameIdx] || '').trim();

      if (!holiday_date && !name) continue;

      let valid = true;
      let error = '';

      if (!holiday_date) {
        valid = false;
        error = 'Tanggal kosong';
      } else if (!isValidDate(holiday_date)) {
        valid = false;
        error = 'Format tanggal tidak valid (gunakan YYYY-MM-DD)';
      }

      if (!name) {
        valid = false;
        error = error ? `${error}; Nama kosong` : 'Nama kosong';
      } else if (name.length > 200) {
        valid = false;
        error = error ? `${error}; Nama terlalu panjang` : 'Nama terlalu panjang (max 200)';
      }

      const isDuplicate = existingSet.has(`${holiday_date}|${name}`);

      rows.push({ holiday_date, name, valid, error, isDuplicate });
    }

    if (rows.length === 0) {
      toast.error('Tidak ada data yang bisa diimpor dari file');
      return;
    }

    setCsvRows(rows);
    setShowImportDialog(true);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validRows = csvRows.filter(r => r.valid && !r.isDuplicate);
  const invalidRows = csvRows.filter(r => !r.valid);
  const duplicateRows = csvRows.filter(r => r.valid && r.isDuplicate);

  const handleImportConfirm = async () => {
    if (validRows.length === 0) {
      toast.error('Tidak ada data valid untuk diimpor');
      return;
    }

    setImporting(true);
    const { data: userData } = await supabase.auth.getUser();

    const insertData = validRows.map(r => ({
      holiday_date: r.holiday_date,
      name: r.name,
      created_by: userData.user?.id,
    }));

    const { error } = await supabase
      .from('national_holidays')
      .insert(insertData as any[]);

    if (error) {
      console.error('Error importing holidays:', error);
      toast.error('Gagal mengimpor data hari libur');
    } else {
      toast.success(`${validRows.length} hari libur berhasil diimpor`);
      setShowImportDialog(false);
      setCsvRows([]);
      fetchHolidays();
    }
    setImporting(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <CalendarDays className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {language === 'en' ? 'National Holidays' : 'Hari Libur Nasional'}
              </CardTitle>
              <CardDescription>
                {language === 'en'
                  ? 'Manage national holidays for delivery calendar'
                  : 'Kelola hari libur nasional untuk kalender pengiriman'
                }
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Year selector + action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Tahun:</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                ({holidays.length} hari libur)
              </span>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-1 text-xs">
                <FileText className="w-3.5 h-3.5" />
                Template
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1 text-xs">
                <Download className="w-3.5 h-3.5" />
                Ekspor
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1 text-xs">
                <Upload className="w-3.5 h-3.5" />
                Impor CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Add new holiday */}
          <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-lg border bg-muted/30">
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="sm:w-44"
              placeholder="Tanggal"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nama hari libur"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={adding} size="sm" className="gap-1">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Tambah
            </Button>
          </div>

          {/* Holiday list */}
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Belum ada data hari libur untuk tahun {selectedYear}
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {holidays.map((h) => {
                const date = new Date(h.holiday_date + 'T00:00:00');
                return (
                  <div key={h.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-24 flex-shrink-0">
                        {format(date, 'dd MMM yyyy', { locale: idLocale })}
                      </span>
                      <span className="text-sm font-medium text-destructive">{h.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDelete(h.id, h.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Preview Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Preview Import Hari Libur
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Summary */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {validRows.length} valid
              </Badge>
              {duplicateRows.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  Duplikat: {duplicateRows.length}
                </Badge>
              )}
              {invalidRows.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Error: {invalidRows.length}
                </Badge>
              )}
            </div>

            {/* Preview table */}
            <ScrollArea className="h-64 border rounded-lg">
              <div className="p-2 space-y-1">
                {csvRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-2 rounded text-sm ${
                      !row.valid
                        ? 'bg-destructive/10 text-destructive'
                        : row.isDuplicate
                        ? 'bg-muted/50 text-muted-foreground line-through'
                        : 'bg-muted/30'
                    }`}
                  >
                    <span className="font-mono text-xs w-24 flex-shrink-0">{row.holiday_date}</span>
                    <span className="flex-1 truncate">{row.name}</span>
                    {!row.valid && (
                      <span className="text-xs text-destructive flex-shrink-0">{row.error}</span>
                    )}
                    {row.isDuplicate && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">Duplikat</span>
                    )}
                    {row.valid && !row.isDuplicate && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Batal
            </Button>
            <Button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="gap-1">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Impor {validRows.length} Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
