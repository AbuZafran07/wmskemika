import { supabase } from '@/integrations/supabase/client';

/**
 * Sanitasi customer_po_number sebelum dikirim ke Sales Pulse.
 * Sesuai WMS Integration Guide v4: hanya karakter aman yang diizinkan.
 * Whitelist: A-Z a-z 0-9 spasi dan - _ . / \ # ( )
 * Tidak ada batas maksimum panjang (sesuai keputusan internal).
 * Mengembalikan null jika hasil akhir kosong.
 */
export function sanitizeCustomerPoNumber(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^A-Za-z0-9 \-_.\/\\#()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

export interface SalesPulseReference {
  deal_id: string;
  reference_number: string;
  deal_name: string;
  customer_name: string;
  customer_code: string | null;
  segment: string | null;
  stage: string;
  value: number;
  sales_name: string | null;
  already_synced: boolean;
  wms_so_number: string | null;
  wms_so_date: string | null;
  expected_close_date?: string | null;
}

interface ListOpenReferencesParams {
  search?: string;
  segment?: string;
  limit?: number;
  includeSelectedReference?: string | null;
}

interface SyncApprovedSalesOrderPayload {
  sales_order_id: string;
  reference_number: string;
  so_number: string;
  so_date: string;
  total_value: number;
  customer_name?: string | null;
  customer_po?: string | null;
  items?: Array<{
    sku?: string | null;
    product_name: string;
    category?: string | null;
    unit?: string | null;
    qty: number;
    price_per_unit: number;
    other_cost?: number | null;
  }>;
}

interface SyncUpdatedSalesOrderPayload {
  sales_order_id: string;
  so_number: string;
  reference_number?: string | null;
  so_date?: string | null;
  total_value?: number | null;
  customer_name?: string | null;
  customer_po?: string | null;
  items?: Array<{
    sku?: string | null;
    product_name: string;
    category?: string | null;
    unit?: string | null;
    qty: number;
    price_per_unit: number;
    other_cost?: number | null;
  }> | null;
}

interface SyncCancelledSalesOrderPayload {
  sales_order_id: string;
  so_number: string;
  reference_number?: string | null;
  cancelled_at?: string | null;
  reason?: string | null;
}

interface SyncCustomerPayload {
  code: string;
  name: string;
  customer_type?: string | null;
  pic_name?: string | null;
  pic_email?: string | null;
  pic_contact?: string | null;
  city?: string | null;
  region?: string | null;
  is_active?: boolean;
}

interface SyncProductPayload {
  sku: string;
  name: string;
  category_name?: string | null;
  unit?: string | null;
  purchase_price?: number | null;
  selling_price?: number | null;
  is_active?: boolean;
}

export async function listSalesPulseOpenReferences(params: ListOpenReferencesParams = {}) {
  const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
    body: {
      action: 'list-open-references',
      search: params.search || null,
      segment: params.segment || null,
      limit: params.limit ?? null,
      include_selected_reference: params.includeSelectedReference || null,
    },
  });

  if (error) throw error;
  return (data?.data || []) as SalesPulseReference[];
}

export async function syncSalesOrderApprovedToSalesPulse(payload: SyncApprovedSalesOrderPayload) {
  const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
    body: {
      action: 'wms-so-approved',
      ...payload,
    },
  });

  if (error) throw error;
  return data;
}

export async function syncCustomerToSalesPulse(payload: SyncCustomerPayload) {
  const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
    body: {
      action: 'wms-customer-upsert',
      ...payload,
    },
  });

  if (error) throw error;
  return data;
}

export async function syncProductToSalesPulse(payload: SyncProductPayload) {
  const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
    body: {
      action: 'wms-product-upsert',
      ...payload,
    },
  });

  if (error) throw error;
  return data;
}
