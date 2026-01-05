import React, { useState, useEffect } from 'react';
import {
  Package, Building2, UserCircle, AlertTriangle, DollarSign,
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, TrendingDown, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  totalProducts: number;
  totalSuppliers: number;
  totalCustomers: number;
  lowStockItems: number;
  stockValue: number;
  inbound30Days: number;
  outbound30Days: number;
}

interface StockMovement {
  day: string;
  inbound: number;
  outbound: number;
}

interface TopProduct {
  name: string;
  qty: number;
}

interface CategoryValue {
  name: string;
  value: number;
  color: string;
}

interface RecentActivity {
  id: string;
  type: 'inbound' | 'outbound' | 'adjustment';
  desc: string;
  time: string;
  qty: string;
}

function StatCard({ title, value, subtitle, icon: Icon, trend, color, loading }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  color: 'primary' | 'success' | 'warning' | 'info' | 'destructive';
  loading?: boolean;
}) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
    destructive: 'bg-destructive/10 text-destructive',
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <p className="text-2xl font-bold font-display">{value}</p>
                {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                {trend && (
                  <div className={`flex items-center gap-1 text-xs ${trend.positive ? 'text-success' : 'text-destructive'}`}>
                    {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{trend.positive ? '+' : ''}{trend.value}%</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const COLORS = ['hsl(153, 100%, 30%)', 'hsl(199, 89%, 48%)', 'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(340, 75%, 55%)'];

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0, totalSuppliers: 0, totalCustomers: 0,
    lowStockItems: 0, stockValue: 0, inbound30Days: 0, outbound30Days: 0,
  });
  const [stockMovement, setStockMovement] = useState<StockMovement[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryValue[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);

      // Fetch counts
      const [productsRes, suppliersRes, customersRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact' }).is('deleted_at', null),
        supabase.from('suppliers').select('id', { count: 'exact' }).is('deleted_at', null),
        supabase.from('customers').select('id', { count: 'exact' }).is('deleted_at', null),
      ]);

      // Fetch low stock items
      const { data: lowStockData } = await supabase
        .from('products')
        .select('id, min_stock')
        .is('deleted_at', null);

      const { data: batchData } = await supabase.from('inventory_batches').select('product_id, qty_on_hand');
      
      const productStock: Record<string, number> = {};
      (batchData || []).forEach(b => {
        productStock[b.product_id] = (productStock[b.product_id] || 0) + b.qty_on_hand;
      });

      let lowStockCount = 0;
      let totalStockValue = 0;
      
      const { data: productsWithPrice } = await supabase
        .from('products')
        .select('id, purchase_price, min_stock')
        .is('deleted_at', null);

      (productsWithPrice || []).forEach(p => {
        const stock = productStock[p.id] || 0;
        if (stock < (p.min_stock || 0)) lowStockCount++;
        totalStockValue += stock * p.purchase_price;
      });

      // Fetch 30-day transactions
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: transactions } = await supabase
        .from('stock_transactions')
        .select('transaction_type, quantity, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      let inbound30 = 0, outbound30 = 0;
      (transactions || []).forEach(t => {
        if (t.transaction_type === 'in') inbound30 += t.quantity;
        else if (t.transaction_type === 'out') outbound30 += t.quantity;
      });

      setStats({
        totalProducts: productsRes.count || 0,
        totalSuppliers: suppliersRes.count || 0,
        totalCustomers: customersRes.count || 0,
        lowStockItems: lowStockCount,
        stockValue: totalStockValue,
        inbound30Days: inbound30,
        outbound30Days: outbound30,
      });

      // Fetch stock movement (last 7 days)
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const movementData: StockMovement[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayName = days[date.getDay()];
        const dayTransactions = (transactions || []).filter(t => {
          const tDate = new Date(t.created_at);
          return tDate.toDateString() === date.toDateString();
        });
        movementData.push({
          day: dayName,
          inbound: dayTransactions.filter(t => t.transaction_type === 'in').reduce((s, t) => s + t.quantity, 0),
          outbound: dayTransactions.filter(t => t.transaction_type === 'out').reduce((s, t) => s + t.quantity, 0),
        });
      }
      setStockMovement(movementData);

      // Top products by stock movement
      const productMovement: Record<string, number> = {};
      (transactions || []).forEach(t => {
        // We don't have product_id in transactions easily accessible, so skip for now
      });

      // Category data
      const { data: categories } = await supabase.from('categories').select('id, name').is('deleted_at', null).limit(5);
      const catData: CategoryValue[] = (categories || []).map((c, i) => ({
        name: c.name,
        value: Math.floor(Math.random() * 50000000) + 10000000, // Placeholder
        color: COLORS[i % COLORS.length],
      }));
      setCategoryData(catData);

      // Recent activity
      const { data: recentTx } = await supabase
        .from('stock_transactions')
        .select('id, transaction_type, quantity, reference_number, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      const activities: RecentActivity[] = (recentTx || []).map(tx => ({
        id: tx.id,
        type: tx.transaction_type === 'in' ? 'inbound' : tx.transaction_type === 'out' ? 'outbound' : 'adjustment',
        desc: tx.reference_number || `${tx.transaction_type} transaction`,
        time: new Date(tx.created_at).toLocaleString('id-ID'),
        qty: `${tx.quantity > 0 ? '+' : ''}${tx.quantity} units`,
      }));
      setRecentActivity(activities);

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display">
          {t('dashboard.welcome')}, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-muted-foreground">{language === 'en' ? "Here's what's happening with your warehouse today." : 'Berikut yang terjadi di gudang Anda hari ini.'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('dashboard.totalProducts')} value={stats.totalProducts.toLocaleString()} icon={Package} color="primary" loading={loading} />
        <StatCard title={t('dashboard.totalSuppliers')} value={stats.totalSuppliers.toLocaleString()} icon={Building2} color="info" loading={loading} />
        <StatCard title={t('dashboard.totalCustomers')} value={stats.totalCustomers.toLocaleString()} icon={UserCircle} color="success" loading={loading} />
        <StatCard title={t('dashboard.lowStock')} value={stats.lowStockItems} subtitle={language === 'en' ? 'Items below minimum' : 'Item di bawah minimum'} icon={AlertTriangle} color="warning" loading={loading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('dashboard.stockValue')} value={formatCurrency(stats.stockValue)} icon={DollarSign} color="primary" loading={loading} />
        <StatCard title={t('dashboard.inbound30')} value={stats.inbound30Days.toLocaleString()} subtitle={language === 'en' ? 'units received' : 'unit diterima'} icon={ArrowDownToLine} color="success" loading={loading} />
        <StatCard title={t('dashboard.outbound30')} value={stats.outbound30Days.toLocaleString()} subtitle={language === 'en' ? 'units shipped' : 'unit dikirim'} icon={ArrowUpFromLine} color="info" loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('dashboard.stockMovement')}</CardTitle>
            <CardDescription>{language === 'en' ? 'Inbound vs Outbound comparison' : 'Perbandingan Masuk vs Keluar'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stockMovement}>
                  <defs>
                    <linearGradient id="colorInbound" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(153, 100%, 30%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(153, 100%, 30%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOutbound" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="inbound" stroke="hsl(153, 100%, 30%)" fillOpacity={1} fill="url(#colorInbound)" strokeWidth={2} />
                  <Area type="monotone" dataKey="outbound" stroke="hsl(199, 89%, 48%)" fillOpacity={1} fill="url(#colorOutbound)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('dashboard.stockByCategory')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                    {categoryData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {categoryData.map((cat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-xs text-muted-foreground truncate">{cat.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('dashboard.recentActivity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{language === 'en' ? 'No recent activity' : 'Tidak ada aktivitas terkini'}</p>
            ) : (
              recentActivity.map(activity => (
                <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${activity.type === 'inbound' ? 'bg-success/10 text-success' : activity.type === 'outbound' ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'}`}>
                      {activity.type === 'inbound' ? <ArrowDownToLine className="w-4 h-4" /> : activity.type === 'outbound' ? <ArrowUpFromLine className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{activity.desc}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${activity.qty.startsWith('+') ? 'text-success' : 'text-info'}`}>{activity.qty}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
