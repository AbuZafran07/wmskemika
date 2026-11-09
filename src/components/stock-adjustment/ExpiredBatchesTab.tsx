import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2, Loader2, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ExpiredBatch {
  id: string;
  batch_no: string;
  expired_date: string;
  qty_on_hand: number;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  unit_name: string | null;
}

const MANAGE_ROLES = ['super_admin', 'admin', 'finance', 'purchasing'];

function daysExpired(expiredDate: string): number {
  const diffMs = new Date().setHours(0, 0, 0, 0) - new Date(expiredDate).setHours(0, 0, 0, 0);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ExpiredBatchesTab() {
  const { user } = useAuth();
  const canManage = !!user?.role && MANAGE_ROLES.includes(user.role);

  const [batches, setBatches] = useState<ExpiredBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpiredBatches = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_batches')
      .select('id, batch_no, expired_date, qty_on_hand, products!inner(id, name, sku, units(name))')
      .lt('expired_date', new Date().toISOString().split('T')[0])
      .gt('qty_on_hand', 0)
      .order('expired_date', { ascending: true });

    if (error) {
      console.error('Error fetching expired batches:', error);
      toast.error('Gagal memuat data barang expired');
      setLoading(false);
      return;
    }

    // Kurangi qty yang sudah diajukan di BAP pending agar batch tidak dimusnahkan dua kali
    const batchIds = (data || []).map((b: any) => b.id);
    const pendingByBatch: Record<string, number> = {};
    if (batchIds.length > 0) {
      const { data: pendingItems } = await (supabase as any)
        .from('destruction_order_items')
        .select('batch_id, qty_to_destroy, destruction_orders!inner(status)')
        .in('batch_id', batchIds)
        .eq('destruction_orders.status', 'pending');
      (pendingItems || []).forEach((it: any) => {
        pendingByBatch[it.batch_id] = (pendingByBatch[it.batch_id] || 0) + (it.qty_to_destroy || 0);
      });
    }

    setBatches(
      (data || [])
        .map((b: any) => ({ ...b, qty_on_hand: b.qty_on_hand - (pendingByBatch[b.id] || 0) }))
        .filter((b: any) => b.qty_on_hand > 0)
        .map((b: any) => ({
        id: b.id,
        batch_no: b.batch_no,
        expired_date: b.expired_date,
        qty_on_hand: b.qty_on_hand,
        product_id: b.products.id,
        product_name: b.products.name,
        product_sku: b.products.sku,
        unit_name: b.products.units?.name || null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchExpiredBatches();
  }, [fetchExpiredBatches]);

  // --- Extend Expired ---
  const [extendTarget, setExtendTarget] = useState<ExpiredBatch | null>(null);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extendDate, setExtendDate] = useState('');
  const [extendReason, setExtendReason] = useState('');
  const [savingExtend, setSavingExtend] = useState(false);

  const handleExtend = (batch: ExpiredBatch) => {
    setExtendTarget(batch);
    setExtendDate('');
    setExtendReason('');
    setShowExtendDialog(true);
  };

  const confirmExtend = async () => {
    if (!extendTarget || !extendDate || !extendReason.trim()) {
      toast.error('Tanggal baru dan alasan wajib diisi');
      return;
    }
    setSavingExtend(true);
    const { error } = await supabase.rpc('extend_batch_expiry', {
      p_batch_id: extendTarget.id,
      p_new_expired_date: extendDate,
      p_reason: extendReason.trim(),
    });
    setSavingExtend(false);

    if (error) {
      toast.error(error.message || 'Gagal memperpanjang tanggal expired');
      return;
    }

    toast.success(`Expired batch ${extendTarget.batch_no} berhasil diperpanjang`);
    setShowExtendDialog(false);
    setExtendTarget(null);
    fetchExpiredBatches();
  };

  // --- Musnahkan (buat BAP) ---
  const [destroyTarget, setDestroyTarget] = useState<ExpiredBatch | null>(null);
  const [showDestroyDialog, setShowDestroyDialog] = useState(false);
  const [destroyQty, setDestroyQty] = useState(0);
  const [destroyNotes, setDestroyNotes] = useState('');
  const [savingDestroy, setSavingDestroy] = useState(false);

  const handleMusnahkan = (batch: ExpiredBatch) => {
    setDestroyTarget(batch);
    setDestroyQty(batch.qty_on_hand);
    setDestroyNotes('');
    setShowDestroyDialog(true);
  };

  const confirmMusnahkan = async () => {
    if (!destroyTarget || !user) return;
    if (destroyQty < 1 || destroyQty > destroyTarget.qty_on_hand) {
      toast.error('Jumlah yang dimusnahkan tidak valid');
      return;
    }

    setSavingDestroy(true);
    try {
      const { data: bapNumber, error: bapErr } = await supabase.rpc('generate_bap_number');
      if (bapErr || !bapNumber) throw bapErr || new Error('Gagal generate nomor BAP');

      const { data: order, error: orderErr } = await supabase
        .from('destruction_orders')
        .insert({
          bap_number: bapNumber,
          destruction_date: new Date().toISOString().split('T')[0],
          notes: destroyNotes || null,
          created_by: user.id,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      const { error: itemErr } = await supabase.from('destruction_order_items').insert({
        destruction_order_id: order.id,
        batch_id: destroyTarget.id,
        product_id: destroyTarget.product_id,
        qty_to_destroy: destroyQty,
      });
      if (itemErr) throw itemErr;

      toast.success(`BAP ${bapNumber} berhasil dibuat. Menunggu approval Direktur.`);
      setShowDestroyDialog(false);
      setDestroyTarget(null);
      fetchExpiredBatches();
    } catch (err: any) {
      toast.error(err.message || 'Gagal membuat BAP');
    } finally {
      setSavingDestroy(false);
    }
  };

  const minExtendDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama Produk</TableHead>
            <TableHead>Kode</TableHead>
            <TableHead>Batch No</TableHead>
            <TableHead>Tgl Expired</TableHead>
            <TableHead className="text-center">Stok Tersisa</TableHead>
            {canManage && <TableHead className="text-right">Aksi</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          ) : batches.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">
                <PackageX className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Tidak ada barang expired
              </TableCell>
            </TableRow>
          ) : (
            batches.map((batch) => {
              const days = daysExpired(batch.expired_date);
              return (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">{batch.product_name}</TableCell>
                  <TableCell>{batch.product_sku || '-'}</TableCell>
                  <TableCell>{batch.batch_no}</TableCell>
                  <TableCell>
                    <Badge variant={days > 30 ? 'cancelled' : 'warning'}>
                      {formatDate(batch.expired_date)} ({days}h)
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{batch.qty_on_hand} {batch.unit_name || ''}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-400 hover:bg-blue-50"
                          onClick={() => handleExtend(batch)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Extend
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-400 hover:bg-red-50"
                          onClick={() => handleMusnahkan(batch)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Musnahkan
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Dialog Extend Expired */}
      <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Tanggal Expired</DialogTitle>
          </DialogHeader>
          {extendTarget && (
            <div className="space-y-4">
              <div className="text-sm bg-muted rounded-md p-3 space-y-1">
                <p className="font-medium">{extendTarget.product_name}</p>
                <p className="text-muted-foreground">Batch: {extendTarget.batch_no}</p>
                <p className="text-muted-foreground">Expired lama: {formatDate(extendTarget.expired_date)}</p>
              </div>
              <div className="space-y-2">
                <Label>Tanggal Expired Baru *</Label>
                <Input
                  type="date"
                  min={minExtendDate}
                  value={extendDate}
                  onChange={(e) => setExtendDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Alasan Perpanjangan *</Label>
                <Textarea
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="Alasan perpanjangan tanggal expired"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendDialog(false)}>
              Batal
            </Button>
            <Button onClick={confirmExtend} disabled={savingExtend}>
              {savingExtend && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Simpan Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Musnahkan (Buat BAP) */}
      <Dialog open={showDestroyDialog} onOpenChange={setShowDestroyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat BAP Pemusnahan</DialogTitle>
          </DialogHeader>
          {destroyTarget && (
            <div className="space-y-4">
              <div className="text-sm bg-muted rounded-md p-3 space-y-1">
                <p className="font-medium">{destroyTarget.product_name}</p>
                <p className="text-muted-foreground">Batch: {destroyTarget.batch_no}</p>
                <p className="text-muted-foreground">Stok tersisa: {destroyTarget.qty_on_hand} {destroyTarget.unit_name || ''}</p>
              </div>
              <div className="space-y-2">
                <Label>Jumlah yang Dimusnahkan *</Label>
                <Input
                  type="number"
                  min={1}
                  max={destroyTarget.qty_on_hand}
                  value={destroyQty}
                  onChange={(e) => setDestroyQty(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Catatan</Label>
                <Textarea
                  value={destroyNotes}
                  onChange={(e) => setDestroyNotes(e.target.value)}
                  placeholder="Catatan tambahan (opsional)"
                />
              </div>
              <Alert className="bg-warning/10 border-warning">
                <AlertDescription className="text-warning text-xs">
                  BAP akan dikirim ke Direktur untuk approval. Stok belum berkurang sampai disetujui.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDestroyDialog(false)}>
              Batal
            </Button>
            <Button onClick={confirmMusnahkan} disabled={savingDestroy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {savingDestroy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Buat BAP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
