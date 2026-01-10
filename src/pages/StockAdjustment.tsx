import React, { useState, useRef, useMemo } from 'react';
import { securePrint, printStyles } from '@/lib/printUtils';
import { Plus, Search, Eye, Edit, MoreHorizontal, CheckCircle, XCircle, Loader2, Upload, ArrowLeft, Trash2, Printer, Archive, List, TrendingUp, TrendingDown } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/usePlanOrders';
import { useProducts, Product } from '@/hooks/useMasterData';
import {
  useStockAdjustments,
  useStockAdjustmentItems,
  useAllBatches,
  createStockAdjustment,
  updateStockAdjustment,
  approveStockAdjustment,
  rejectStockAdjustment,
  deleteStockAdjustment,
  StockAdjustmentHeader,
} from '@/hooks/useStockAdjustments';
import { uploadFile } from '@/lib/storage';
import { generateUniqueStockAdjustmentNumber } from '@/lib/transactionNumberUtils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AdjustmentItem {
  id: string;
  product_id: string;
  batch_id: string;
  adjustment_qty: number;
  notes: string;
  product?: Partial<Product> & { id: string; name: string };
}

const statusConfig: Record<string, { label: string; labelId: string; variant: 'draft' | 'approved' | 'pending' | 'success' | 'cancelled' }> = {
  draft: { label: 'Draft', labelId: 'Draft', variant: 'draft' },
  posted: { label: 'Posted', labelId: 'Diposting', variant: 'success' },
  rejected: { label: 'Rejected', labelId: 'Ditolak', variant: 'cancelled' },
};

