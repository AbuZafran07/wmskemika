import React, { useState, useRef } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Loader2, Eye, Download, Upload } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
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
import { useSuppliers, Supplier } from '@/hooks/useMasterData';
import { supabase } from '@/integrations/supabase/client';
import { generateSupplierCode } from '@/lib/codeGenerator';
import { toast } from 'sonner';
import { exportToCSV, parseCSV, readFileAsText, downloadCSVTemplate, checkDuplicates, getColumnValue, validateContactInfo } from '@/lib/csvUtils';
import { ImportPreviewDialog, ImportPreviewRow } from '@/components/ImportPreviewDialog';

interface SupplierFormData {
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  npwp: string;
  terms_payment: string;
  address: string;
  city: string;
  is_active: boolean;
}

const initialFormData: SupplierFormData = {
  code: '',
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  npwp: '',
  terms_payment: '',
  address: '',
  city: '',
  is_active: true,
};

export default function Suppliers() {
  const { t, language } = useLanguage();
  const { suppliers, loading, refetch } = useSuppliers();
  const { canCreate, canEdit, canDelete, canUpload } = usePermissions();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    exportToCSV(
      suppliers,
      [
        { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
        { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
        { key: 'contact_person', header: language === 'en' ? 'Contact Person' : 'Kontak' },
        { key: 'phone', header: language === 'en' ? 'Phone' : 'Telepon' },
        { key: 'email', header: 'Email' },
        { key: 'npwp', header: 'NPWP' },
        { key: 'terms_payment', header: language === 'en' ? 'Payment Terms' : 'Termin Pembayaran' },
        { key: 'address', header: language === 'en' ? 'Address' : 'Alamat' },
        { key: 'city', header: language === 'en' ? 'City' : 'Kota' },
        { key: 'is_active', header: 'Status', getValue: (item) => item.is_active ? 'Active' : 'Inactive' },
      ],
      'suppliers'
    );
    toast.success(language === 'en' ? 'Export successful' : 'Ekspor berhasil');
  };

  const handleDownloadTemplate = () => {
    downloadCSVTemplate(
      [
        { header: language === 'en' ? 'Code' : 'Kode', example: 'VND2026-0001' },
        { header: language === 'en' ? 'Name' : 'Nama', example: 'PT Supplier ABC' },
        { header: language === 'en' ? 'Contact Person' : 'Kontak', example: 'John Doe' },
        { header: language === 'en' ? 'Phone' : 'Telepon', example: '+6281234567890' },
        { header: 'Email', example: 'supplier@example.com' },
        { header: 'NPWP', example: '12.345.678.9-123.456' },
        { header: language === 'en' ? 'Payment Terms' : 'Termin Pembayaran', example: 'NET 30' },
        { header: language === 'en' ? 'Address' : 'Alamat', example: 'Jl. Contoh No. 123' },
        { header: language === 'en' ? 'City' : 'Kota', example: 'Jakarta' },
        { header: 'Status', example: 'Active' },
      ],
      'suppliers'
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
      const existingCodes = suppliers.map(s => s.code);
      const duplicateCheck = checkDuplicates(rows, codeField, existingCodes);

      const preview: ImportPreviewRow[] = rows.map((row, index) => {
        const code = getColumnValue(row, ['Code', 'Kode']);
        const name = getColumnValue(row, ['Name', 'Nama']);
        const dupInfo = duplicateCheck.get(index);

        if (!name) {
          return {
            rowIndex: index + 2,
            data: { code, name, contact: getColumnValue(row, ['Contact Person', 'Kontak']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'error' as const,
            message: language === 'en' ? 'Name is required' : 'Nama wajib diisi',
          };
        }

        // Validate contact info (email & phone)
        const contactValidation = validateContactInfo(row);
        if (!contactValidation.isValid) {
          return {
            rowIndex: index + 2,
            data: { code, name, contact: getColumnValue(row, ['Contact Person', 'Kontak']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'error' as const,
            message: contactValidation.errors.join('; '),
          };
        }

        if (code && dupInfo?.isDuplicate && dupInfo.duplicateType === 'database') {
          const existingSupplier = suppliers.find(s => s.code.toLowerCase() === code.toLowerCase());
          return {
            rowIndex: index + 2,
            data: { code, name, contact: getColumnValue(row, ['Contact Person', 'Kontak']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'duplicate' as const,
            message: language === 'en' ? 'Code exists (can update)' : 'Kode sudah ada (dapat diupdate)',
            existingId: existingSupplier?.id,
          };
        }

        if (code && dupInfo?.isDuplicate && dupInfo.duplicateType === 'csv') {
          return {
            rowIndex: index + 2,
            data: { code, name, contact: getColumnValue(row, ['Contact Person', 'Kontak']), city: getColumnValue(row, ['City', 'Kota']) },
            status: 'error' as const,
            message: language === 'en' ? 'Duplicate code in CSV' : 'Kode duplikat dalam CSV',
          };
        }

        return {
          rowIndex: index + 2,
          data: { code: code || '(auto)', name, contact: getColumnValue(row, ['Contact Person', 'Kontak']), city: getColumnValue(row, ['City', 'Kota']) },
          status: 'valid' as const,
          message: !code ? (language === 'en' ? 'Code will be auto-generated' : 'Kode akan dibuat otomatis') : undefined,
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

  const handleConfirmImport = async (enableUpsert: boolean) => {
    setIsImporting(true);
    let insertCount = 0;
    let updateCount = 0;
    let errorCount = 0;

    const validRows = previewRows.filter(r => r.status === 'valid');
    const duplicateRows = enableUpsert ? previewRows.filter(r => r.status === 'duplicate' && r.existingId) : [];

    for (const previewRow of validRows) {
      const row = parsedData[previewRow.rowIndex - 2];
      const code = getColumnValue(row, ['Code', 'Kode']);
      const name = getColumnValue(row, ['Name', 'Nama']);
      const contact_person = getColumnValue(row, ['Contact Person', 'Kontak']);
      const phone = getColumnValue(row, ['Phone', 'Telepon']);
      const email = row['Email'];
      const npwp = row['NPWP'];
      const terms_payment = getColumnValue(row, ['Payment Terms', 'Termin Pembayaran']);
      const address = getColumnValue(row, ['Address', 'Alamat']);
      const city = getColumnValue(row, ['City', 'Kota']);
      const status = row['Status']?.toLowerCase();

      const autoCode = code || await generateSupplierCode();

      const { error } = await supabase.from('suppliers').insert({
        code: autoCode.toUpperCase(),
        name,
        contact_person: contact_person || null,
        phone: phone || null,
        email: email || null,
        npwp: npwp || null,
        terms_payment: terms_payment || null,
        address: address || null,
        city: city || null,
        is_active: status !== 'inactive',
      });

      if (error) {
        errorCount++;
      } else {
        insertCount++;
      }
    }

    for (const previewRow of duplicateRows) {
      const row = parsedData[previewRow.rowIndex - 2];
      const name = getColumnValue(row, ['Name', 'Nama']);
      const contact_person = getColumnValue(row, ['Contact Person', 'Kontak']);
      const phone = getColumnValue(row, ['Phone', 'Telepon']);
      const email = row['Email'];
      const npwp = row['NPWP'];
      const terms_payment = getColumnValue(row, ['Payment Terms', 'Termin Pembayaran']);
      const address = getColumnValue(row, ['Address', 'Alamat']);
      const city = getColumnValue(row, ['City', 'Kota']);
      const status = row['Status']?.toLowerCase();

      const { error } = await supabase.from('suppliers')
        .update({
          name,
          contact_person: contact_person || null,
          phone: phone || null,
          email: email || null,
          npwp: npwp || null,
          terms_payment: terms_payment || null,
          address: address || null,
          city: city || null,
          is_active: status !== 'inactive',
        })
        .eq('id', previewRow.existingId!);

      if (error) {
        errorCount++;
      } else {
        updateCount++;
      }
    }

    const message = language === 'en'
      ? `Import complete: ${insertCount} inserted, ${updateCount} updated, ${errorCount} failed`
      : `Impor selesai: ${insertCount} ditambahkan, ${updateCount} diupdate, ${errorCount} gagal`;
    
    toast.success(message);
    
    setIsPreviewOpen(false);
    setPreviewRows([]);
    setParsedData([]);
    refetch();
    setIsImporting(false);
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = async () => {
    setEditingSupplier(null);
    const autoCode = await generateSupplierCode();
    setFormData({ ...initialFormData, code: autoCode });
    setIsDialogOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      code: supplier.code,
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      npwp: supplier.npwp || '',
      terms_payment: supplier.terms_payment || '',
      address: supplier.address || '',
      city: supplier.city || '',
      is_active: supplier.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleView = (supplier: Supplier) => {
    setViewingSupplier(supplier);
    setIsViewDialogOpen(true);
  };

  const handleDelete = (supplier: Supplier) => {
    setDeletingSupplier(supplier);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    setIsSaving(true);

    const supplierData = {
      code: formData.code,
      name: formData.name,
      contact_person: formData.contact_person || null,
      phone: formData.phone || null,
      email: formData.email || null,
      npwp: formData.npwp || null,
      terms_payment: formData.terms_payment || null,
      address: formData.address || null,
      city: formData.city || null,
      is_active: formData.is_active,
    };

    let error;

    if (editingSupplier) {
      const { error: updateError } = await supabase
        .from('suppliers')
        .update(supplierData)
        .eq('id', editingSupplier.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('suppliers')
        .insert(supplierData);
      error = insertError;
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        editingSupplier 
          ? (language === 'en' ? 'Supplier updated successfully' : 'Supplier berhasil diperbarui')
          : (language === 'en' ? 'Supplier created successfully' : 'Supplier berhasil dibuat')
      );
      setIsDialogOpen(false);
      refetch();
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingSupplier) return;

    const { error } = await supabase
      .from('suppliers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingSupplier.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Supplier deleted successfully' : 'Supplier berhasil dihapus');
      refetch();
    }

    setIsDeleteDialogOpen(false);
    setDeletingSupplier(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.suppliers')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage supplier data' : 'Kelola data supplier'}
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
          {canUpload('supplier') && (
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
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            {t('common.export')}
          </Button>
          {canCreate('supplier') && (
            <Button size="sm" onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              {t('common.add')} Supplier
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search suppliers...' : 'Cari supplier...'}
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
                  <TableHead>{language === 'en' ? 'Contact Person' : 'Kontak'}</TableHead>
                  <TableHead>{language === 'en' ? 'Phone' : 'Telepon'}</TableHead>
                  <TableHead>{language === 'en' ? 'City' : 'Kota'}</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No suppliers found' : 'Tidak ada supplier ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.code}</TableCell>
                      <TableCell>{supplier.name}</TableCell>
                      <TableCell>{supplier.contact_person || '-'}</TableCell>
                      <TableCell>{supplier.phone || '-'}</TableCell>
                      <TableCell>{supplier.city || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={supplier.is_active ? 'success' : 'draft'}>
                          {supplier.is_active ? t('status.active') : t('status.inactive')}
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
                            <DropdownMenuItem onClick={() => handleView(supplier)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {language === 'en' ? 'View Details' : 'Lihat Detail'}
                            </DropdownMenuItem>
                            {canEdit('supplier') && (
                              <DropdownMenuItem onClick={() => handleEdit(supplier)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                            )}
                            {canDelete('supplier') && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(supplier)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('common.delete')}
                              </DropdownMenuItem>
                            )}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier 
                ? (language === 'en' ? 'Edit Supplier' : 'Edit Supplier')
                : (language === 'en' ? 'Add New Supplier' : 'Tambah Supplier Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Code' : 'Kode'} *</Label>
                <Input
                  placeholder="e.g., SUP-001"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Name' : 'Nama'} *</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter supplier name' : 'Masukkan nama supplier'}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Contact Person' : 'Kontak Person'}</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter contact person' : 'Masukkan kontak person'}
                  value={formData.contact_person}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Phone' : 'Telepon'}</Label>
                <Input
                  placeholder="+62..."
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@supplier.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>NPWP</Label>
                <Input
                  placeholder="XX.XXX.XXX.X-XXX.XXX"
                  value={formData.npwp}
                  onChange={(e) => setFormData(prev => ({ ...prev, npwp: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Payment Terms' : 'Termin Pembayaran'}</Label>
                <Input
                  placeholder="e.g., NET 30"
                  value={formData.terms_payment}
                  onChange={(e) => setFormData(prev => ({ ...prev, terms_payment: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'City' : 'Kota'}</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter city' : 'Masukkan kota'}
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Address' : 'Alamat'}</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter full address' : 'Masukkan alamat lengkap'}
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
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

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Supplier Details' : 'Detail Supplier'}</DialogTitle>
          </DialogHeader>
          {viewingSupplier && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Code' : 'Kode'}</Label>
                  <p className="font-medium">{viewingSupplier.code}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Name' : 'Nama'}</Label>
                  <p className="font-medium">{viewingSupplier.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Contact Person' : 'Kontak Person'}</Label>
                  <p className="font-medium">{viewingSupplier.contact_person || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Phone' : 'Telepon'}</Label>
                  <p className="font-medium">{viewingSupplier.phone || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{viewingSupplier.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">NPWP</Label>
                  <p className="font-medium">{viewingSupplier.npwp || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Payment Terms' : 'Termin Pembayaran'}</Label>
                  <p className="font-medium">{viewingSupplier.terms_payment || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'City' : 'Kota'}</Label>
                  <p className="font-medium">{viewingSupplier.city || '-'}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">{language === 'en' ? 'Address' : 'Alamat'}</Label>
                <p className="font-medium">{viewingSupplier.address || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <Badge variant={viewingSupplier.is_active ? 'success' : 'draft'} className="mt-1">
                  {viewingSupplier.is_active ? t('status.active') : t('status.inactive')}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Supplier' : 'Hapus Supplier'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingSupplier?.name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingSupplier?.name}"? Tindakan ini tidak dapat dibatalkan.`}
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
        title={language === 'en' ? 'Preview Import Suppliers' : 'Preview Impor Supplier'}
        rows={previewRows}
        columns={[
          { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
          { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
          { key: 'contact', header: language === 'en' ? 'Contact' : 'Kontak' },
          { key: 'city', header: language === 'en' ? 'City' : 'Kota' },
        ]}
        isImporting={isImporting}
      />
    </div>
  );
}
