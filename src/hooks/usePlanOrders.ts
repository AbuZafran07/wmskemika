import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getUserFriendlyError, ErrorMessages } from '@/lib/errorHandler';
import { 
  planOrderHeaderSchema, 
  planOrderItemsArraySchema, 
  validateData 
} from '@/lib/validationSchemas';

export interface PlanOrderHeader {
  id: string;
  plan_number: string;
  plan_date: string;
  supplier_id: string;
  expected_delivery_date: string | null;
  reference_no: string | null;
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
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
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

  const fetchPlanOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plan_order_headers')
      .select(`
        *,
        supplier:suppliers(id, name, code)
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('plan orders')));
    } else {
      setPlanOrders(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlanOrders();
  }, [fetchPlanOrders]);

  return { planOrders, loading, refetch: fetchPlanOrders };
}

export function usePlanOrderItems(planOrderId: string | null) {
  const [items, setItems] = useState<PlanOrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
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
      toast.error(getUserFriendlyError(error, ErrorMessages.load.error('items')));
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, [planOrderId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, refetch: fetchItems };
}

// Hook to fetch settings (allow_admin_approve)
export function useSettings() {
  const [allowAdminApprove, setAllowAdminApprove] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'allow_admin_approve')
        .single();
      
      if (data) {
        // Handle both boolean and string value formats
        let value = false;
        if (typeof data.value === 'boolean') {
          value = data.value;
        } else if (data.value === 'true') {
          value = true;
        } else if (typeof data.value === 'object' && data.value !== null && !Array.isArray(data.value)) {
          const objValue = data.value as Record<string, unknown>;
          value = objValue.value === true;
        }
        setAllowAdminApprove(value);
      }
      setLoading(false);
    };
    
    fetchSettings();
  }, []);

  return { allowAdminApprove, loading };
}

// Create Plan Order using RPC with audit logging
export async function createPlanOrder(
  header: Omit<PlanOrderHeader, 'id' | 'created_at' | 'supplier' | 'is_deleted' | 'deleted_at' | 'deleted_by'>,
  items: Array<{
    product_id: string;
    unit_price: number;
    planned_qty: number;
    notes?: string;
  }>,
  attachmentMeta?: {
    file_key: string;
    url: string;
    mime_type?: string;
    file_size?: number;
  }
): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    // Validate header data
    const headerValidation = validateData(planOrderHeaderSchema, header);
    if (headerValidation.success === false) {
      return { success: false, error: headerValidation.errors.join(', ') };
    }

    // Validate items data
    const itemsValidation = validateData(planOrderItemsArraySchema, items);
    if (itemsValidation.success === false) {
      return { success: false, error: itemsValidation.errors.join(', ') };
    }

    const validatedHeader = headerValidation.data;
    const validatedItems = itemsValidation.data;

    // Call RPC function
    const { data, error } = await supabase.rpc('plan_order_create', {
      header_data: {
        plan_number: validatedHeader.plan_number,
        plan_date: validatedHeader.plan_date,
        supplier_id: validatedHeader.supplier_id,
        expected_delivery_date: validatedHeader.expected_delivery_date || '',
        reference_no: (header as any).reference_no || '',
        notes: validatedHeader.notes || '',
        po_document_url: validatedHeader.po_document_url || '',
        status: validatedHeader.status,
        total_amount: validatedHeader.total_amount,
        discount: validatedHeader.discount,
        tax_rate: validatedHeader.tax_rate,
        shipping_cost: validatedHeader.shipping_cost,
        grand_total: validatedHeader.grand_total,
      },
      items_data: validatedItems.map(item => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        planned_qty: item.planned_qty,
        notes: item.notes || '',
      })),
      attachment_meta: attachmentMeta || null,
    });

    if (error) throw error;

    const result = data as { success: boolean; error?: string; id?: string };
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to create plan order' };
    }

    return { success: true, id: result.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create plan order';
    return { success: false, error: message };
  }
}

// Update Plan Order using RPC with audit logging
export async function updatePlanOrder(
  orderId: string,
  header: Partial<PlanOrderHeader>,
  items: Array<{
    product_id: string;
    unit_price: number;
    planned_qty: number;
    notes?: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('plan_order_update', {
      order_id: orderId,
      header_data: {
        plan_number: header.plan_number,
        plan_date: header.plan_date,
        supplier_id: header.supplier_id,
        expected_delivery_date: header.expected_delivery_date || '',
        reference_no: (header as any).reference_no || '',
        notes: header.notes || '',
        po_document_url: header.po_document_url || '',
        total_amount: header.total_amount,
        discount: header.discount,
        tax_rate: header.tax_rate,
        shipping_cost: header.shipping_cost,
        grand_total: header.grand_total,
      },
      items_data: items.map(item => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        planned_qty: item.planned_qty,
        notes: item.notes || '',
      })),
    });

    if (error) throw error;

    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to update plan order' };
    }

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update plan order';
    return { success: false, error: message };
  }
}

// Approve Plan Order using RPC
export async function approvePlanOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('plan_order_approve', { order_id: orderId });
    
    if (error) throw error;
    
    const result = data as { success: boolean; error?: string };
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to approve plan order';
    return { success: false, error: message };
  }
}

// Cancel Plan Order using RPC
export async function cancelPlanOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('plan_order_cancel', { order_id: orderId });
    
    if (error) throw error;
    
    const result = data as { success: boolean; error?: string };
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel plan order';
    return { success: false, error: message };
  }
}

// Soft Delete Plan Order using RPC
export async function deletePlanOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('plan_order_soft_delete', { order_id: orderId });
    
    if (error) throw error;
    
    const result = data as { success: boolean; error?: string };
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete plan order';
    return { success: false, error: message };
  }
}

// Legacy export for backward compatibility (deprecated - use RPC functions instead)
export async function updatePlanOrderStatus(
  id: string, 
  status: string,
  approvedBy?: string
): Promise<{ success: boolean; error?: string }> {
  if (status === 'approved') {
    return approvePlanOrder(id);
  }
  if (status === 'cancelled') {
    return cancelPlanOrder(id);
  }
  // Fallback for other status updates
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

// Insert attachment metadata and audit log for uploads
export async function logPlanOrderUpload(
  orderId: string,
  planNumber: string,
  attachment: {
    file_key: string;
    url: string;
    mime_type?: string;
    file_size?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    const userEmail = userData.user?.email;

    // Insert attachment metadata
    const { error: attachError } = await supabase
      .from('attachments')
      .insert({
        module_name: 'plan_order',
        ref_table: 'plan_order_headers',
        ref_id: orderId,
        file_key: attachment.file_key,
        url: attachment.url,
        mime_type: attachment.mime_type || null,
        file_size: attachment.file_size || null,
        uploaded_by: userId,
      });

    if (attachError) throw attachError;

    // Insert audit log for upload
    await supabase.from('audit_logs').insert({
      user_id: userId,
      user_email: userEmail,
      action: 'upload',
      module: 'plan_order',
      ref_table: 'plan_order_headers',
      ref_id: orderId,
      ref_no: planNumber,
      new_data: { attachment },
    });

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to log upload';
    return { success: false, error: message };
  }
}
