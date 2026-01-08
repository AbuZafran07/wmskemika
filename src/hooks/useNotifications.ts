import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: string;
  type: 'low_stock' | 'expiring_soon' | 'expired' | 'info' | 'approval_pending' | 'approved' | 'cancelled' | 'new_order';
  title: string;
  message: string;
  productId?: string;
  productName?: string;
  batchNo?: string;
  module?: string;
  refId?: string;
  refNo?: string;
  createdAt: Date;
  read: boolean;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const notifs: Notification[] = [];
      const now = new Date();

      // Fetch products with low stock
      const { data: products } = await supabase
        .from('products')
        .select(`
          id, name, sku, min_stock,
          category:categories(name),
          unit:units(name)
        `)
        .is('deleted_at', null)
        .eq('is_active', true);

      // Fetch all inventory batches
      const { data: batches } = await supabase
        .from('inventory_batches')
        .select('id, product_id, batch_no, qty_on_hand, expired_date')
        .gt('qty_on_hand', 0);

      if (products && batches) {
        // Check for low stock
        products.forEach((product: any) => {
          const productBatches = batches.filter((b: any) => b.product_id === product.id);
          const totalStock = productBatches.reduce((sum: number, b: any) => sum + (b.qty_on_hand || 0), 0);
          
          if (totalStock > 0 && totalStock <= (product.min_stock || 0)) {
            notifs.push({
              id: `low_stock_${product.id}`,
              type: 'low_stock',
              title: 'Low Stock Alert',
              message: `${product.name} has only ${totalStock} units left (min: ${product.min_stock})`,
              productId: product.id,
              productName: product.name,
              createdAt: now,
              read: false,
            });
          }
        });

        // Check for expiring batches (within 30 days)
        batches.forEach((batch: any) => {
          if (!batch.expired_date) return;
          
          const expiryDate = new Date(batch.expired_date);
          const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          const product = products.find((p: any) => p.id === batch.product_id);
          if (!product) return;

          if (diffDays <= 0) {
            notifs.push({
              id: `expired_${batch.id}`,
              type: 'expired',
              title: 'Expired Batch',
              message: `${product.name} batch ${batch.batch_no} has expired`,
              productId: product.id,
              productName: product.name,
              batchNo: batch.batch_no,
              createdAt: now,
              read: false,
            });
          } else if (diffDays <= 30) {
            notifs.push({
              id: `expiring_${batch.id}`,
              type: 'expiring_soon',
              title: 'Expiring Soon',
              message: `${product.name} batch ${batch.batch_no} expires in ${diffDays} days`,
              productId: product.id,
              productName: product.name,
              batchNo: batch.batch_no,
              createdAt: now,
              read: false,
            });
          }
        });
      }

      // Fetch pending approval orders (Plan Orders, Sales Orders, Stock Adjustments)
      const { data: pendingPlanOrders } = await supabase
        .from('plan_order_headers')
        .select('id, plan_number, created_at, status, suppliers(name)')
        .eq('status', 'pending')
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: pendingSalesOrders } = await supabase
        .from('sales_order_headers')
        .select('id, sales_order_number, created_at, status, customers(name)')
        .eq('status', 'pending')
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: pendingAdjustments } = await supabase
        .from('stock_adjustments')
        .select('id, adjustment_number, created_at, status, reason')
        .eq('status', 'pending')
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(10);

      // Add approval pending notifications
      pendingPlanOrders?.forEach((order: any) => {
        notifs.push({
          id: `pending_po_${order.id}`,
          type: 'approval_pending',
          title: 'Plan Order Pending Approval',
          message: `${order.plan_number} from ${order.suppliers?.name || 'Unknown'} awaits approval`,
          module: 'plan_order',
          refId: order.id,
          refNo: order.plan_number,
          createdAt: new Date(order.created_at),
          read: false,
        });
      });

      pendingSalesOrders?.forEach((order: any) => {
        notifs.push({
          id: `pending_so_${order.id}`,
          type: 'approval_pending',
          title: 'Sales Order Pending Approval',
          message: `${order.sales_order_number} for ${order.customers?.name || 'Unknown'} awaits approval`,
          module: 'sales_order',
          refId: order.id,
          refNo: order.sales_order_number,
          createdAt: new Date(order.created_at),
          read: false,
        });
      });

      pendingAdjustments?.forEach((adj: any) => {
        notifs.push({
          id: `pending_adj_${adj.id}`,
          type: 'approval_pending',
          title: 'Stock Adjustment Pending Approval',
          message: `${adj.adjustment_number} - ${adj.reason} awaits approval`,
          module: 'stock_adjustment',
          refId: adj.id,
          refNo: adj.adjustment_number,
          createdAt: new Date(adj.created_at),
          read: false,
        });
      });

      // Sort by priority and date
      notifs.sort((a, b) => {
        const priority: Record<string, number> = { 
          expired: 0, 
          approval_pending: 1, 
          expiring_soon: 2, 
          low_stock: 3, 
          new_order: 4,
          approved: 5,
          cancelled: 6,
          info: 7 
        };
        const priorityDiff = priority[a.type] - priority[b.type];
        if (priorityDiff !== 0) return priorityDiff;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Refresh every 5 minutes
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return {
    notifications,
    loading,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
