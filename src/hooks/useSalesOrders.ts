import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SalesOrderHeader {
  id: string;
  sales_order_number: string;
  order_date: string;
  customer_id: string;
  customer_po_number: string;
  sales_name: string;
  allocation_type: string;
  project_instansi: string;
  delivery_deadline: string;
  ship_to_address: string | null;
  notes: string | null;
  po_document_url: string | null;
  status: string;
  total_amount: number;
  discount: number;
  tax_rate: number;
  shipping_cost: number;
  grand_total: number;
  created_at: string;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  customer?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface SalesOrderItem {
  id: string;
  sales_order_id: string;
  product_id: string;
  unit_price: number;
  ordered_qty: number;
  qty_delivered: number;
  qty_remaining: number;
  discount: number;
  tax_rate: number;
  subtotal: number;
  notes: string | null;
  product?: {
    id: string;
    name: string;
    sku: string | null;
    category?: { name: string };
    unit?: { name: string };
  };
}

export interface InventoryBatch {
  id: string;
  product_id: string;
  batch_no: string;
  qty_on_hand: number;
  expired_date: string | null;
}

export function useSalesOrders() {
  const [salesOrders, setSalesOrders] = useState<SalesOrderHeader[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSalesOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales_order_headers')
      .select(`
        *,
        customer:customers(id, name, code)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load sales orders');
      console.error(error);
    } else {
      setSalesOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSalesOrders();
  }, []);

  return { salesOrders, loading, refetch: fetchSalesOrders };
}

export function useSalesOrderItems(salesOrderId: string | null) {
  const [items, setItems] = useState<SalesOrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    if (!salesOrderId) {
      setItems([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('sales_order_items')
      .select(`
        *,
        product:products(
          id, name, sku,
          category:categories(name),
          unit:units(name)
        )
      `)
      .eq('sales_order_id', salesOrderId);

    if (error) {
      toast.error('Failed to load items');
      console.error(error);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [salesOrderId]);

  return { items, loading, refetch: fetchItems };
}

export async function getProductStock(productId: string): Promise<number> {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('qty_on_hand')
    .eq('product_id', productId);

  if (error) {
    console.error(error);
    return 0;
  }

  return (data || []).reduce((sum, batch) => sum + batch.qty_on_hand, 0);
}

export async function getProductBatches(productId: string): Promise<InventoryBatch[]> {
  const { data, error } = await supabase
    .from('inventory_batches')
    .select('*')
    .eq('product_id', productId)
    .gt('qty_on_hand', 0)
    .order('expired_date', { ascending: true, nullsFirst: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

export async function createSalesOrder(
  header: Omit<SalesOrderHeader, 'id' | 'created_at' | 'customer'>,
  items: Array<{
    product_id: string;
    unit_price: number;
    ordered_qty: number;
    discount?: number;
    tax_rate?: number;
    notes?: string;
  }>
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    // Insert header
    const { data: headerData, error: headerError } = await supabase
      .from('sales_order_headers')
      .insert({
        sales_order_number: header.sales_order_number,
        order_date: header.order_date,
        customer_id: header.customer_id,
        customer_po_number: header.customer_po_number,
        sales_name: header.sales_name,
        allocation_type: header.allocation_type,
        project_instansi: header.project_instansi,
        delivery_deadline: header.delivery_deadline,
        ship_to_address: header.ship_to_address,
        notes: header.notes,
        po_document_url: header.po_document_url,
        status: header.status,
        total_amount: header.total_amount,
        discount: header.discount,
        tax_rate: header.tax_rate,
        shipping_cost: header.shipping_cost,
        grand_total: header.grand_total,
      })
      .select()
      .single();

    if (headerError) throw headerError;

    // Insert items
    const itemsToInsert = items.map(item => ({
      sales_order_id: headerData.id,
      product_id: item.product_id,
      unit_price: item.unit_price,
      ordered_qty: item.ordered_qty,
      discount: item.discount || 0,
      tax_rate: item.tax_rate || 0,
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabase
      .from('sales_order_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    return { success: true, id: headerData.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create sales order';
    return { success: false, error: message };
  }
}

export async function updateSalesOrderStatus(
  id: string, 
  status: string,
  approvedBy?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, unknown> = { status };
    
    if (status === 'approved' && approvedBy) {
      updateData.approved_by = approvedBy;
      updateData.approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('sales_order_headers')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update status';
    return { success: false, error: message };
  }
}
