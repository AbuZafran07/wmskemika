import React, { useState, useRef } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Loader2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnits, Unit } from '@/hooks/useMasterData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToCSV, parseCSV, readFileAsText, downloadCSVTemplate, checkDuplicates, getColumnValue } from '@/lib/csvUtils';
import { ImportPreviewDialog, ImportPreviewRow } from '@/components/ImportPreviewDialog';

interface UnitFormData {
  code: string;
  name: string;
  description: string;
  is_active: boolean;
}

const initialFormData: UnitFormData = {
  code: '',
  name: '',
  description: '',
  is_active: true,
};

export default function Units() {
  const { t, language } = useLanguage();
  const { units, loading, refetch } = useUnits();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [deletingUnit, setDeletingUnit] = useState<Unit | null>(null);
  const [formData, setFormData] = useState<UnitFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    exportToCSV(
      units,
      [
        { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
        { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
        { key: 'description', header: language === 'en' ? 'Description' : 'Deskripsi' },
        { key: 'is_active', header: 'Status', getValue: (item) => item.is_active ? 'Active' : 'Inactive' },
      ],
      'units'
    );
    toast.success(language === 'en' ? 'Export successful' : 'Ekspor berhasil');
  };

  const handleDownloadTemplate = () => {
    downloadCSVTemplate(
      [
        { header: language === 'en' ? 'Code' : 'Kode', example: 'KG' },
        { header: language === 'en' ? 'Name' : 'Nama', example: 'Kilogram' },
        { header: language === 'en' ? 'Description' : 'Deskripsi', example: 'Unit of weight' },
        { header: 'Status', example: 'Active' },
      ],
      'units'
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await readFileAsText(file);
      const rows = parseCSV(content);
      
      if (rows.length === 0) {
        toast.error(language === 'en' ? 'No data found in file' : 'Tidak ada data dalam file');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const codeField = language === 'en' ? 'Code' : 'Kode';
      const existingCodes = units.map(u => u.code);
      const duplicateCheck = checkDuplicates(rows, codeField, existingCodes);

      const preview: ImportPreviewRow[] = rows.map((row, index) => {
        const code = getColumnValue(row, ['Code', 'Kode']);
        const name = getColumnValue(row, ['Name', 'Nama']);
        const dupInfo = duplicateCheck.get(index);

        if (!code || !name) {
          return {
            rowIndex: index + 2,
            data: { code, name, description: getColumnValue(row, ['Description', 'Deskripsi']), status: row['Status'] || '' },
            status: 'error' as const,
            message: language === 'en' ? 'Code and Name are required' : 'Kode dan Nama wajib diisi',
          };
        }

        if (dupInfo?.isDuplicate) {
          return {
            rowIndex: index + 2,
            data: { code, name, description: getColumnValue(row, ['Description', 'Deskripsi']), status: row['Status'] || '' },
            status: 'duplicate' as const,
            message: dupInfo.duplicateType === 'database' 
              ? (language === 'en' ? 'Already exists in database' : 'Sudah ada di database')
              : (language === 'en' ? 'Duplicate in CSV file' : 'Duplikat dalam file CSV'),
          };
        }

        return {
          rowIndex: index + 2,
          data: { code, name, description: getColumnValue(row, ['Description', 'Deskripsi']), status: row['Status'] || '' },
          status: 'valid' as const,
        };
      });

      setParsedData(rows);
      setPreviewRows(preview);
      setIsPreviewOpen(true);
    } catch (error) {
      toast.error(language === 'en' ? 'Failed to read file' : 'Gagal membaca file');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    const validRows = previewRows.filter(r => r.status === 'valid');

    for (const previewRow of validRows) {
      const row = parsedData[previewRow.rowIndex - 2];
      const code = getColumnValue(row, ['Code', 'Kode']);
      const name = getColumnValue(row, ['Name', 'Nama']);
      const description = getColumnValue(row, ['Description', 'Deskripsi']);
      const status = row['Status']?.toLowerCase();

      const { error } = await supabase.from('units').insert({
        code: code.toUpperCase(),
        name,
        description: description || null,
        is_active: status !== 'inactive',
      });

      if (error) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    toast.success(
      language === 'en'
        ? `Import complete: ${successCount} success, ${errorCount} failed`
        : `Impor selesai: ${successCount} berhasil, ${errorCount} gagal`
    );
    
    setIsPreviewOpen(false);
    setPreviewRows([]);
    setParsedData([]);
    refetch();
    setIsImporting(false);
  };

  const filteredUnits = units.filter(unit =>
    unit.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    unit.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    setEditingUnit(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setFormData({
      code: unit.code,
      name: unit.name,
      description: unit.description || '',
      is_active: unit.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (unit: Unit) => {
    setDeletingUnit(unit);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    setIsSaving(true);

    const unitData = {
      code: formData.code,
      name: formData.name,
      description: formData.description || null,
      is_active: formData.is_active,
    };

    let error;

    if (editingUnit) {
      const { error: updateError } = await supabase
        .from('units')
        .update(unitData)
        .eq('id', editingUnit.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('units')
        .insert(unitData);
      error = insertError;
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        editingUnit 
          ? (language === 'en' ? 'Unit updated successfully' : 'Satuan berhasil diperbarui')
          : (language === 'en' ? 'Unit created successfully' : 'Satuan berhasil dibuat')
      );
      setIsDialogOpen(false);
      refetch();
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingUnit) return;

    const { error } = await supabase
      .from('units')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingUnit.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Unit deleted successfully' : 'Satuan berhasil dihapus');
      refetch();
    }

    setIsDeleteDialogOpen(false);
    setDeletingUnit(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.units')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage measurement units' : 'Kelola satuan pengukuran'}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isImporting}>
                {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {t('common.import')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {language === 'en' ? 'Import CSV' : 'Impor CSV'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                {language === 'en' ? 'Download Template' : 'Unduh Template'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            {t('common.export')}
          </Button>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            {t('common.add')} {language === 'en' ? 'Unit' : 'Satuan'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search units...' : 'Cari satuan...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              {t('common.filter')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'en' ? 'Code' : 'Kode'}</TableHead>
                  <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                  <TableHead>{language === 'en' ? 'Description' : 'Deskripsi'}</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No units found' : 'Tidak ada satuan ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUnits.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.code}</TableCell>
                      <TableCell>{unit.name}</TableCell>
                      <TableCell className="text-muted-foreground">{unit.description || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={unit.is_active ? 'success' : 'draft'}>
                          {unit.is_active ? t('status.active') : t('status.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="iconSm">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(unit)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(unit)}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('common.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUnit 
                ? (language === 'en' ? 'Edit Unit' : 'Edit Satuan')
                : (language === 'en' ? 'Add New Unit' : 'Tambah Satuan Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Code' : 'Kode'} *</Label>
              <Input
                placeholder="e.g., KG, L, PCS"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Name' : 'Nama'} *</Label>
              <Input
                placeholder={language === 'en' ? 'e.g., Kilogram, Liter' : 'cth., Kilogram, Liter'}
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Description' : 'Deskripsi'}</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter description' : 'Masukkan deskripsi'}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{language === 'en' ? 'Active Status' : 'Status Aktif'}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Unit' : 'Hapus Satuan'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingUnit?.name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingUnit?.name}"? Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Preview Dialog */}
      <ImportPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewRows([]);
          setParsedData([]);
        }}
        onConfirm={handleConfirmImport}
        title={language === 'en' ? 'Preview Import Units' : 'Preview Impor Satuan'}
        rows={previewRows}
        columns={[
          { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
          { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
          { key: 'description', header: language === 'en' ? 'Description' : 'Deskripsi' },
          { key: 'status', header: 'Status' },
        ]}
        isImporting={isImporting}
      />
    </div>
  );
}
