import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowDownToLine, ArrowUpFromLine, Package, ClipboardList, CheckCircle, 
  XCircle, Clock, Activity, RefreshCw, ChevronRight, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { id as idLocale, enUS } from 'date-fns/locale';

interface ActivityItem {
  id: string;
  type: 'stock_in' | 'stock_out' | 'plan_order' | 'sales_order' | 'adjustment' | 'approved' | 'cancelled';
  title: string;
  description: string;
  refNo: string;
  module: string;
  timestamp: Date;
  isNew?: boolean;
}

interface PendingApproval {
  id: string;
  type: 'plan_order' | 'sales_order' | 'adjustment';
  refNo: string;
  description: string;
  createdAt: Date;
}

export default function RealtimeActivityFeed() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const previousActivitiesRef = useRef<Set<string>>(new Set());

  const fetchActivities = async () => {
    setLoading(true);
    const now = new Date();
    const activities: ActivityItem[] = [];

    // Fetch recent stock in
    const { data: stockInData } = await supabase
      .from('stock_in_headers')
      .select('id, stock_in_number, created_at, plan_order_id, plan_order_headers(plan_number, suppliers(name))')
      .order('created_at', { ascending: false })
      .limit(10);

    stockInData?.forEach((item: any) => {
      activities.push({
        id: `si_${item.id}`,
        type: 'stock_in',
        title: language === 'en' ? 'Stock Received' : 'Stok Diterima',
        description: `${item.stock_in_number} - ${item.plan_order_headers?.suppliers?.name || 'Unknown'}`,
        refNo: item.stock_in_number,
        module: 'stock_in',
        timestamp: new Date(item.created_at),
      });
    });

    // Fetch recent stock out
    const { data: stockOutData } = await supabase
      .from('stock_out_headers')
      .select('id, stock_out_number, created_at, sales_order_id, sales_order_headers(sales_order_number, customers(name))')
      .order('created_at', { ascending: false })
      .limit(10);

    stockOutData?.forEach((item: any) => {
      activities.push({
        id: `so_${item.id}`,
        type: 'stock_out',
        title: language === 'en' ? 'Stock Shipped' : 'Stok Dikirim',
        description: `${item.stock_out_number} - ${item.sales_order_headers?.customers?.name || 'Unknown'}`,
        refNo: item.stock_out_number,
        module: 'stock_out',
        timestamp: new Date(item.created_at),
      });
    });

    // Fetch recent plan orders (including draft for pending approvals)
    const { data: planOrderData } = await supabase
      .from('plan_order_headers')
      .select('id, plan_number, status, approved_at, created_at, suppliers(name)')
      .in('status', ['approved', 'cancelled', 'pending', 'draft'])
      .is('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20);

    planOrderData?.forEach((item: any) => {
      if (item.status === 'approved') {
        activities.push({
          id: `po_approved_${item.id}`,
          type: 'approved',
          title: language === 'en' ? 'Plan Order Approved' : 'Plan Order Disetujui',
          description: `${item.plan_number} - ${item.suppliers?.name || 'Unknown'}`,
          refNo: item.plan_number,
          module: 'plan_order',
          timestamp: new Date(item.approved_at || item.created_at),
        });
      } else if (item.status === 'cancelled') {
        activities.push({
          id: `po_cancelled_${item.id}`,
          type: 'cancelled',
          title: language === 'en' ? 'Plan Order Cancelled' : 'Plan Order Dibatalkan',
          description: `${item.plan_number} - ${item.suppliers?.name || 'Unknown'}`,
          refNo: item.plan_number,
          module: 'plan_order',
          timestamp: new Date(item.created_at),
        });
      }
    });

    // Fetch recent sales orders (including draft for pending approvals)
    const { data: salesOrderData } = await supabase
      .from('sales_order_headers')
      .select('id, sales_order_number, status, approved_at, created_at, customers(name)')
      .in('status', ['approved', 'cancelled', 'pending', 'draft'])
      .is('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20);

    salesOrderData?.forEach((item: any) => {
      if (item.status === 'approved') {
        activities.push({
          id: `so_approved_${item.id}`,
          type: 'approved',
          title: language === 'en' ? 'Sales Order Approved' : 'Sales Order Disetujui',
          description: `${item.sales_order_number} - ${item.customers?.name || 'Unknown'}`,
          refNo: item.sales_order_number,
          module: 'sales_order',
          timestamp: new Date(item.approved_at || item.created_at),
        });
      } else if (item.status === 'cancelled') {
        activities.push({
          id: `so_cancelled_${item.id}`,
          type: 'cancelled',
          title: language === 'en' ? 'Sales Order Cancelled' : 'Sales Order Dibatalkan',
          description: `${item.sales_order_number} - ${item.customers?.name || 'Unknown'}`,
          refNo: item.sales_order_number,
          module: 'sales_order',
          timestamp: new Date(item.created_at),
        });
      }
    });

    // Fetch recent stock adjustments (including draft/submitted for pending approvals)
    const { data: adjustmentData } = await supabase
      .from('stock_adjustments')
      .select('id, adjustment_number, status, approved_at, created_at, reason')
      .in('status', ['approved', 'rejected', 'pending', 'draft', 'submitted'])
      .is('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(20);

    adjustmentData?.forEach((item: any) => {
      if (item.status === 'approved') {
        activities.push({
          id: `adj_approved_${item.id}`,
          type: 'approved',
          title: language === 'en' ? 'Adjustment Approved' : 'Penyesuaian Disetujui',
          description: `${item.adjustment_number} - ${item.reason}`,
          refNo: item.adjustment_number,
          module: 'stock_adjustment',
          timestamp: new Date(item.approved_at || item.created_at),
        });
      } else if (item.status === 'rejected') {
        activities.push({
          id: `adj_rejected_${item.id}`,
          type: 'cancelled',
          title: language === 'en' ? 'Adjustment Rejected' : 'Penyesuaian Ditolak',
          description: `${item.adjustment_number} - ${item.reason}`,
          refNo: item.adjustment_number,
          module: 'stock_adjustment',
          timestamp: new Date(item.created_at),
        });
      }
    });

    // Sort by timestamp descending and mark new items
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Mark new items
    const currentIds = new Set(activities.map(a => a.id));
    activities.forEach(a => {
      if (!previousActivitiesRef.current.has(a.id) && previousActivitiesRef.current.size > 0) {
        a.isNew = true;
      }
    });
    previousActivitiesRef.current = currentIds;

    setActivities(activities.slice(0, 15));

    // Fetch pending approvals (draft, pending, and submitted status)
    const pending: PendingApproval[] = [];
    
    // Include draft and pending status for plan orders
    planOrderData?.filter((p: any) => ['draft', 'pending'].includes(p.status)).forEach((item: any) => {
      pending.push({
        id: item.id,
        type: 'plan_order',
        refNo: item.plan_number,
        description: item.suppliers?.name || 'Unknown',
        createdAt: new Date(item.created_at),
      });
    });

    // Include draft and pending status for sales orders
    salesOrderData?.filter((s: any) => ['draft', 'pending'].includes(s.status)).forEach((item: any) => {
      pending.push({
        id: item.id,
        type: 'sales_order',
        refNo: item.sales_order_number,
        description: item.customers?.name || 'Unknown',
        createdAt: new Date(item.created_at),
      });
    });

    // Include draft, submitted, and pending status for adjustments
    adjustmentData?.filter((a: any) => ['draft', 'submitted', 'pending'].includes(a.status)).forEach((item: any) => {
      pending.push({
        id: item.id,
        type: 'adjustment',
        refNo: item.adjustment_number,
        description: item.reason,
        createdAt: new Date(item.created_at),
      });
    });

    pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    setPendingApprovals(pending.slice(0, 5));

    setLoading(false);
  };

  // Setup real-time subscriptions
  useEffect(() => {
    fetchActivities();

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Stock In changes
    const stockInChannel = supabase
      .channel('dashboard-stock-in')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_in_headers' }, () => {
        console.log('Real-time: Stock In change');
        fetchActivities();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsConnected(true);
      });
    channels.push(stockInChannel);

    // Stock Out changes
    const stockOutChannel = supabase
      .channel('dashboard-stock-out')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_out_headers' }, () => {
        console.log('Real-time: Stock Out change');
        fetchActivities();
      })
      .subscribe();
    channels.push(stockOutChannel);

    // Plan Order changes
    const planOrderChannel = supabase
      .channel('dashboard-plan-order')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_order_headers' }, () => {
        console.log('Real-time: Plan Order change');
        fetchActivities();
      })
      .subscribe();
    channels.push(planOrderChannel);

    // Sales Order changes
    const salesOrderChannel = supabase
      .channel('dashboard-sales-order')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_headers' }, () => {
        console.log('Real-time: Sales Order change');
        fetchActivities();
      })
      .subscribe();
    channels.push(salesOrderChannel);

    // Stock Adjustments changes
    const adjustmentChannel = supabase
      .channel('dashboard-adjustments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_adjustments' }, () => {
        console.log('Real-time: Adjustment change');
        fetchActivities();
      })
      .subscribe();
    channels.push(adjustmentChannel);

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [language]);

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'stock_in':
        return <ArrowDownToLine className="w-4 h-4" />;
      case 'stock_out':
        return <ArrowUpFromLine className="w-4 h-4" />;
      case 'plan_order':
      case 'sales_order':
        return <ClipboardList className="w-4 h-4" />;
      case 'adjustment':
        return <Package className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'stock_in':
        return 'bg-success/10 text-success border-success/30';
      case 'stock_out':
        return 'bg-info/10 text-info border-info/30';
      case 'approved':
        return 'bg-success/10 text-success border-success/30';
      case 'cancelled':
        return 'bg-destructive/10 text-destructive border-destructive/30';
      default:
        return 'bg-primary/10 text-primary border-primary/30';
    }
  };

  const getPendingIcon = (type: PendingApproval['type']) => {
    switch (type) {
      case 'plan_order':
        return <ArrowDownToLine className="w-4 h-4" />;
      case 'sales_order':
        return <ArrowUpFromLine className="w-4 h-4" />;
      case 'adjustment':
        return <Package className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const handleActivityClick = (activity: ActivityItem) => {
    switch (activity.module) {
      case 'stock_in':
        navigate('/stock-in');
        break;
      case 'stock_out':
        navigate('/stock-out');
        break;
      case 'plan_order':
        navigate('/plan-order');
        break;
      case 'sales_order':
        navigate('/sales-order');
        break;
      case 'stock_adjustment':
        navigate('/stock-adjustment');
        break;
    }
  };

  const handlePendingClick = (pending: PendingApproval) => {
    switch (pending.type) {
      case 'plan_order':
        navigate('/plan-order');
        break;
      case 'sales_order':
        navigate('/sales-order');
        break;
      case 'adjustment':
        navigate('/stock-adjustment');
        break;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Pending Approvals */}
      <Card className="border-warning/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {language === 'en' ? 'Pending Approvals' : 'Menunggu Persetujuan'}
                </CardTitle>
                <CardDescription className="text-xs">
                  {pendingApprovals.length} {language === 'en' ? 'items waiting' : 'item menunggu'}
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
              Live
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{language === 'en' ? 'All caught up!' : 'Semua sudah selesai!'}</p>
            </div>
          ) : (
            <ScrollArea className="h-[280px] pr-2">
              <div className="space-y-2">
                {pendingApprovals.slice(0, 5).map((pending) => (
                  <div
                    key={`${pending.type}_${pending.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20 cursor-pointer hover:bg-warning/10 transition-colors"
                    onClick={() => handlePendingClick(pending)}
                  >
                    <div className="p-2 rounded-lg bg-warning/10 text-warning">
                      {getPendingIcon(pending.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{pending.refNo}</p>
                      <p className="text-xs text-muted-foreground truncate">{pending.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Real-time Activity Feed */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {language === 'en' ? 'Real-time Activity' : 'Aktivitas Real-time'}
                </CardTitle>
                <CardDescription className="text-xs">
                  {language === 'en' ? 'Live updates from warehouse' : 'Pembaruan langsung dari gudang'}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className={cn("gap-1", isConnected ? "border-success/50" : "border-muted")}
              >
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  isConnected ? "bg-success animate-pulse" : "bg-muted"
                )} />
                {isConnected ? 'Connected' : 'Connecting...'}
              </Badge>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={fetchActivities}
                disabled={loading}
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">{language === 'en' ? 'No recent activity' : 'Tidak ada aktivitas terkini'}</p>
                <p className="text-sm">{language === 'en' ? 'Activities will appear here in real-time' : 'Aktivitas akan muncul di sini secara real-time'}</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-border" />
                
                <div className="space-y-3">
                  {activities.map((activity, index) => (
                    <div
                      key={activity.id}
                      className={cn(
                        "relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all",
                        "hover:bg-muted/50",
                        activity.isNew && "animate-pulse bg-primary/5 border border-primary/20"
                      )}
                      onClick={() => handleActivityClick(activity)}
                    >
                      {/* Timeline dot */}
                      <div className={cn(
                        "relative z-10 p-2 rounded-full border-2 bg-background",
                        getActivityColor(activity.type)
                      )}>
                        {getActivityIcon(activity.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{activity.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{activity.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(activity.timestamp, {
                                addSuffix: true,
                                locale: language === 'id' ? idLocale : enUS
                              })}
                            </p>
                            {activity.isNew && (
                              <Badge variant="default" className="text-[10px] mt-1">NEW</Badge>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs mt-2">
                          {activity.refNo}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