export default function StockAdjustment() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { adjustments, loading, refetch } = useStockAdjustments();
  const { products } = useProducts();
  const { batches: allBatches } = useAllBatches();
  const { allowAdminApprove } = useSettings();
  
  // RBAC Permissions
  const { canCreate, canEdit, canDelete, canApproveOrder } = usePermissions();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<StockAdjustmentHeader | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  
  const { items: selectedItems, loading: itemsLoading } = useStockAdjustmentItems(selectedAdjustment?.id || null);
  
  // Form state
  const [adjustmentNumber, setAdjustmentNumber] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [adjustmentItems, setAdjustmentItems] = useState<AdjustmentItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Use RBAC hook for approve permission (only super_admin for stock_adjustment)
  const canApprove = canApproveOrder('stock_adjustment');

  // Filter logic
  const filteredAdjustments = useMemo(() => {
    return adjustments.filter(adj => {
      const matchesSearch = 
        adj.adjustment_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        adj.reason.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || adj.status === statusFilter;
      
      const adjDate = new Date(adj.adjustment_date);
      const matchesDateFrom = !dateFrom || adjDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || adjDate <= new Date(dateTo);
      
      const activeStatuses = ['draft'];
      const archivedStatuses = ['posted', 'rejected'];
      const matchesViewMode = viewMode === 'active' 
        ? activeStatuses.includes(adj.status)
        : archivedStatuses.includes(adj.status);
      
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [adjustments, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  const clearFilters = () => {
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = statusFilter !== 'all' || dateFrom || dateTo;

  const handleExportPDF = () => {
    if (!selectedAdjustment || !printRef.current) return;
    
    securePrint({
      title: `Stock Adjustment - ${selectedAdjustment.adjustment_number}`,
      styles: printStyles.stockAdjustment,
      content: printRef.current.innerHTML
    });
  };

  const generateAdjustmentNumber = async () => {
    const number = await generateUniqueStockAdjustmentNumber();
    setAdjustmentNumber(number);
  };

  const resetForm = () => {
    setAdjustmentNumber('');
    setAdjustmentDate(new Date().toISOString().split('T')[0]);
    setReason('');
    setAttachmentUrl('');
    setAttachmentKey('');
    setAdjustmentItems([]);
  };

  const handleAddItem = () => {
    setAdjustmentItems(prev => [...prev, {
      id: Date.now().toString(),
      product_id: '',
      batch_id: '',
      adjustment_qty: 0,
      notes: '',
    }]);
  };

  const handleRemoveItem = (id: string) => {
    setAdjustmentItems(prev => prev.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof AdjustmentItem, value: string | number) => {
    setAdjustmentItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      if (field === 'product_id') {
        const product = products.find(p => p.id === value);
        return {
          ...item,
          product_id: value as string,
          product,
          batch_id: '', // Reset batch when product changes
        };
      }
      
      return { ...item, [field]: value };
    }));
  };

  const getBatchesForProduct = (productId: string) => {
    return allBatches.filter(b => b.product_id === productId);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, 'documents', 'adjustments');
    
    if (result) {
      setAttachmentUrl(result.url);
      setAttachmentKey(result.path);
      toast.success(language === 'en' ? 'Document uploaded' : 'Dokumen diupload');
    } else {
      toast.error(language === 'en' ? 'Failed to upload' : 'Gagal upload');
    }
    setIsUploading(false);
  };

  const handleSubmit = async () => {
    if (!adjustmentNumber || !reason || adjustmentItems.length === 0) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (adjustmentItems.some(item => !item.product_id || !item.batch_id || item.adjustment_qty === 0)) {
      toast.error(language === 'en' ? 'Please complete all line items with valid qty (not zero)' : 'Harap lengkapi semua item dengan qty yang valid (bukan nol)');
      return;
    }

    if (!attachmentUrl) {
      toast.error(language === 'en' ? 'Please upload evidence/attachment' : 'Harap upload bukti/lampiran');
      return;
    }

    setIsSaving(true);

    const result = await createStockAdjustment(
      {
        adjustment_number: adjustmentNumber,
        adjustment_date: adjustmentDate,
        reason,
        attachment_url: attachmentUrl,
      },
      adjustmentItems.map(item => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes,
      })),
      attachmentKey ? {
        file_key: attachmentKey,
        url: attachmentUrl,
      } : undefined
    );

    if (result.success) {
      toast.success(language === 'en' ? 'Stock Adjustment created' : 'Penyesuaian Stok dibuat');
      setIsFormOpen(false);
      resetForm();
      refetch();
    } else {
      toast.error(result.error || 'Failed');
    }

    setIsSaving(false);
  };

  const handleUpdate = async () => {
    if (!editingAdjustmentId || !adjustmentNumber || !reason || adjustmentItems.length === 0) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (adjustmentItems.some(item => !item.product_id || !item.batch_id || item.adjustment_qty === 0)) {
      toast.error(language === 'en' ? 'Please complete all line items' : 'Harap lengkapi semua item');
      return;
    }

    setIsSaving(true);

    const result = await updateStockAdjustment(
      editingAdjustmentId,
      {
        adjustment_number: adjustmentNumber,
        adjustment_date: adjustmentDate,
        reason,
        attachment_url: attachmentUrl,
      },
      adjustmentItems.map(item => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes,
      }))
    );

    if (result.success) {
      toast.success(language === 'en' ? 'Stock Adjustment updated' : 'Penyesuaian Stok diupdate');
      setIsFormOpen(false);
      setIsEditMode(false);
      setEditingAdjustmentId(null);
      resetForm();
      refetch();
    } else {
      toast.error(result.error || 'Failed');
    }

    setIsSaving(false);
  };

  const handleApprove = async () => {
    if (!selectedAdjustment) return;
    
    if (!canApprove) {
      toast.error(language === 'en' ? 'No permission to approve' : 'Tidak ada izin untuk menyetujui');
      return;
    }

    setIsApproving(true);
    const result = await approveStockAdjustment(selectedAdjustment.id);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Adjustment approved and posted to inventory' : 'Penyesuaian disetujui dan diposting ke inventori');
      refetch();
    } else {
      toast.error(result.error || 'Failed to approve');
    }

    setIsApproving(false);
    setIsApproveDialogOpen(false);
    setSelectedAdjustment(null);
  };

  const handleReject = async () => {
    if (!selectedAdjustment) return;

    setIsRejecting(true);
    const result = await rejectStockAdjustment(selectedAdjustment.id, rejectReason);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Adjustment rejected' : 'Penyesuaian ditolak');
      refetch();
    } else {
      toast.error(result.error || 'Failed to reject');
    }

    setIsRejecting(false);
    setIsRejectDialogOpen(false);
    setRejectReason('');
    setSelectedAdjustment(null);
  };

  const handleDelete = async () => {
    if (!selectedAdjustment) return;

    setIsDeleting(true);
    const result = await deleteStockAdjustment(selectedAdjustment.id);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Adjustment deleted' : 'Penyesuaian dihapus');
      refetch();
    } else {
      toast.error(result.error || 'Failed to delete');
    }

    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setSelectedAdjustment(null);
  };

  const handleViewDetail = (adj: StockAdjustmentHeader) => {
    setSelectedAdjustment(adj);
    setIsDetailDialogOpen(true);
  };

  const handleEdit = async (adj: StockAdjustmentHeader) => {
    setAdjustmentNumber(adj.adjustment_number);
    setAdjustmentDate(adj.adjustment_date);
    setReason(adj.reason);
    setAttachmentUrl(adj.attachment_url || '');
    setAttachmentKey('');
    setEditingAdjustmentId(adj.id);
    setIsEditMode(true);
    setIsFormOpen(true);
    
    // Fetch items
    const { data } = await supabase
      .from('stock_adjustment_items')
      .select(`*, product:products(id, name, sku)`)
      .eq('adjustment_id', adj.id);
    
    if (data) {
      setAdjustmentItems(data.map(item => ({
        id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes || '',
        product: item.product,
      })));
    }
  };

  // Form View
  if (isFormOpen) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setIsFormOpen(false); setIsEditMode(false); setEditingAdjustmentId(null); resetForm(); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {isEditMode ? (language === 'en' ? 'Edit Stock Adjustment' : 'Edit Penyesuaian Stok') : (language === 'en' ? 'Create Stock Adjustment' : 'Buat Penyesuaian Stok')}
            </h1>
            <p className="text-muted-foreground">
              {language === 'en' ? 'Adjust inventory quantities with approval' : 'Sesuaikan kuantitas inventori dengan persetujuan'}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'en' ? 'Adjustment Information' : 'Informasi Penyesuaian'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Adjustment Number' : 'Nomor Penyesuaian'} *</Label>
                    <Input
                      value={adjustmentNumber}
                      disabled
                      className="bg-muted font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Date' : 'Tanggal'} *</Label>
                    <Input
                      type="date"
                      value={adjustmentDate}
                      onChange={(e) => setAdjustmentDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Reason' : 'Alasan'} *</Label>
                  <Textarea
                    placeholder={language === 'en' ? 'Reason for adjustment (e.g., physical count variance, damage, etc.)' : 'Alasan penyesuaian (misal: selisih hitung fisik, kerusakan, dll.)'}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Evidence/Attachment' : 'Bukti/Lampiran'} *</Label>
                  <div className="flex items-center gap-4">
                    {attachmentUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded">
                        <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm truncate max-w-xs text-primary hover:underline">
                          {attachmentUrl.split('/').pop()}
                        </a>
                        <Button variant="ghost" size="iconSm" onClick={() => { setAttachmentUrl(''); setAttachmentKey(''); }}>
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        {language === 'en' ? 'Upload Evidence' : 'Upload Bukti'}
                      </Button>
                    )}
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={handleFileUpload} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{language === 'en' ? 'Adjustment Items' : 'Item Penyesuaian'}</CardTitle>
                <Button size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Add Item' : 'Tambah Item'}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                      <TableHead className="w-[180px]">Batch</TableHead>
                      <TableHead className="text-center">{language === 'en' ? 'Current Qty' : 'Qty Saat Ini'}</TableHead>
                      <TableHead className="text-center">{language === 'en' ? 'Adjustment' : 'Penyesuaian'}</TableHead>
                      <TableHead>{language === 'en' ? 'Notes' : 'Catatan'}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustmentItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {language === 'en' ? 'No items added yet' : 'Belum ada item'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      adjustmentItems.map((item) => {
                        const productBatches = getBatchesForProduct(item.product_id);
                        const selectedBatch = allBatches.find(b => b.id === item.batch_id);
                        
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Select value={item.product_id} onValueChange={(value) => handleItemChange(item.id, 'product_id', value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder={language === 'en' ? 'Select product' : 'Pilih produk'} />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name} {p.sku && `(${p.sku})`}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={item.batch_id} 
                                onValueChange={(value) => handleItemChange(item.id, 'batch_id', value)}
                                disabled={!item.product_id}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select batch" />
                                </SelectTrigger>
                                <SelectContent>
                                  {productBatches.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                      {b.batch_no} (Qty: {b.qty_on_hand})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center">
                              {selectedBatch ? selectedBatch.qty_on_hand : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <Input
                                  type="number"
                                  className="w-24 text-center"
                                  value={item.adjustment_qty}
                                  onChange={(e) => handleItemChange(item.id, 'adjustment_qty', parseInt(e.target.value) || 0)}
                                />
                                {item.adjustment_qty > 0 && <TrendingUp className="w-4 h-4 text-green-600" />}
                                {item.adjustment_qty < 0 && <TrendingDown className="w-4 h-4 text-red-600" />}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                placeholder="Notes"
                                value={item.notes}
                                onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(item.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'en' ? 'Summary' : 'Ringkasan'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Total Items' : 'Total Item'}</span>
                  <span>{adjustmentItems.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Total Increase' : 'Total Penambahan'}</span>
                  <span className="text-green-600">+{adjustmentItems.filter(i => i.adjustment_qty > 0).reduce((s, i) => s + i.adjustment_qty, 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{language === 'en' ? 'Total Decrease' : 'Total Pengurangan'}</span>
                  <span className="text-red-600">{adjustmentItems.filter(i => i.adjustment_qty < 0).reduce((s, i) => s + i.adjustment_qty, 0)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button onClick={isEditMode ? handleUpdate : handleSubmit} disabled={isSaving} className="w-full">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditMode ? (language === 'en' ? 'Update' : 'Update') : (language === 'en' ? 'Save as Draft' : 'Simpan Draft')}
              </Button>
              <Button variant="outline" onClick={() => { setIsFormOpen(false); setIsEditMode(false); setEditingAdjustmentId(null); resetForm(); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{language === 'en' ? 'Stock Adjustment' : 'Penyesuaian Stok'}</h1>
          <p className="text-muted-foreground">{language === 'en' ? 'Adjust inventory with approval workflow' : 'Sesuaikan inventori dengan alur persetujuan'}</p>
        </div>
        {canCreate('stock_adjustment') && (
          <Button onClick={async () => { await generateAdjustmentNumber(); setAdjustmentDate(new Date().toISOString().split('T')[0]); setIsFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Create Adjustment' : 'Buat Penyesuaian'}
          </Button>
        )}
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'active' | 'archived')}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <List className="w-4 h-4" />
            {language === 'en' ? 'Active' : 'Aktif'}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="w-4 h-4" />
            {language === 'en' ? 'Archived' : 'Arsip'}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === 'en' ? 'Search adjustments...' : 'Cari penyesuaian...'}
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'en' ? 'All Status' : 'Semua Status'}</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="posted">{language === 'en' ? 'Posted' : 'Diposting'}</SelectItem>
                  <SelectItem value="rejected">{language === 'en' ? 'Rejected' : 'Ditolak'}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="w-[140px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="From"
              />
              <Input
                type="date"
                className="w-[140px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="To"
              />
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <XCircle className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'en' ? 'Adjustment #' : 'No. Penyesuaian'}</TableHead>
                <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                <TableHead>{language === 'en' ? 'Reason' : 'Alasan'}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredAdjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No adjustments found' : 'Tidak ada penyesuaian'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAdjustments.map((adj) => {
                  const config = statusConfig[adj.status] || statusConfig.draft;
                  // RBAC: Check permissions AND status - rename to avoid shadowing
                  const allowEdit = adj.status === 'draft' && canEdit('stock_adjustment');
                  const allowDelete = adj.status === 'draft' && canDelete('stock_adjustment');
                  const canApproveThis = adj.status === 'draft' && canApprove;
                  
                  return (
                    <TableRow key={adj.id}>
                      <TableCell className="font-medium">{adj.adjustment_number}</TableCell>
                      <TableCell>{formatDate(adj.adjustment_date)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{adj.reason}</TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>
                          {language === 'en' ? config.label : config.labelId}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetail(adj)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {t('common.view')}
                            </DropdownMenuItem>
                            {allowEdit && (
                              <DropdownMenuItem onClick={() => handleEdit(adj)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                            )}
                            {canApproveThis && (
                              <>
                                <DropdownMenuItem onClick={() => { setSelectedAdjustment(adj); setIsApproveDialogOpen(true); }}>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  {language === 'en' ? 'Approve & Post' : 'Setujui & Posting'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedAdjustment(adj); setIsRejectDialogOpen(true); }}>
                                  <XCircle className="w-4 h-4 mr-2" />
                                  {language === 'en' ? 'Reject' : 'Tolak'}
                                </DropdownMenuItem>
                              </>
                            )}
                            {allowDelete && (
                              <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedAdjustment(adj); setIsDeleteDialogOpen(true); }}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('common.delete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Adjustment Details' : 'Detail Penyesuaian'}</DialogTitle>
          </DialogHeader>
          
          {selectedAdjustment && (
            <>
              <div ref={printRef}>
                <div className="header">
                  <div className="company-name">PT. Kemika Karya Pratama</div>
                  <div className="document-title">{language === 'en' ? 'Stock Adjustment' : 'Penyesuaian Stok'}</div>
                </div>
                
                <div className="info-grid grid grid-cols-2 gap-4 mb-4">
                  <div className="info-item">
                    <label className="text-xs text-muted-foreground">{language === 'en' ? 'Adjustment Number' : 'Nomor'}</label>
                    <p className="font-medium">{selectedAdjustment.adjustment_number}</p>
                  </div>
                  <div className="info-item">
                    <label className="text-xs text-muted-foreground">{language === 'en' ? 'Date' : 'Tanggal'}</label>
                    <p className="font-medium">{formatDate(selectedAdjustment.adjustment_date)}</p>
                  </div>
                  <div className="info-item col-span-2">
                    <label className="text-xs text-muted-foreground">{language === 'en' ? 'Reason' : 'Alasan'}</label>
                    <p className="font-medium">{selectedAdjustment.reason}</p>
                  </div>
                  <div className="info-item">
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Badge variant={statusConfig[selectedAdjustment.status]?.variant || 'draft'}>
                      {language === 'en' ? statusConfig[selectedAdjustment.status]?.label : statusConfig[selectedAdjustment.status]?.labelId}
                    </Badge>
                  </div>
                  {selectedAdjustment.rejected_reason && (
                    <div className="info-item col-span-2">
                      <label className="text-xs text-muted-foreground">{language === 'en' ? 'Rejection Reason' : 'Alasan Penolakan'}</label>
                      <p className="font-medium text-destructive">{selectedAdjustment.rejected_reason}</p>
                    </div>
                  )}
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-center">{language === 'en' ? 'Adjustment' : 'Penyesuaian'}</TableHead>
                      <TableHead>{language === 'en' ? 'Notes' : 'Catatan'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product?.sku || '-'}</TableCell>
                          <TableCell>{item.product?.name || '-'}</TableCell>
                          <TableCell>{item.batch?.batch_no || '-'}</TableCell>
                          <TableCell className="text-center">
                            <span className={item.adjustment_qty >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {item.adjustment_qty >= 0 ? '+' : ''}{item.adjustment_qty}
                            </span>
                          </TableCell>
                          <TableCell>{item.notes || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              <DialogFooter>
                {selectedAdjustment.attachment_url && (
                  <Button variant="outline" asChild>
                    <a href={selectedAdjustment.attachment_url} target="_blank" rel="noopener noreferrer">
                      {language === 'en' ? 'View Attachment' : 'Lihat Lampiran'}
                    </a>
                  </Button>
                )}
                <Button variant="outline" onClick={handleExportPDF}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print / PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Approve & Post Adjustment?' : 'Setujui & Posting Penyesuaian?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? 'This will update inventory quantities immediately. This action cannot be undone.'
                : 'Ini akan mengupdate kuantitas inventori segera. Aksi ini tidak dapat dibatalkan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isApproving}>
              {isApproving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Approve & Post' : 'Setujui & Posting'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Reject Adjustment?' : 'Tolak Penyesuaian?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' ? 'Please provide a reason for rejection.' : 'Berikan alasan penolakan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder={language === 'en' ? 'Rejection reason...' : 'Alasan penolakan...'}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="my-4"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={isRejecting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isRejecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Reject' : 'Tolak'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Adjustment?' : 'Hapus Penyesuaian?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' ? 'This will soft delete the adjustment. It can be recovered if needed.' : 'Ini akan menghapus penyesuaian (soft delete). Dapat dipulihkan jika diperlukan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
