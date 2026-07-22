import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { generateUniqueKALNumber } from '@/lib/transactionNumberUtils';

const DEFAULT_SERVICE_LOCATION = 'Lab Kemika, Tangerang';

function toISODate(v: string | null | undefined): string | null {
  if (!v) return null;
  // Accept already-ISO date; otherwise return as-is
  return v;
}

export interface CalibrationInstrumentInput {
  instrument_name: string;
  brand_model: string;
  serial_number: string;
  measurement_range: string;
  calibration_method: string;
  unit_price: number;
  sla_working_days: number;
}

export interface CalibrationReceiptRow {
  id: string;
  receipt_number: string;
  spk_number: string | null;
  sales_pulse_reference_number: string | null;
  status: 'draft' | 'spk_issued' | 'spk_signed' | 'converted_to_so' | 'cancelled';
  customer_id: string;
  customer: { id: string; name: string; pic: string | null; phone: string | null } | null;
  service_pic_name: string | null;
  service_pic_phone: string | null;
  service_location: string | null;
  received_date: string;
  target_completion_date: string | null;
  customer_request_notes: string | null;
  sales_order_id: string | null;
  archived: boolean;
  created_at: string;
  instruments: { id: string; instrument_name: string; unit_price: number }[];
}

export function useCalibrationReceipts() {
  const [receipts, setReceipts] = useState<CalibrationReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReceipts = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('sales_order_headers')
      .select(`
        id, sales_order_number, spk_number, status, calibration_status,
        sales_pulse_reference_number,
        customer_id, service_pic_name, service_pic_phone, service_location,
        calibration_received_at, order_date, target_completion_date,
        customer_request_notes, created_at,
        customer:customers(id, name, pic, phone),
        items:sales_order_items(id, item_type, instrument_name, description, unit_price)
      `)
      .eq('order_type', 'calibration')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Gagal memuat data penerimaan kalibrasi');
    } else {
      const rows: CalibrationReceiptRow[] = (data || []).map((r: Record<string, any>) => ({
        id: r.id,
        receipt_number: r.sales_order_number ?? '-',
        spk_number: r.spk_number ?? null,
        sales_pulse_reference_number: r.sales_pulse_reference_number ?? null,
        status: (r.calibration_status ?? r.status ?? 'draft') as CalibrationReceiptRow['status'],
        customer_id: r.customer_id,
        customer: r.customer ?? null,
        service_pic_name: r.service_pic_name ?? null,
        service_pic_phone: r.service_pic_phone ?? null,
        service_location: r.service_location ?? null,
        received_date: r.calibration_received_at
          ? String(r.calibration_received_at).slice(0, 10)
          : r.order_date,
        target_completion_date: r.target_completion_date ?? null,
        customer_request_notes: r.customer_request_notes ?? null,
        sales_order_id: r.id,
        archived: false,
        created_at: r.created_at,
        instruments: (r.items ?? [])
          .filter((it: any) => it.item_type === 'calibration')
          .map((it: any) => ({
            id: it.id,
            instrument_name: it.instrument_name ?? it.description ?? '-',
            unit_price: Number(it.unit_price ?? 0),
          })),
      }));
      setReceipts(rows);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReceipts();

    const channel = supabase
      .channel('calibration_so_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_headers' }, fetchReceipts)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { receipts, loading, refetch: fetchReceipts };
}

export async function updateReceiptStatus(id: string, status: string) {
  const { error } = await (supabase as any)
    .from('sales_order_headers')
    .update({ calibration_status: status })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCalibrationReceipt(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Soft-delete the SO (draft only enforced by RPC/trigger elsewhere).
    const { error } = await (supabase as any)
      .from('sales_order_headers')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal menghapus';
    return { success: false, error: message };
  }
}

