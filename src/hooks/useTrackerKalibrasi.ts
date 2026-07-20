import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type KalibrasiV2Column =
  | 'scheduled'
  | 'instrument_received'
  | 'calibration_in_progress'
  | 'completed'
  | 'invoiced'
  | 'rejected';

export interface KalibrasiV2Checklist {
  id: string;
  sales_order_id: string;
  checklist_key: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

export interface KalibrasiV2Card {
  id: string;
  receipt_number: string;
  spk_number: string | null;
  customer_po_number: string | null;
  received_date: string;
  target_completion_date: string | null;
  status: string;
  archived: boolean;
  service_pic_name: string | null;
  customer: { name: string; code: string } | null;
  instruments: { id: string; instrument_name: string; unit_price: number }[];
  // Optional legacy fields used by TrackerKalibrasiCardDetail
  sales_order_number?: string | null;
  order_date?: string | null;
  sales_name?: string | null;
  service_location?: string | null;
  service_pic_phone?: string | null;
  grand_total?: number | null;
  notes?: string | null;
}

export const COLUMN_DEFS: {
  id: KalibrasiV2Column;
  label: string;
  desc: string;
  color: string;
}[] = [
  { id: 'scheduled',              label: 'Scheduled',              desc: 'SPK diterbitkan, menunggu alat',       color: 'bg-slate-500'  },
  { id: 'instrument_received',    label: 'Instrument Received',    desc: 'Alat diterima di lab',                 color: 'bg-cyan-600'   },
  { id: 'calibration_in_progress',label: 'Calibration In Progress',desc: 'Cek fisik & proses kalibrasi',         color: 'bg-blue-600'   },
  { id: 'completed',              label: 'Completed',              desc: 'Sertifikat terbit, invoice terkirim',  color: 'bg-purple-600' },
  { id: 'invoiced',               label: 'Invoiced',               desc: 'Menunggu pembayaran & retur alat',     color: 'bg-orange-600' },
  { id: 'rejected',               label: 'Rejected',               desc: 'Kalibrasi dibatalkan / ditolak',       color: 'bg-red-600'    },
];

export const COLUMN_CHECKLISTS: Record<KalibrasiV2Column, { key: string; label: string }[]> = {
  scheduled: [
    { key: 'instrument_received',  label: 'Receive Instrument' },
  ],
  instrument_received: [
    { key: 'spk_issued',           label: 'SPK Issued' },
  ],
  calibration_in_progress: [
    { key: 'physical_check',       label: 'Cek fisik alat selesai' },
    { key: 'calibration_done',     label: 'Semua alat selesai dikalibrasi' },
  ],
  completed: [
    { key: 'certificate_issued',   label: 'Sertifikat diterbitkan' },
    { key: 'invoice_sent',         label: 'Invoice dikirim ke customer' },
  ],
  invoiced: [
    { key: 'payment_received',     label: 'Pembayaran diterima' },
    { key: 'tools_returned',       label: 'Alat dikembalikan ke customer' },
  ],
  rejected: [],
};

export const CHECKLIST_TOGGLE_ROLES = ['super_admin', 'admin', 'warehouse', 'purchasing'];

// Legacy aliases used by TrackerKalibrasiCardDetail
export type KalibrasiCard = KalibrasiV2Card;
export type KalibrasiChecklist = KalibrasiV2Checklist;
export type KalibrasiColumn = KalibrasiV2Column;
export const KALIBRASI_COLUMN_CHECKLISTS = COLUMN_CHECKLISTS;
export const KALIBRASI_CHECKLIST_LABELS: Record<string, string> = Object.values(
  COLUMN_CHECKLISTS,
).flat().reduce((acc, cur) => {
  acc[cur.key] = cur.label;
  return acc;
}, {} as Record<string, string>);

export function computeKalibrasiColumn(
  checklists: KalibrasiV2Checklist[],
  status?: string | null,
): KalibrasiV2Column {
  if (status === 'rejected' || status === 'cancelled') return 'rejected';
  const ok = (key: string) => checklists.some((c) => c.checklist_key === key && c.is_checked);
  if (!ok('instrument_received')) return 'scheduled';
  if (!ok('spk_issued')) return 'instrument_received';
  if (!ok('physical_check') || !ok('calibration_done')) return 'calibration_in_progress';
  if (!ok('certificate_issued') || !ok('invoice_sent')) return 'completed';
  if (!ok('payment_received') || !ok('tools_returned')) return 'invoiced';
  return 'invoiced';
}

export function useTrackerKalibrasi() {
  const { user } = useAuth();
  const role = user?.role;
  const [cards, setCards] = useState<KalibrasiV2Card[]>([]);
  const [checklists, setChecklists] = useState<Record<string, KalibrasiV2Checklist[]>>({});
  const [loading, setLoading] = useState(true);

  const canToggle = CHECKLIST_TOGGLE_ROLES.includes(role || '');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, error: soError } = await (supabase as any)
        .from('sales_order_headers')
        .select(`
          id, sales_order_number, spk_number, customer_po_number, order_date, target_completion_date,
          calibration_status, status, service_pic_name, service_location,
          service_pic_phone, calibration_received_at, sales_name, grand_total,
          notes, customer_request_notes,
          customer:customers(name),
          items:sales_order_items(id, item_type, instrument_name, description, unit_price)
        `)
        .eq('order_type', 'calibration')
        .eq('is_deleted', false)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (soError) throw soError;

