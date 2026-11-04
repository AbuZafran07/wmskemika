import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Eye, Printer, Loader2, FileX2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { DestructionOrderPdf, DestructionOrderData } from './DestructionOrderPdf';

interface BapRow {
  id: string;
  bap_number: string;
  status: 'pending' | 'approved' | 'rejected';
  destruction_date: string;
  notes: string | null;
  rejected_reason: string | null;
  created_at: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  items: {
    id: string;
    qty_to_destroy: number;
    product_name: string;
    product_sku: string | null;
    unit_name: string | null;
    batch_no: string;
    expired_date: string | null;
  }[];
}

const APPROVE_ROLES = ['super_admin', 'admin'];

const statusConfig: Record<string, { label: string; variant: 'pending' | 'success' | 'cancelled' }> = {
  pending: { label: 'Menunggu Approval', variant: 'pending' },
  approved: { label: 'Disetujui', variant: 'success' },
  rejected: { label: 'Ditolak', variant: 'cancelled' },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DestructionOrdersTab() {
  const { user } = useAuth();
  const canApprove = !!user?.role && APPROVE_ROLES.includes(user.role);

  const [bapList, setBapList] = useState<BapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const fetchBapList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('destruction_orders')
      .select(`
        id, bap_number, status, destruction_date, notes, rejected_reason,
        created_at, created_by, approved_by, approved_at,
        destruction_order_items(
          id, qty_to_destroy,
          products!product_id(name, sku, units(name)),
          inventory_batches!batch_id(batch_no, expired_date)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching destruction orders:', error);
      toast.error('Gagal memuat Riwayat BAP');
      setLoading(false);
      return;
    }

    const mapped: BapRow[] = (data || []).map((bap: any) => ({
      id: bap.id,
      bap_number: bap.bap_number,
      status: bap.status,
      destruction_date: bap.destruction_date,
      notes: bap.notes,
      rejected_reason: bap.rejected_reason,
      created_at: bap.created_at,
      created_by: bap.created_by,
      approved_by: bap.approved_by,
      approved_at: bap.approved_at,
      items: (bap.destruction_order_items || []).map((it: any) => ({
        id: it.id,
        qty_to_destroy: it.qty_to_destroy,
        product_name: it.products?.name || '-',
        product_sku: it.products?.sku || null,
        unit_name: it.products?.units?.name || null,
        batch_no: it.inventory_batches?.batch_no || '-',
        expired_date: it.inventory_batches?.expired_date || null,
      })),
    }));
    setBapList(mapped);

    // Resolve creator/approver names (profiles has no direct FK embed from destruction_orders)
    const userIds = Array.from(
      new Set(mapped.flatMap((b) => [b.created_by, b.approved_by].filter(Boolean) as string[]))
    );
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.full_name || '-'; });
      setProfileNames(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBapList();
  }, [fetchBapList]);

  // --- Approve / Reject ---
  const [approveTarget, setApproveTarget] = useState<BapRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<BapRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setProcessing(true);
    const { error } = await supabase.rpc('approve_destruction_order', {
      p_destruction_order_id: approveTarget.id,
    });
    setProcessing(false);

    if (error) {
      toast.error(error.message || 'Gagal menyetujui BAP');
      return;
    }
    toast.success(`BAP ${approveTarget.bap_number} disetujui. Stok sudah dikurangi.`);
    setApproveTarget(null);
    fetchBapList();
  };

  const confirmReject = async () => {
    if (!rejectTarget || rejectReason.trim().length < 5) {
      toast.error('Alasan penolakan wajib diisi');
      return;
    }
    setProcessing(true);
    const { error } = await supabase.rpc('reject_destruction_order', {
      p_destruction_order_id: rejectTarget.id,
      p_reason: rejectReason.trim(),
    });
    setProcessing(false);

    if (error) {
      toast.error(error.message || 'Gagal menolak BAP');
      return;
    }
    toast.success(`BAP ${rejectTarget.bap_number} ditolak.`);
    setRejectTarget(null);
    setRejectReason('');
    fetchBapList();
  };

  // --- Detail / Print ---
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfData, setPdfData] = useState<DestructionOrderData | null>(null);

  const handleViewDetail = (bap: BapRow) => {
    setPdfData({
      id: bap.id,
      bap_number: bap.bap_number,
      status: bap.status,
      destruction_date: bap.destruction_date,
      notes: bap.notes,
      created_by_name: profileNames[bap.created_by] || null,
      approved_by_name: bap.approved_by ? profileNames[bap.approved_by] || null : null,
      approved_at: bap.approved_at,
      items: bap.items.map((it) => ({
        id: it.id,
        product_name: it.product_name,
        product_sku: it.product_sku,
        batch_no: it.batch_no,
        expired_date: it.expired_date,
        qty_to_destroy: it.qty_to_destroy,
        unit_name: it.unit_name,
      })),
    });
    setPdfOpen(true);
  };

  const productSummary = (bap: BapRow) => {
    if (bap.items.length === 0) return '-';
    const first = bap.items[0].product_name;
    return bap.items.length > 1 ? `${first} +${bap.items.length - 1} lainnya` : first;
  };

  const totalQty = (bap: BapRow) => bap.items.reduce((sum, it) => sum + it.qty_to_destroy, 0);

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>No BAP</TableHead>
            <TableHead>Tgl Buat</TableHead>
            <TableHead>Produk</TableHead>
            <TableHead className="text-center">Jml Musnahkan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          ) : bapList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                <FileX2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Belum ada BAP
              </TableCell>
            </TableRow>
          ) : (
            bapList.map((bap) => {
              const config = statusConfig[bap.status];
              return (
                <TableRow key={bap.id}>
                  <TableCell className="font-mono font-medium">{bap.bap_number}</TableCell>
                  <TableCell>{formatDate(bap.created_at)}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{productSummary(bap)}</TableCell>
                  <TableCell className="text-center">{totalQty(bap)}</TableCell>
                  <TableCell>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetail(bap)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Lihat Detail
                        </DropdownMenuItem>
                        {bap.status === 'approved' && (
                          <DropdownMenuItem onClick={() => handleViewDetail(bap)}>
                            <Printer className="w-4 h-4 mr-2" />
                            Print BAP
                          </DropdownMenuItem>
                        )}
                        {canApprove && bap.status === 'pending' && (
                          <>
                            <DropdownMenuItem onClick={() => setApproveTarget(bap)}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setRejectTarget(bap)}>
                              <XCircle className="w-4 h-4 mr-2" />
                              Tolak
                            </DropdownMenuItem>
                          </>
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

      {/* Approve Confirm */}
      <AlertDialog open={!!approveTarget} onOpenChange={(v) => !v && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Setujui Pemusnahan?</AlertDialogTitle>
            <AlertDialogDescription>
              BAP {approveTarget?.bap_number} akan disetujui dan stok akan langsung dikurangi. Aksi ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApprove} disabled={processing}>
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(v) => { if (!v) { setRejectTarget(null); setRejectReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak Pemusnahan?</AlertDialogTitle>
            <AlertDialogDescription>Berikan alasan penolakan untuk BAP {rejectTarget?.bap_number}.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Alasan penolakan..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="my-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              disabled={processing || rejectReason.trim().length < 5}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Tolak
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DestructionOrderPdf open={pdfOpen} onOpenChange={setPdfOpen} data={pdfData} />
    </div>
  );
}
