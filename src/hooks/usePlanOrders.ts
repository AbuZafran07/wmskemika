import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PlanOrderHeader {
  id: string;
  plan_number: string;
  plan_date: string;
  supplier_id: string;
  expected_delivery_date: string | null;
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
  supplier?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface PlanOrderItem {
  id: string;
  plan_order_id: string;
  product_id: string;
  unit_price: number;
  planned_qty: number;
  qty_received: number;
  qty_remaining: number;
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

export function usePlanOrders() {
  const [planOrders, setPlanOrders] = useState<PlanOrderHeader[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlanOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plan_order_headers')
      .select(`
        *,
        supplier:suppliers(id, name, code)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load plan orders');
      console.error(error);
    } else {
      setPlanOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPlanOrders();
  }, []);

  return { planOrders, loading, refetch: fetchPlanOrders };
}

export function usePlanOrderItems(planOrderId: string | null) {
  const [items, setItems] = useState<PlanOrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    if (!planOrderId) {
      setItems([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('plan_order_items')
      .select(`
        *,
        product:products(
          id, name, sku,
          category:categories(name),
          unit:units(name)
        )
      `)
      .eq('plan_order_id', planOrderId);

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
  }, [planOrderId]);

  return { items, loading, refetch: fetchItems };
}

export async function createPlanOrder(
  header: Omit<PlanOrderHeader, 'id' | 'created_at' | 'supplier'>,
  items: Array<{
    product_id: string;
    unit_price: number;
    planned_qty: number;
    notes?: string;
  }>
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    // Insert header
    const { data: headerData, error: headerError } = await supabase
      .from('plan_order_headers')
      .insert({
        plan_number: header.plan_number,
        plan_date: header.plan_date,
        supplier_id: header.supplier_id,
        expected_delivery_date: header.expected_delivery_date,
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
      plan_order_id: headerData.id,
      product_id: item.product_id,
      unit_price: item.unit_price,
      planned_qty: item.planned_qty,
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabase
      .from('plan_order_items')
      .insert(itemsToInsert);

    if (itemsError) throw itemsError;

    return { success: true, id: headerData.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create plan order';
    return { success: false, error: message };
  }
}

export async function updatePlanOrderStatus(
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
      .from('plan_order_headers')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update status';
    return { success: false, error: message };
  }
}