      const list: KalibrasiV2Card[] = (rows || []).map((r: Record<string, any>) => ({
        id: r.id,
        receipt_number: r.sales_order_number ?? '-',
        spk_number: r.spk_number ?? null,
        customer_po_number: r.customer_po_number ?? null,
        received_date:
          (r.calibration_received_at ? String(r.calibration_received_at).slice(0, 10) : null) ??
          r.order_date ?? '',
        target_completion_date: r.target_completion_date ?? null,
        status: r.calibration_status ?? r.status ?? 'draft',
        archived: false,
        service_pic_name: r.service_pic_name ?? null,
        customer: r.customer ? { name: r.customer.name, code: r.customer.code } : null,
        instruments: (r.items ?? [])
          .filter((it: any) => it.item_type === 'calibration')
          .map((it: any) => ({
            id: it.id,
            instrument_name: it.instrument_name ?? it.description ?? '-',
            unit_price: Number(it.unit_price ?? 0),
          })),
        sales_order_number: r.sales_order_number ?? null,
        order_date: r.order_date ?? null,
        sales_name: r.sales_name ?? null,
        service_location: r.service_location ?? null,
        service_pic_phone: r.service_pic_phone ?? null,
        grand_total: r.grand_total ?? null,
        notes: r.notes ?? r.customer_request_notes ?? null,
      }));

      setCards(list);

      if (list.length === 0) {
        setChecklists({});
        setLoading(false);
        return;
      }

      const ids = list.map((c) => c.id);
      const { data: chkData, error: chkError } = await (supabase as any)
        .from('calibration_tracker_checklists')
        .select('*')
        .in('sales_order_id', ids);

      if (chkError) throw chkError;

      const grouped: Record<string, KalibrasiV2Checklist[]> = {};
      for (const c of (chkData || []) as KalibrasiV2Checklist[]) {
        if (!grouped[c.sales_order_id]) grouped[c.sales_order_id] = [];
        grouped[c.sales_order_id].push(c);
      }
      setChecklists(grouped);
    } catch (err) {
      console.error('[TrackerKalibrasi] fetch error:', err);
      toast.error('Gagal memuat tracker kalibrasi');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const ch1 = supabase
      .channel('kal-v2-so-headers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_headers' }, fetchData)
      .subscribe();

    const ch2 = supabase
      .channel('kal-v2-checklists')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calibration_tracker_checklists' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [fetchData]);

  const getColumnCards = useCallback(
    (col: KalibrasiV2Column): KalibrasiV2Card[] =>
      cards.filter((card) => computeKalibrasiColumn(checklists[card.id] || [], card.status) === col),
    [cards, checklists],
  );

  const getCardColumn = useCallback(
    (cardId: string): KalibrasiV2Column => {
      const card = cards.find((c) => c.id === cardId);
      return computeKalibrasiColumn(checklists[cardId] || [], card?.status);
    },
    [cards, checklists],
  );

  const toggleChecklist = useCallback(
    async (receiptId: string, checklistKey: string) => {
      if (!user?.id || !canToggle) return;

      const existing = (checklists[receiptId] || []).find(
        (c) => c.checklist_key === checklistKey,
      );
      const newValue = existing ? !existing.is_checked : true;

      // Optimistic update
      setChecklists((prev) => {
        const current = prev[receiptId] || [];
        if (existing) {
          return {
            ...prev,
            [receiptId]: current.map((c) =>
              c.checklist_key === checklistKey
                ? { ...c, is_checked: newValue, checked_by: newValue ? user.id : null }
                : c,
            ),
          };
        }
        return {
          ...prev,
          [receiptId]: [
            ...current,
            {
              id: `temp-${checklistKey}`,
              sales_order_id: receiptId,
              checklist_key: checklistKey,
              is_checked: true,
              checked_by: user.id,
              checked_at: new Date().toISOString(),
            },
          ],
        };
      });

      try {
        if (existing) {
          await (supabase as any)
            .from('calibration_tracker_checklists')
            .update({
              is_checked: newValue,
              checked_by: newValue ? user.id : null,
              checked_at: newValue ? new Date().toISOString() : null,
            })
            .eq('id', existing.id);
        } else {
          await (supabase as any).from('calibration_tracker_checklists').insert({
            sales_order_id: receiptId,
            checklist_key: checklistKey,
            is_checked: true,
            checked_by: user.id,
            checked_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('toggleChecklist error:', err);
        toast.error('Gagal update checklist');
        fetchData();
      }
    },
    [user, canToggle, checklists, fetchData],
  );

  return {
    cards,
    checklists,
    loading,
    canToggle,
    getColumnCards,
    getCardColumn,
    toggleChecklist,
    refetch: fetchData,
  };
}