export async function updateCalibrationReceipt(
  id: string,
  header: {
    customer_id: string;
    service_pic_name: string;
    service_pic_phone: string;
    service_location: string;
    received_date: string;
    target_completion_date: string;
    customer_request_notes: string;
    sales_pulse_reference_number: string;
    allocation_type?: string;
    customer_po_number?: string | null;
  },
  instruments?: CalibrationInstrumentInput[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!header.sales_pulse_reference_number || !header.sales_pulse_reference_number.trim()) {
      return { success: false, error: 'Nomor Referensi SalesPulse wajib diisi' };
    }
    const headerUpdate: Record<string, unknown> = {
      customer_id: header.customer_id,
      sales_pulse_reference_number: header.sales_pulse_reference_number.trim(),
      service_pic_name: header.service_pic_name || null,
      service_pic_phone: header.service_pic_phone || null,
      service_location: header.service_location || DEFAULT_SERVICE_LOCATION,
      calibration_received_at: toISODate(header.received_date),
      target_completion_date: header.target_completion_date || null,
      customer_request_notes: header.customer_request_notes || null,
      customer_po_number: header.customer_po_number || null,
      delivery_deadline: header.target_completion_date || header.received_date,
    };
    if (header.allocation_type) {
      headerUpdate.allocation_type = header.allocation_type;
    }
    if (instruments) {
      const grandTotal = instruments.reduce((s, i) => s + Number(i.unit_price || 0), 0);
      headerUpdate.total_amount = grandTotal;
      headerUpdate.grand_total = grandTotal;
    }
    const { error: updErr } = await (supabase as any)
      .from('sales_order_headers')
      .update(headerUpdate)
      .eq('id', id);
    if (updErr) throw updErr;

    if (!instruments) {
      return { success: true };
    }

    const { error: delErr } = await (supabase as any)
      .from('sales_order_items')
      .delete()
      .eq('sales_order_id', id)
      .eq('item_type', 'calibration');
    if (delErr) throw delErr;

    if (instruments.length > 0) {
      const rows = instruments.map((inst) => ({
        sales_order_id: id,
        item_type: 'calibration',
        product_id: null,
        ordered_qty: 1,
        unit_price: inst.unit_price,
        instrument_name: inst.instrument_name,
        instrument_brand_model: inst.brand_model || null,
        instrument_serial_number: inst.serial_number || null,
        measurement_range: inst.measurement_range || null,
        calibration_method: inst.calibration_method || null,
        sla_working_days: inst.sla_working_days || 5,
        description: inst.instrument_name,
      }));
      const { error: insErr } = await (supabase as any).from('sales_order_items').insert(rows);
      if (insErr) throw insErr;
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memperbarui';
    return { success: false, error: message };
  }
}

export async function createCalibrationReceipt(
  header: {
    customer_id: string;
    service_pic_name: string;
    service_pic_phone: string;
    service_location: string;
    received_date: string;
    target_completion_date: string;
    customer_request_notes: string;
    created_by: string | null;
    sales_pulse_reference_number: string;
    allocation_type?: string;
    customer_po_number?: string | null;
  },
  instruments: CalibrationInstrumentInput[]
): Promise<{ success: boolean; error?: string; id?: string; receipt_number?: string }> {
  try {
    if (!header.sales_pulse_reference_number || !header.sales_pulse_reference_number.trim()) {
      return { success: false, error: 'Nomor Referensi SalesPulse wajib diisi' };
    }
    const receipt_number = await generateUniqueKALNumber();
    const grandTotal = instruments.reduce((s, i) => s + Number(i.unit_price || 0), 0);

    // Fetch sales user name for sales_name (NOT NULL). Fallback to 'Kalibrasi'.
    let salesName = 'Kalibrasi';
    if (header.created_by) {
      const { data: prof } = await (supabase as any)
        .from('profiles')
        .select('full_name, email')
        .eq('id', header.created_by)
        .maybeSingle();
      salesName = prof?.full_name || prof?.email || 'Kalibrasi';
    }

    const { data, error } = await (supabase as any)
      .from('sales_order_headers')
      .insert({
        sales_order_number: receipt_number,
        order_type: 'calibration',
        status: 'draft',
        calibration_status: 'pending_receipt',
        customer_id: header.customer_id,
        sales_name: salesName,
        customer_po_number: header.customer_po_number ?? null,
        sales_pulse_reference_number: header.sales_pulse_reference_number.trim(),
        allocation_type: header.allocation_type || 'Internal',
        project_instansi: 'Kalibrasi',
        order_date: header.received_date,
        delivery_deadline: header.target_completion_date || header.received_date,
        service_pic_name: header.service_pic_name || null,
        service_pic_phone: header.service_pic_phone || null,
        service_location: header.service_location || DEFAULT_SERVICE_LOCATION,
        calibration_received_at: toISODate(header.received_date),
        target_completion_date: header.target_completion_date || null,
        customer_request_notes: header.customer_request_notes || null,
        total_amount: grandTotal,
        grand_total: grandTotal,
        created_by: header.created_by,
      })
      .select('id, sales_order_number')
      .single();

    if (error) throw error;
    const receiptId = (data as { id: string; sales_order_number: string }).id;
    const receiptNumber = (data as { id: string; sales_order_number: string }).sales_order_number;

    if (instruments.length > 0) {
      const rows = instruments.map((inst) => ({
        sales_order_id: receiptId,
        item_type: 'calibration',
        product_id: null,
        ordered_qty: 1,
        unit_price: inst.unit_price,
        instrument_name: inst.instrument_name,
        instrument_brand_model: inst.brand_model || null,
        instrument_serial_number: inst.serial_number || null,
        measurement_range: inst.measurement_range || null,
        calibration_method: inst.calibration_method || null,
        sla_working_days: inst.sla_working_days || 5,
        description: inst.instrument_name,
      }));
      const { error: instError } = await (supabase as any).from('sales_order_items').insert(rows);
      if (instError) throw instError;
    }

    return { success: true, id: receiptId, receipt_number: receiptNumber };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan penerimaan';
    return { success: false, error: message };
  }
}
