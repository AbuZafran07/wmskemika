import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getUserFriendlyError, ErrorMessages } from '@/lib/errorHandler';

export interface StockAdjustmentHeader {
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  reason: string;
  attachment_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  created_by: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface StockAdjustmentItem {
  id: string;
  adjustment_id: string;
  product_id: string;
  batch_id: string;
  adjustment_qty: number;
  notes: string | null;
  new_expired_date?: string | null;
  new_batch_no?: string | null;
  product?: {
    id: string;
    name: string;
    sku: string | null;
    category?: { name: string };
    unit?: { name: string };
  };
  batch?: {
    id: string;
    batch_no: string;
    qty_on_hand: number;
    expired_date: string | null;
  };
}

export function useStockAdjustments() {
  const [adjustments, setAdjustments] = useState<StockAdjustmentHeader[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_adjustments')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('stock adjustments')));
    } else {
      setAdjustments(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdjustments();

    // Realtime subscription for stock adjustments
    const channel = supabase
      .channel('stock-adjustments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_adjustments' }, () => {
        fetchAdjustments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAdjustments]);

  return { adjustments, loading, refetch: fetchAdjustments };
}

export function useStockAdjustmentItems(adjustmentId: string | null) {
  const [items, setItems] = useState<StockAdjustmentItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!adjustmentId) {
      setItems([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('stock_adjustment_items')
      .select(`
        *,
        product:products(
          id, name, sku,
          category:categories(name),
          unit:units(name)
        ),
        batch:inventory_batches(id, batch_no, qty_on_hand, expired_date)
      `)
      .eq('adjustment_id', adjustmentId);

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('items')));
    } else {
      setItems((data || []) as StockAdjustmentItem[]);
    }
    setLoading(false);
  }, [adjustmentId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, refetch: fetchItems };
}

export function useInventoryBatches(productId: string | null) {
  const [batches, setBatches] = useState<Array<{
    id: string;
    batch_no: string;
    qty_on_hand: number;
    expired_date: string | null;
    product_id: string;
  }>>([]);
  const [loading, setLoading] = useState(false);

  const fetchBatches = useCallback(async () => {
    if (!productId) {
      setBatches([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('qty_on_hand', 0)
      .order('expired_date', { ascending: true });

    if (error) {
      console.error('Failed to load batches:', error);
    } else {
      setBatches(data || []);
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  return { batches, loading, refetch: fetchBatches };
}

// Fetch all batches for multiple products (for edit mode)
export function useAllBatches() {
  const [batches, setBatches] = useState<Array<{
    id: string;
    batch_no: string;
    qty_on_hand: number;
    expired_date: string | null;
    product_id: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from('inventory_batches')
        .select('*')
        .order('batch_no');

      if (!error) {
        setBatches(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  return { batches, loading };
}

// Create Stock Adjustment using RPC
export async function createStockAdjustment(
  header: {
    adjustment_number: string;
    adjustment_date: string;
    reason: string;
    attachment_url?: string | null;
  },
  items: Array<{
    product_id: string;
    batch_id: string;
    adjustment_qty: number;
    notes?: string;
    new_expired_date?: string | null;
  }>,
  attachmentMeta?: {
    file_key: string;
    url: string;
    mime_type?: string;
    file_size?: number;
  }
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const { data, error } = await supabase.rpc('stock_adjustment_create', {
      header_data: {
        adjustment_number: header.adjustment_number,
        adjustment_date: header.adjustment_date,
        reason: header.reason,
        attachment_url: header.attachment_url || '',
        status: 'draft',
      },
      items_data: items.map(item => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes || '',
        new_expired_date: item.new_expired_date || null,
      })),
      attachment_meta: attachmentMeta || null,
    });

    if (error) throw error;

    const result = data as { success: boolean; error?: string; id?: string };
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to create adjustment' };
    }

    return { success: true, id: result.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create adjustment';
    return { success: false, error: message };
  }
}

// Update Stock Adjustment using RPC
export async function updateStockAdjustment(
  adjustmentId: string,
  header: {
    adjustment_number?: string;
    adjustment_date?: string;
    reason?: string;
    attachment_url?: string | null;
  },
  items: Array<{
    product_id: string;
    batch_id: string;
    adjustment_qty: number;
    notes?: string;
    new_expired_date?: string | null;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('stock_adjustment_update', {
      adjustment_id: adjustmentId,
      header_data: {
        adjustment_number: header.adjustment_number,
        adjustment_date: header.adjustment_date,
        reason: header.reason,
        attachment_url: header.attachment_url || '',
      },
      items_data: items.map(item => ({
        product_id: item.product_id,
        batch_id: item.batch_id,
        adjustment_qty: item.adjustment_qty,
        notes: item.notes || '',
        new_expired_date: item.new_expired_date || null,
      })),
    });

    if (error) throw error;

    const result = data as { success: boolean; error?: string };
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update adjustment';
    return { success: false, error: message };
  }
}

// Approve (post) Stock Adjustment using RPC
export async function approveStockAdjustment(adjustmentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('stock_adjustment_approve', { p_adjustment_id: adjustmentId });
    
    if (error) throw error;
    
    return data as { success: boolean; error?: string };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve adjustment';
    return { success: false, error: message };
  }
}

// Reject Stock Adjustment using RPC
export async function rejectStockAdjustment(adjustmentId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('stock_adjustment_reject', { 
      p_adjustment_id: adjustmentId,
      reject_reason: reason || null
    });
    
    if (error) throw error;
    
    return data as { success: boolean; error?: string };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reject adjustment';
    return { success: false, error: message };
  }
}

// Soft Delete Stock Adjustment using RPC
export async function deleteStockAdjustment(adjustmentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('stock_adjustment_soft_delete', { p_adjustment_id: adjustmentId });
    
    if (error) throw error;
    
    return data as { success: boolean; error?: string };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete adjustment';
    return { success: false, error: message };
  }
}
