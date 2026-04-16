import React, { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Loader2, Upload, XCircle, ArrowRight, Split, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Product } from '@/hooks/useMasterData';
import { toast } from 'sonner';

interface TargetBatch {
  id: string;
  batch_no: string;
  qty: number;
  expired_date: string;
  notes: string;
}

interface BatchSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  allBatches: Array<{
    id: string;
    product_id: string;
    batch_no: string;
    qty_on_hand: number;
    expired_date?: string | null;
  }>;
  onSubmit: (data: {
    reason: string;
    attachmentUrl: string;
    attachmentKey: string;
    items: Array<{
      product_id: string;
      batch_id: string;
      adjustment_qty: number;
      notes: string;
      new_batch_no: string;
      new_expired_date: string | null;
    }>;
  }) => Promise<void>;
}

export default function BatchSplitDialog({
  open,
  onOpenChange,
  products,
  allBatches,
  onSubmit,
}: BatchSplitDialogProps) {
  const { language } = useLanguage();
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [reason, setReason] = useState('');
  const [targetBatches, setTargetBatches] = useState<TargetBatch[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sourceBatch = useMemo(() => allBatches.find(b => b.id === batchId), [allBatches, batchId]);
  const productBatches = useMemo(() => allBatches.filter(b => b.product_id === productId), [allBatches, productId]);
  const sourceQty = sourceBatch?.qty_on_hand ?? 0;

  const totalAllocated = useMemo(() => targetBatches.reduce((s, t) => s + (t.qty || 0), 0), [targetBatches]);
  const remaining = sourceQty - totalAllocated;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleReset = () => {
    setProductId('');
    setBatchId('');
    setReason('');
    setTargetBatches([]);
    setAttachmentUrl('');
    setAttachmentKey('');
    setAttachmentPreviewUrl('');
  };

  const handleAddTarget = () => {
    setTargetBatches(prev => [...prev, {
      id: Date.now().toString(),
      batch_no: '',
      qty: 0,
      expired_date: sourceBatch?.expired_date?.split('T')[0] || '',
      notes: '',
    }]);
  };

  const handleRemoveTarget = (id: string) => {
    setTargetBatches(prev => prev.filter(t => t.id !== id));
  };

  const handleTargetChange = (id: string, field: keyof TargetBatch, value: string | number) => {
    setTargetBatches(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const { uploadFile } = await import('@/lib/storage');
    const result = await uploadFile(file, 'documents', 'adjustments');
    if (result) {
      setAttachmentUrl(result.path);
      setAttachmentKey(result.path);
      setAttachmentPreviewUrl(result.url);
      toast.success(language === 'en' ? 'Document uploaded' : 'Dokumen diupload');
    } else {
      toast.error(language === 'en' ? 'Failed to upload' : 'Gagal upload');
    }
    setIsUploading(false);
  };

  const handleSubmit = async () => {
    if (!productId || !batchId) {
      toast.error(language === 'en' ? 'Select product and batch' : 'Pilih produk dan batch');
      return;
    }
    if (targetBatches.length === 0) {
      toast.error(language === 'en' ? 'Add at least one target batch' : 'Tambah minimal 1 batch tujuan');
      return;
    }
    if (targetBatches.some(t => !t.batch_no.trim())) {
      toast.error(language === 'en' ? 'All target batch names are required' : 'Semua nama batch tujuan wajib diisi');
      return;
    }
    if (targetBatches.some(t => t.qty <= 0)) {
      toast.error(language === 'en' ? 'All quantities must be > 0' : 'Semua kuantitas harus > 0');
      return;
    }
    // Check duplicate batch names
    const names = targetBatches.map(t => t.batch_no.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      toast.error(language === 'en' ? 'Duplicate batch names found' : 'Ada nama batch duplikat');
      return;
    }
    // Check if any target has the same name as source
    if (targetBatches.some(t => t.batch_no.trim() === sourceBatch?.batch_no)) {
      toast.error(
        language === 'en'
          ? 'Target batch name cannot be the same as source batch. The remainder stays in the original batch automatically.'
          : 'Nama batch tujuan tidak boleh sama dengan batch asal. Sisa otomatis tetap di batch asal.'
      );
      return;
    }
    if (totalAllocated > sourceQty) {
      toast.error(language === 'en' ? 'Total exceeds source batch qty' : 'Total melebihi stok batch asal');
      return;
    }
    if (remaining < 0) {
      toast.error(language === 'en' ? 'Insufficient stock' : 'Stok tidak cukup');
      return;
    }
    if (!reason.trim()) {
      toast.error(language === 'en' ? 'Reason is required' : 'Alasan wajib diisi');
      return;
    }
    if (!attachmentUrl) {
      toast.error(language === 'en' ? 'Please upload evidence/attachment' : 'Harap upload bukti/lampiran');
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        reason: reason.trim(),
        attachmentUrl,
        attachmentKey,
        items: targetBatches.map(t => ({
          product_id: productId,
          batch_id: batchId,
          adjustment_qty: t.qty,
          notes: t.notes,
          new_batch_no: t.batch_no.trim(),
          new_expired_date: t.expired_date || null,
        })),
      });
      handleReset();
      onOpenChange(false);
    } catch {
      // error handled in parent
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="w-5 h-5" />
            {language === 'en' ? 'Split Batch' : 'Pecah Batch'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Source Selection */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {language === 'en' ? 'Source Batch' : 'Batch Asal'}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Product' : 'Produk'} *</Label>
                  <SearchableSelect
                    value={productId}
                    onValueChange={(v) => { setProductId(v); setBatchId(''); setTargetBatches([]); }}
                    options={products.map(p => ({
                      value: p.id,
                      label: `${p.name}${p.sku ? ` (${p.sku})` : ''}`,
                    }))}
                    placeholder={language === 'en' ? 'Select product' : 'Pilih produk'}
                    searchPlaceholder={language === 'en' ? 'Search...' : 'Cari...'}
                    emptyMessage={language === 'en' ? 'Not found' : 'Tidak ditemukan'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Batch *</Label>
                  <SearchableSelect
                    value={batchId}
                    onValueChange={(v) => { setBatchId(v); setTargetBatches([]); }}
                    disabled={!productId}
                    options={productBatches.map(b => ({
                      value: b.id,
                      label: b.batch_no,
                      description: `Qty: ${b.qty_on_hand}${b.expired_date ? ` | Exp: ${formatDate(b.expired_date)}` : ''}`,
                    }))}
                    placeholder={language === 'en' ? 'Select batch' : 'Pilih batch'}
                    searchPlaceholder={language === 'en' ? 'Search...' : 'Cari...'}
                    emptyMessage={language === 'en' ? 'Not found' : 'Tidak ditemukan'}
                  />
                </div>
              </div>

              {sourceBatch && (
                <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                  <div>
                    <span className="text-xs text-muted-foreground">{language === 'en' ? 'Current Stock' : 'Stok Saat Ini'}</span>
                    <p className="text-2xl font-bold">{sourceQty}</p>
                  </div>
                  {sourceBatch.expired_date && (
                    <div>
                      <span className="text-xs text-muted-foreground">Expired</span>
                      <p className="font-medium">{formatDate(sourceBatch.expired_date)}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Target Batches */}
          {sourceBatch && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {language === 'en' ? 'Target Batches (New)' : 'Batch Tujuan (Baru)'}
                  </div>
                  <Button size="sm" variant="outline" onClick={handleAddTarget}>
                    <Plus className="w-4 h-4 mr-1" />
                    {language === 'en' ? 'Add Batch' : 'Tambah Batch'}
                  </Button>
                </div>

                {targetBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {language === 'en' ? 'Click "Add Batch" to add target batches' : 'Klik "Tambah Batch" untuk menambah batch tujuan'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'en' ? 'Batch Name' : 'Nama Batch'}</TableHead>
                        <TableHead className="text-center w-[100px]">Qty</TableHead>
                        <TableHead className="w-[140px]">{language === 'en' ? 'Expiry' : 'Expired'}</TableHead>
                        <TableHead className="w-[120px]">{language === 'en' ? 'Notes' : 'Catatan'}</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {targetBatches.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <Input
                              value={t.batch_no}
                              onChange={(e) => handleTargetChange(t.id, 'batch_no', e.target.value)}
                              placeholder={language === 'en' ? 'e.g. Hitam Lurus' : 'cth. Hitam Lurus'}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              max={sourceQty}
                              className="text-center"
                              value={t.qty || ''}
                              onChange={(e) => handleTargetChange(t.id, 'qty', parseInt(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={t.expired_date}
                              onChange={(e) => handleTargetChange(t.id, 'expired_date', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={t.notes}
                              onChange={(e) => handleTargetChange(t.id, 'notes', e.target.value)}
                              placeholder="Notes"
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="iconSm" onClick={() => handleRemoveTarget(t.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* Allocation Summary */}
                {targetBatches.length > 0 && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm font-semibold">{language === 'en' ? 'Allocation Summary' : 'Ringkasan Alokasi'}</div>
                    
                    <div className="space-y-1">
                      {targetBatches.map(t => (
                        <div key={t.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t.batch_no || '(unnamed)'}</span>
                          <span className="text-primary font-medium">{t.qty} pcs</span>
                        </div>
                      ))}
                      <div className="border-t pt-2 mt-2 flex justify-between text-sm font-semibold">
                        <span className="flex items-center gap-2">
                          {sourceBatch.batch_no}
                          <Badge variant="draft" className="text-[10px]">{language === 'en' ? 'Remaining' : 'Sisa'}</Badge>
                        </span>
                        <span className={remaining < 0 ? 'text-destructive' : remaining === 0 ? 'text-muted-foreground' : ''}>
                          {remaining} pcs
                        </span>
                      </div>
                    </div>

                    {remaining < 0 && (
                      <div className="flex items-center gap-2 text-destructive text-xs">
                        <AlertTriangle className="w-4 h-4" />
                        {language === 'en' ? 'Total exceeds source stock!' : 'Total melebihi stok asal!'}
                      </div>
                    )}

                    {/* Visual bar */}
                    <div className="h-3 bg-muted rounded-full overflow-hidden flex">
                      {targetBatches.map((t, i) => {
                        const pct = sourceQty > 0 ? (t.qty / sourceQty) * 100 : 0;
                        const colors = ['bg-primary', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
                        return (
                          <div
                            key={t.id}
                            className={`${colors[i % colors.length]} transition-all`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                            title={`${t.batch_no}: ${t.qty}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {targetBatches.map((t, i) => {
                        const colors = ['bg-primary', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
                        return (
                          <div key={t.id} className="flex items-center gap-1 text-[10px]">
                            <div className={`w-2 h-2 rounded-full ${colors[i % colors.length]}`} />
                            {t.batch_no || '?'}: {t.qty}
                          </div>
                        );
                      })}
                      {remaining > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                          {sourceBatch.batch_no}: {remaining}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reason & Attachment */}
          {sourceBatch && targetBatches.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Reason' : 'Alasan'} *</Label>
                  <Textarea
                    placeholder={language === 'en' ? 'Reason for batch split...' : 'Alasan pecah batch...'}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Evidence/Attachment' : 'Bukti/Lampiran'} *</Label>
                  <div className="flex items-center gap-4">
                    {attachmentPreviewUrl || attachmentUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded">
                        <a href={attachmentPreviewUrl || attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm truncate max-w-[200px] text-primary hover:underline">
                          {(attachmentPreviewUrl || attachmentUrl).split('/').pop()?.split('?')[0]}
                        </a>
                        <Button variant="ghost" size="iconSm" onClick={() => { setAttachmentUrl(''); setAttachmentKey(''); setAttachmentPreviewUrl(''); }}>
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
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { handleReset(); onOpenChange(false); }}>
            {language === 'en' ? 'Cancel' : 'Batal'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !sourceBatch || targetBatches.length === 0 || remaining < 0}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Split className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Split & Save Draft' : 'Pecah & Simpan Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
