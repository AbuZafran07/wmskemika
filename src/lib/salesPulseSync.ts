import { supabase } from '@/integrations/supabase/client';

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
}

interface ListOpenReferencesParams {
  search?: string;
  segment?: string;
  limit?: number;
}

interface SyncApprovedSalesOrderPayload {
  sales_order_id: string;
  reference_number: string;
  so_number: string;
  so_date: string;
  total_value: number;
  customer_name?: string | null;
}

export async function listSalesPulseOpenReferences(params: ListOpenReferencesParams = {}) {
  const { data, error } = await supabase.functions.invoke('sales-pulse-sync', {
    body: {
      action: 'list-open-references',
      search: params.search || null,
      segment: params.segment || null,
      limit: params.limit ?? 50,
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
