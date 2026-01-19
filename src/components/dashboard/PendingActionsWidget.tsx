import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardList, Package, ChevronRight, RefreshCw, FileText, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { id as idLocale, enUS } from 'date-fns/locale';

interface PendingAction {
  id: string;
  type: 'plan_order' | 'sales_order' | 'stock_adjustment';
  refNo: string;
  status: string;
  description: string;
  createdAt: Date;
}

export function PendingActionsWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingActions = async () => {
    setLoading(true);
    const actions: PendingAction[] = [];

    try {
      // Fetch Draft & Pending Plan Orders
      const { data: planOrders } = await supabase
        .from('plan_order_headers')
        .select(`
          id, plan_number, status, created_at,
          suppliers(name)
        `)
        .in('status', ['draft', 'pending'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      // Fetch Draft & Pending Sales Orders
      const { data: salesOrders } = await supabase
        .from('sales_order_headers')
        .select(`
          id, sales_order_number, status, created_at,
          customers(name)
        `)
        .in('status', ['draft', 'pending'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      // Fetch Draft/Submitted/Pending Stock Adjustments
      const { data: adjustments } = await supabase
        .from('stock_adjustments')
        .select('id, adjustment_number, status, created_at, reason')
        .in('status', ['draft', 'submitted', 'pending'])
        .is('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(20);

      // Map Plan Orders
      planOrders?.forEach((item: any) => {
        actions.push({
          id: item.id,
          type: 'plan_order',
          refNo: item.plan_number,
          status: item.status,
          description: `Supplier: ${item.suppliers?.name || 'Unknown'}`,
          createdAt: new Date(item.created_at),
        });
      });

      // Map Sales Orders
      salesOrders?.forEach((item: any) => {
        actions.push({
          id: item.id,
          type: 'sales_order',
          refNo: item.sales_order_number,
          status: item.status,
          description: `Customer: ${item.customers?.name || 'Unknown'}`,
          createdAt: new Date(item.created_at),
        });
      });

      // Map Adjustments
      adjustments?.forEach((item: any) => {
        actions.push({
          id: item.id,
          type: 'stock_adjustment',
          refNo: item.adjustment_number,
          status: item.status,
          description: item.reason || '-',
          createdAt: new Date(item.created_at),
        });
      });

      // Sort by date descending
      actions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setPendingActions(actions.slice(0, 10));
    } catch (error) {
      console.error('Error fetching pending actions:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPendingActions();

    // Setup realtime subscriptions
    const planOrderChannel = supabase
      .channel('pending-plan-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_order_headers' }, () => {
        fetchPendingActions();
      })
      .subscribe();

    const salesOrderChannel = supabase
      .channel('pending-sales-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_order_headers' }, () => {
        fetchPendingActions();
      })
      .subscribe();

    const adjustmentChannel = supabase
      .channel('pending-adjustments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_adjustments' }, () => {
        fetchPendingActions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(planOrderChannel);
      supabase.removeChannel(salesOrderChannel);
      supabase.removeChannel(adjustmentChannel);
    };
  }, []);

  const handleActionClick = (action: PendingAction) => {
    switch (action.type) {
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

  const getTypeIcon = (type: PendingAction['type']) => {
    switch (type) {
      case 'plan_order':
        return <ClipboardList className="w-4 h-4" />;
      case 'sales_order':
        return <FileText className="w-4 h-4" />;
      case 'stock_adjustment':
        return <Package className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: PendingAction['type']) => {
    switch (type) {
      case 'plan_order':
        return 'Plan Order';
      case 'sales_order':
        return 'Sales Order';
      case 'stock_adjustment':
        return 'Stock Adjustment';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="draft">{language === 'en' ? 'Draft' : 'Draft'}</Badge>;
      case 'pending':
        return <Badge variant="pending">{language === 'en' ? 'Pending' : 'Menunggu Approval'}</Badge>;
      case 'submitted':
        return <Badge variant="pending">{language === 'en' ? 'Submitted' : 'Diajukan'}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card className="border-info/50 bg-info/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-info/20">
              <Clock className="w-5 h-5 text-info" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {language === 'en' ? 'Pending Actions' : 'Status Menunggu Tindakan'}
                {pendingActions.length > 0 && (
                  <Badge variant="outline" className="border-info text-info">
                    {pendingActions.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {language === 'en' 
                  ? 'Draft orders and adjustments requiring action' 
                  : 'Dokumen draft yang memerlukan tindakan'}
              </CardDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={fetchPendingActions}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : pendingActions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">
              {language === 'en' ? 'All clear!' : 'Semua bersih!'}
            </p>
            <p className="text-xs mt-1">
              {language === 'en' ? 'No pending documents' : 'Tidak ada dokumen yang tertunda'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[200px] pr-2">
            <div className="space-y-2">
              {pendingActions.map((action) => (
                <div
                  key={`${action.type}_${action.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background border border-info/30 cursor-pointer hover:bg-info/10 transition-colors"
                  onClick={() => handleActionClick(action)}
                >
                  <div className="p-2 rounded-lg bg-info/20 text-info">
                    {getTypeIcon(action.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{action.refNo}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {getTypeLabel(action.type)}
                      </Badge>
                      {getStatusBadge(action.status)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {format(action.createdAt, 'dd MMM yyyy HH:mm', { 
                          locale: language === 'id' ? idLocale : enUS 
                        })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default PendingActionsWidget;
