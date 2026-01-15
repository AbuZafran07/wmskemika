import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getUserFriendlyError, ErrorMessages } from '@/lib/errorHandler';
import { 
  salesOrderHeaderSchema, 
  salesOrderItemsArraySchema, 
  validateData 
} from '@/lib/validationSchemas';

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
    pic: string | null;
    phone: string | null;
    terms_payment: string | null;
    address: string | null;
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
        customer:customers(id, name, code, pic, phone, terms_payment, address)
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('sales orders')));
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
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('items')));
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
    // Validate header data
    const headerValidation = validateData(salesOrderHeaderSchema, header);
    if (headerValidation.success === false) {
      return { success: false, error: headerValidation.errors.join(', ') };
    }

    // Validate items data
    const itemsValidation = validateData(salesOrderItemsArraySchema, items);
    if (itemsValidation.success === false) {
      return { success: false, error: itemsValidation.errors.join(', ') };
    }

    const validatedHeader = headerValidation.data;
    const validatedItems = itemsValidation.data;

    // Use RPC function to handle insert (avoids generated column issues)
    const { data, error } = await supabase.rpc('sales_order_create', {
      header_data: {
        sales_order_number: validatedHeader.sales_order_number,
        order_date: validatedHeader.order_date,
        customer_id: validatedHeader.customer_id,
        customer_po_number: validatedHeader.customer_po_number,
        sales_name: validatedHeader.sales_name,
        allocation_type: validatedHeader.allocation_type,
        project_instansi: validatedHeader.project_instansi,
        delivery_deadline: validatedHeader.delivery_deadline,
        ship_to_address: validatedHeader.ship_to_address || null,
        notes: validatedHeader.notes || null,
        po_document_url: validatedHeader.po_document_url || null,
        status: validatedHeader.status || 'draft',
        total_amount: validatedHeader.total_amount || 0,
        discount: validatedHeader.discount || 0,
        tax_rate: validatedHeader.tax_rate || 0,
        shipping_cost: validatedHeader.shipping_cost || 0,
        grand_total: validatedHeader.grand_total || 0,
      },
      items_data: validatedItems.map(item => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        ordered_qty: item.ordered_qty,
        discount: item.discount || 0,
        notes: item.notes || null,
      })),
    });

    if (error) throw error;
    
    const result = data as { success: boolean; error?: string; id?: string };
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create sales order';
    return { success: false, error: message };
  }
}

export async function updateSalesOrder(
  orderId: string,
  header: Partial<SalesOrderHeader>,
  items: Array<{ product_id: string; unit_price: number; ordered_qty: number; discount?: number; }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_update', {
      order_id: orderId,
      header_data: header,
      items_data: items,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update';
    return { success: false, error: message };
  }
}

export async function approveSalesOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_approve', { order_id: orderId });
    if (error) throw error;
    return data as { success: boolean; error?: string };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to approve' };
  }
}

export async function cancelSalesOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_cancel', { order_id: orderId });
    if (error) throw error;
    return data as { success: boolean; error?: string };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to cancel' };
  }
}

export async function deleteSalesOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('sales_order_soft_delete', { order_id: orderId });
    if (error) throw error;
    return data as { success: boolean; error?: string };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete' };
  }
}
