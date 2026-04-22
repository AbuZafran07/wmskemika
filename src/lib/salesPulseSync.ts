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

/**
 * Sanitasi reference_number Sales Pulse.
 * Format wajib: REF-XXXX (case-insensitive, dinormalisasi ke uppercase).
 * Hanya karakter alfanumerik dan tanda hubung yang diizinkan.
 * Mengembalikan null jika tidak valid (caller harus skip sync jika null).
 */
export function sanitizeSalesPulseReference(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Z0-9-]/g, '');
  if (!cleaned.startsWith('REF-')) return null;
  if (cleaned.length <= 4) return null;
  return cleaned;
}

/**
 * Validasi format reference_number Sales Pulse tanpa modifikasi.
 */
export function isValidSalesPulseReference(value: string | null | undefined): boolean {
  return sanitizeSalesPulseReference(value) !== null;
}

/**
 * Retry helper untuk panggilan sync ke Sales Pulse.
 * Hanya retry pada error transient (network/timeout/5xx). Error 4xx tidak di-retry.
 * Default: 3 attempt total dengan exponential backoff (500ms, 1500ms).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelay = options.baseDelayMs ?? 500;
  const label = options.label ?? 'sales-pulse-sync';
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isTransient =
        /network|fetch|timeout|503|502|504|temporarily|ECONNRESET|ETIMEDOUT/i.test(message);

      if (!isTransient || attempt === retries) {
        if (attempt > 0) {
          console.warn(`[${label}] Gagal setelah ${attempt + 1} attempt:`, message);
        }
        throw err;
      }

      const delay = baseDelay * Math.pow(3, attempt);
      console.warn(
        `[${label}] Attempt ${attempt + 1} gagal (transient), retry dalam ${delay}ms:`,
        message,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
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
  const referenceNumber = sanitizeSalesPulseReference(payload.reference_number);
  if (!referenceNumber) {
    throw new Error(`Invalid Sales Pulse reference number: "${payload.reference_number}". Format harus REF-XXXX.`);
  }

  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
      body: {
        action: 'wms-so-approved',
        ...payload,
        reference_number: referenceNumber,
        customer_po: sanitizeCustomerPoNumber(payload.customer_po),
      },
    });
    if (error) throw error;
    return data;
  }, { label: 'sales-pulse-approved' });
}

export async function syncSalesOrderUpdatedToSalesPulse(payload: SyncUpdatedSalesOrderPayload) {
  const referenceNumber = payload.reference_number != null
    ? sanitizeSalesPulseReference(payload.reference_number)
    : null;
  if (payload.reference_number != null && !referenceNumber) {
    throw new Error(`Invalid Sales Pulse reference number: "${payload.reference_number}". Format harus REF-XXXX.`);
  }

  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
      body: {
        action: 'wms-so-updated',
        ...payload,
        reference_number: referenceNumber ?? payload.reference_number ?? null,
        customer_po: sanitizeCustomerPoNumber(payload.customer_po),
      },
    });
    if (error) throw error;
    return data;
  }, { label: 'sales-pulse-updated' });
}

export async function syncSalesOrderCancelledToSalesPulse(payload: SyncCancelledSalesOrderPayload) {
  const referenceNumber = payload.reference_number != null
    ? sanitizeSalesPulseReference(payload.reference_number)
    : null;
  if (payload.reference_number != null && !referenceNumber) {
    throw new Error(`Invalid Sales Pulse reference number: "${payload.reference_number}". Format harus REF-XXXX.`);
  }

  return withRetry(async () => {
    const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
      body: {
        action: 'wms-so-cancelled',
        ...payload,
        reference_number: referenceNumber ?? payload.reference_number ?? null,
      },
    });
    if (error) throw error;
    return data;
  }, { label: 'sales-pulse-cancelled' });
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
