import React, { useState, useRef } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Loader2, Download, Upload } from 'lucide-react';
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
import { useCategories, Category } from '@/hooks/useMasterData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getUserFriendlyError, ErrorMessages } from '@/lib/errorHandler';
import { exportToCSV, parseCSV, readFileAsText, downloadCSVTemplate, checkDuplicates, getColumnValue } from '@/lib/csvUtils';
import { ImportPreviewDialog, ImportPreviewRow } from '@/components/ImportPreviewDialog';
import { DataTablePagination } from '@/components/DataTablePagination';
import { usePagination } from '@/hooks/usePagination';

interface CategoryFormData {
  code: string;
  name: string;
  description: string;
  is_active: boolean;
}

const initialFormData: CategoryFormData = {
  code: '',
  name: '',
  description: '',
  is_active: true,
};

export default function Categories() {
  const { t, language } = useLanguage();
  const { categories, loading, refetch } = useCategories();
  const { canCreate, canEdit, canDelete, canUpload } = usePermissions();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    exportToCSV(
      categories,
      [
        { key: 'code', header: language === 'en' ? 'Code' : 'Kode' },
        { key: 'name', header: language === 'en' ? 'Name' : 'Nama' },
        { key: 'description', header: language === 'en' ? 'Description' : 'Deskripsi' },
        { key: 'is_active', header: 'Status', getValue: (item) => item.is_active ? 'Active' : 'Inactive' },
      ],
      'categories'
    );
    toast.success(language === 'en' ? 'Export successful' : 'Ekspor berhasil');
  };

  const handleDownloadTemplate = () => {
    downloadCSVTemplate(
      [
        { header: language === 'en' ? 'Code' : 'Kode', example: 'CAT-001' },
        { header: language === 'en' ? 'Name' : 'Nama', example: 'Chemical' },
        { header: language === 'en' ? 'Description' : 'Deskripsi', example: 'Chemical products' },
        { header: 'Status', example: 'Active' },
      ],
      'categories'
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

      // Check for duplicates
      const codeField = language === 'en' ? 'Code' : 'Kode';
      const existingCodes = categories.map(c => c.code);
      const duplicateCheck = checkDuplicates(rows, codeField, existingCodes);

      // Build preview rows
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

        if (dupInfo?.isDuplicate && dupInfo.duplicateType === 'database') {
          const existingCategory = categories.find(c => c.code.toLowerCase() === code.toLowerCase());
          return {
            rowIndex: index + 2,
            data: { code, name, description: getColumnValue(row, ['Description', 'Deskripsi']), status: row['Status'] || '' },
            status: 'duplicate' as const,
            message: language === 'en' ? 'Code exists (can update)' : 'Kode sudah ada (dapat diupdate)',
            existingId: existingCategory?.id,
          };
        }

        if (dupInfo?.isDuplicate && dupInfo.duplicateType === 'csv') {
          return {
            rowIndex: index + 2,
            data: { code, name, description: getColumnValue(row, ['Description', 'Deskripsi']), status: row['Status'] || '' },
            status: 'error' as const,
            message: language === 'en' ? 'Duplicate code in CSV' : 'Kode duplikat dalam CSV',
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
      const description = getColumnValue(row, ['Description', 'Deskripsi']);
      const status = row['Status']?.toLowerCase();

      const { error } = await supabase.from('categories').insert({
        code: code.toUpperCase(),
        name,
        description: description || null,
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
      const description = getColumnValue(row, ['Description', 'Deskripsi']);
      const status = row['Status']?.toLowerCase();

      const { error } = await supabase.from('categories')
        .update({
          name,
          description: description || null,
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

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    category.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedCategories,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredCategories);

  const handleAdd = () => {
    setEditingCategory(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      code: category.code,
      name: category.name,
      description: category.description || '',
      is_active: category.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (category: Category) => {
    setDeletingCategory(category);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    setIsSaving(true);

    const categoryData = {
      code: formData.code,
      name: formData.name,
      description: formData.description || null,
      is_active: formData.is_active,
    };

    let error;

    if (editingCategory) {
      const { error: updateError } = await supabase
        .from('categories')
        .update(categoryData)
        .eq('id', editingCategory.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('categories')
        .insert(categoryData);
      error = insertError;
    }

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.create.error('category')));
    } else {
      toast.success(
        editingCategory 
          ? (language === 'en' ? 'Category updated successfully' : 'Kategori berhasil diperbarui')
          : (language === 'en' ? 'Category created successfully' : 'Kategori berhasil dibuat')
      );
      setIsDialogOpen(false);
      refetch();
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingCategory) return;

    const { error } = await supabase
      .from('categories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingCategory.id);

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.delete.error('category')));
    } else {
      toast.success(language === 'en' ? 'Category deleted successfully' : 'Kategori berhasil dihapus');
      refetch();
    }

    setIsDeleteDialogOpen(false);
    setDeletingCategory(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.categories')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage product categories' : 'Kelola kategori produk'}
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
          {canUpload('category') && (
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
          {canCreate('category') && (
            <Button size="sm" onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-2" />
              {t('common.add')} {language === 'en' ? 'Category' : 'Kategori'}
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
                placeholder={language === 'en' ? 'Search categories...' : 'Cari kategori...'}
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
                {filteredCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No categories found' : 'Tidak ada kategori ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCategories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.code}</TableCell>
                      <TableCell>{category.name}</TableCell>
                      <TableCell className="text-muted-foreground">{category.description || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={category.is_active ? 'success' : 'draft'}>
                          {category.is_active ? t('status.active') : t('status.inactive')}
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
                            {canEdit('category') && (
                              <DropdownMenuItem onClick={() => handleEdit(category)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                            )}
                            {canDelete('category') && (
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(category)}>
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
          {!loading && filteredCategories.length > 0 && (
            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={filteredCategories.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory 
                ? (language === 'en' ? 'Edit Category' : 'Edit Kategori')
                : (language === 'en' ? 'Add New Category' : 'Tambah Kategori Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Code' : 'Kode'} *</Label>
              <Input
                placeholder="e.g., CAT-001"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Name' : 'Nama'} *</Label>
              <Input
                placeholder={language === 'en' ? 'Enter category name' : 'Masukkan nama kategori'}
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
            <AlertDialogTitle>{language === 'en' ? 'Delete Category' : 'Hapus Kategori'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingCategory?.name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingCategory?.name}"? Tindakan ini tidak dapat dibatalkan.`}
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
        title={language === 'en' ? 'Preview Import Categories' : 'Preview Impor Kategori'}
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
