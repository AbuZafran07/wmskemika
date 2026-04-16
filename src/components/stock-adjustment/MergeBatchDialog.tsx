import React, { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Upload, XCircle, Merge, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Product } from '@/hooks/useMasterData';
import { toast } from 'sonner';

interface MergeBatchDialogProps {
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

export default function MergeBatchDialog({
  open,
  onOpenChange,
  products,
  allBatches,
  onSubmit,
}: MergeBatchDialogProps) {
  const { language } = useLanguage();
  const [productId, setProductId] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');
  const [targetBatchId, setTargetBatchId] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [targetExpiry, setTargetExpiry] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const productBatches = useMemo(
    () => allBatches.filter(b => b.product_id === productId && b.qty_on_hand > 0),
    [allBatches, productId]
  );

  const selectedBatches = useMemo(
    () => productBatches.filter(b => selectedBatchIds.includes(b.id)),
    [productBatches, selectedBatchIds]
  );

  const totalMergedQty = useMemo(
    () => selectedBatches.reduce((s, b) => s + b.qty_on_hand, 0),
    [selectedBatches]
  );

  const targetBatchName = useMemo(() => {
    if (targetMode === 'new') return newBatchName.trim();
    const batch = allBatches.find(b => b.id === targetBatchId);
    return batch?.batch_no || '';
  }, [targetMode, targetBatchId, newBatchName, allBatches]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

  const handleReset = () => {
    setProductId('');
    setSelectedBatchIds([]);
    setTargetMode('existing');
    setTargetBatchId('');
    setNewBatchName('');
    setTargetExpiry('');
    setReason('');
    setAttachmentUrl('');
    setAttachmentKey('');
    setAttachmentPreviewUrl('');
  };

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds(prev =>
      prev.includes(batchId) ? prev.filter(id => id !== batchId) : [...prev, batchId]
    );
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
    if (!productId) {
      toast.error(language === 'en' ? 'Select a product' : 'Pilih produk');
      return;
    }
    if (selectedBatchIds.length < 2) {
      toast.error(language === 'en' ? 'Select at least 2 batches to merge' : 'Pilih minimal 2 batch untuk digabung');
      return;
    }
    if (!targetBatchName) {
      toast.error(language === 'en' ? 'Specify target batch name' : 'Tentukan nama batch tujuan');
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

    // Build adjustment items:
    // For each selected source batch that is NOT the target (or all if new name),
    // create an item that moves its full qty to the target batch name.
    const items: Array<{
      product_id: string;
      batch_id: string;
      adjustment_qty: number;
      notes: string;
      new_batch_no: string;
      new_expired_date: string | null;
    }> = [];

    for (const batch of selectedBatches) {
      // If target is an existing batch and this IS that batch, skip (it stays)
      if (targetMode === 'existing' && batch.id === targetBatchId) continue;

      items.push({
        product_id: productId,
        batch_id: batch.id,
        adjustment_qty: batch.qty_on_hand, // positive = move to new batch
        notes: `Merge → ${targetBatchName}`,
        new_batch_no: targetBatchName,
        new_expired_date: targetExpiry || null,
      });
    }

    if (items.length === 0) {
      toast.error(language === 'en' ? 'No items to merge' : 'Tidak ada item untuk digabung');
      return;
    }

    setIsSaving(true);
    try {
      await onSubmit({
        reason: reason.trim(),
        attachmentUrl,
        attachmentKey,
        items,
      });
      handleReset();
      onOpenChange(false);
    } catch {
      // handled in parent
    }
    setIsSaving(false);
  };

  // Batches available as merge target (selected ones only)
  const targetOptions = selectedBatches.map(b => ({
    value: b.id,
    label: b.batch_no,
    description: `Qty: ${b.qty_on_hand}`,
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-5 h-5" />
            {language === 'en' ? 'Merge Batches' : 'Gabung Batch'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Product Selection */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {language === 'en' ? 'Select Product' : 'Pilih Produk'}
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Product' : 'Produk'} *</Label>
                <SearchableSelect
                  value={productId}
                  onValueChange={(v) => {
                    setProductId(v);
                    setSelectedBatchIds([]);
                    setTargetBatchId('');
                    setNewBatchName('');
                  }}
                  options={products.map(p => ({
                    value: p.id,
                    label: `${p.name}${p.sku ? ` (${p.sku})` : ''}`,
                  }))}
                  placeholder={language === 'en' ? 'Select product' : 'Pilih produk'}
                  searchPlaceholder={language === 'en' ? 'Search...' : 'Cari...'}
                  emptyMessage={language === 'en' ? 'Not found' : 'Tidak ditemukan'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Batch Selection */}
          {productId && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {language === 'en' ? 'Select Batches to Merge' : 'Pilih Batch untuk Digabung'}
                  </div>
                  <Badge variant="draft">{selectedBatchIds.length} {language === 'en' ? 'selected' : 'dipilih'}</Badge>
                </div>

                {productBatches.length < 2 ? (
                  <div className="text-sm text-muted-foreground text-center py-4 flex items-center gap-2 justify-center">
                    <AlertTriangle className="w-4 h-4" />
                    {language === 'en'
                      ? 'This product needs at least 2 batches with stock to merge'
                      : 'Produk ini butuh minimal 2 batch berisi stok untuk digabung'}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-center">{language === 'en' ? 'Expiry' : 'Expired'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productBatches.map(batch => (
                        <TableRow
                          key={batch.id}
                          className={`cursor-pointer ${selectedBatchIds.includes(batch.id) ? 'bg-primary/5' : ''}`}
                          onClick={() => toggleBatch(batch.id)}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedBatchIds.includes(batch.id)}
                              onCheckedChange={() => toggleBatch(batch.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{batch.batch_no}</TableCell>
                          <TableCell className="text-center">{batch.qty_on_hand}</TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {batch.expired_date ? formatDate(batch.expired_date) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Target Batch Config */}
          {selectedBatchIds.length >= 2 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {language === 'en' ? 'Target Batch' : 'Batch Tujuan'}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={targetMode === 'existing' ? 'default' : 'outline'}
                    onClick={() => { setTargetMode('existing'); setNewBatchName(''); }}
                  >
                    {language === 'en' ? 'Use Existing Name' : 'Pakai Nama Batch yang Ada'}
                  </Button>
                  <Button
                    size="sm"
                    variant={targetMode === 'new' ? 'default' : 'outline'}
                    onClick={() => { setTargetMode('new'); setTargetBatchId(''); }}
                  >
                    {language === 'en' ? 'New Name' : 'Nama Baru'}
                  </Button>
                </div>

                {targetMode === 'existing' ? (
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Merge into batch' : 'Gabungkan ke batch'}</Label>
                    <SearchableSelect
                      value={targetBatchId}
                      onValueChange={setTargetBatchId}
                      options={targetOptions}
                      placeholder={language === 'en' ? 'Select target batch' : 'Pilih batch tujuan'}
                      searchPlaceholder={language === 'en' ? 'Search...' : 'Cari...'}
                      emptyMessage={language === 'en' ? 'Not found' : 'Tidak ditemukan'}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'New batch name' : 'Nama batch baru'}</Label>
                    <Input
                      value={newBatchName}
                      onChange={(e) => setNewBatchName(e.target.value)}
                      placeholder={language === 'en' ? 'e.g. Combined Batch' : 'cth. Batch Gabungan'}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Target Expiry (optional)' : 'Expired Tujuan (opsional)'}</Label>
                  <Input
                    type="date"
                    value={targetExpiry}
                    onChange={(e) => setTargetExpiry(e.target.value)}
                    className="w-[200px]"
                  />
                </div>

                {/* Merge Preview */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="text-sm font-semibold">{language === 'en' ? 'Merge Preview' : 'Pratinjau Gabung'}</div>
                  <div className="space-y-1">
                    {selectedBatches.map(b => (
                      <div key={b.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          {b.batch_no}
                          {targetMode === 'existing' && b.id === targetBatchId && (
                            <Badge variant="draft" className="text-[10px]">{language === 'en' ? 'Target' : 'Tujuan'}</Badge>
                          )}
                        </span>
                        <span>{b.qty_on_hand} pcs</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                    <span className="flex items-center gap-2">
                      {targetBatchName || '(?)'}
                      <Badge className="text-[10px] bg-primary/20 text-primary">{language === 'en' ? 'Result' : 'Hasil'}</Badge>
                    </span>
                    <span className="text-primary">{totalMergedQty} pcs</span>
                  </div>

                  {/* Visual bar */}
                  <div className="h-3 bg-muted rounded-full overflow-hidden flex">
                    {selectedBatches.map((b, i) => {
                      const pct = totalMergedQty > 0 ? (b.qty_on_hand / totalMergedQty) * 100 : 0;
                      const colors = ['bg-primary', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
                      return (
                        <div
                          key={b.id}
                          className={`${colors[i % colors.length]} transition-all`}
                          style={{ width: `${pct}%` }}
                          title={`${b.batch_no}: ${b.qty_on_hand}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedBatches.map((b, i) => {
                      const colors = ['bg-primary', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];
                      return (
                        <div key={b.id} className="flex items-center gap-1 text-[10px]">
                          <div className={`w-2 h-2 rounded-full ${colors[i % colors.length]}`} />
                          {b.batch_no}: {b.qty_on_hand}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reason & Attachment */}
          {selectedBatchIds.length >= 2 && targetBatchName && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Reason' : 'Alasan'} *</Label>
                  <Textarea
                    placeholder={language === 'en' ? 'Reason for merging batches...' : 'Alasan penggabungan batch...'}
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
            disabled={isSaving || selectedBatchIds.length < 2 || !targetBatchName}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Merge className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Merge & Save Draft' : 'Gabung & Simpan Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
