import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Building2, UserCircle, AlertTriangle, DollarSign,
  ArrowDownToLine, ArrowUpFromLine, TrendingUp, TrendingDown, Loader2,
  CalendarClock, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  sku?: string;
}

interface ProductMovement {
  id: string;
  name: string;
  sku: string | null;
  totalQty: number;
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
  productName: string;
  time: string;
  qty: string;
}

interface LowStockItem {
  id: string;
  name: string;
  sku: string | null;
  currentStock: number;
  minStock: number;
}

interface ExpiringBatch {
  id: string;
  productName: string;
  batchNo: string;
  expiryDate: string;
  daysUntilExpiry: number;
  qty: number;
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
  const navigate = useNavigate();
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
  const [lowStockProducts, setLowStockProducts] = useState<LowStockItem[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([]);
  const [bestSellingProducts, setBestSellingProducts] = useState<ProductMovement[]>([]);
  const [slowestMovingProducts, setSlowestMovingProducts] = useState<ProductMovement[]>([]);
  const [productViewMode, setProductViewMode] = useState<'best' | 'slow'>('best');

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

      // Fetch low stock items with full product data
      const { data: allProducts } = await supabase
        .from('products')
        .select('id, name, sku, min_stock, purchase_price')
        .is('deleted_at', null)
        .eq('is_active', true);

      const { data: batchData } = await supabase.from('inventory_batches').select('id, product_id, batch_no, qty_on_hand, expired_date');
      
      const productStock: Record<string, number> = {};
      (batchData || []).forEach(b => {
        productStock[b.product_id] = (productStock[b.product_id] || 0) + b.qty_on_hand;
      });

      let lowStockCount = 0;
      let totalStockValue = 0;
      const lowStockList: LowStockItem[] = [];
      
      (allProducts || []).forEach(p => {
        const stock = productStock[p.id] || 0;
        if (stock <= (p.min_stock || 0) && stock > 0) {
          lowStockCount++;
          lowStockList.push({
            id: p.id,
            name: p.name,
            sku: p.sku,
            currentStock: stock,
            minStock: p.min_stock || 0,
          });
        }
        totalStockValue += stock * p.purchase_price;
      });
      
      // Sort by most critical (lowest stock relative to min)
      lowStockList.sort((a, b) => (a.currentStock / a.minStock) - (b.currentStock / b.minStock));
      setLowStockProducts(lowStockList.slice(0, 5));

      // Fetch expiring batches
      const now = new Date();
      const expiringList: ExpiringBatch[] = [];
      
      (batchData || []).forEach(batch => {
        if (!batch.expired_date || batch.qty_on_hand <= 0) return;
        
        const expiryDate = new Date(batch.expired_date);
        const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 30) {
          const product = (allProducts || []).find(p => p.id === batch.product_id);
          if (product) {
            expiringList.push({
              id: batch.id,
              productName: product.name,
              batchNo: batch.batch_no,
              expiryDate: batch.expired_date,
              daysUntilExpiry: diffDays,
              qty: batch.qty_on_hand,
            });
          }
        }
      });
      
      // Sort by most urgent (closest to expiry)
      expiringList.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
      setExpiringBatches(expiringList.slice(0, 5));

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

      // Recent activity - fetch with product names
      const { data: recentTx } = await supabase
        .from('stock_transactions')
        .select('id, transaction_type, quantity, reference_number, created_at, product_id')
        .order('created_at', { ascending: false })
        .limit(5);

      // Get product names for recent transactions
      const recentProductIds = [...new Set((recentTx || []).map(tx => tx.product_id))];
      const { data: recentProducts } = recentProductIds.length > 0
        ? await supabase.from('products').select('id, name').in('id', recentProductIds)
        : { data: [] };

      const recentProductMap: Record<string, string> = {};
      (recentProducts || []).forEach(p => { recentProductMap[p.id] = p.name; });

      const activities: RecentActivity[] = (recentTx || []).map(tx => ({
        id: tx.id,
        type: tx.transaction_type === 'in' ? 'inbound' : tx.transaction_type === 'out' ? 'outbound' : 'adjustment',
        desc: tx.reference_number || `${tx.transaction_type} transaction`,
        productName: recentProductMap[tx.product_id] || 'Unknown Product',
        time: new Date(tx.created_at).toLocaleString('id-ID'),
        qty: `${tx.quantity > 0 ? '+' : ''}${tx.quantity} units`,
      }));
      setRecentActivity(activities);

      // Fetch best selling & slowest moving products (based on stock out transactions)
      const { data: outTransactions } = await supabase
        .from('stock_transactions')
        .select('product_id, quantity')
        .eq('transaction_type', 'out')
        .gte('created_at', thirtyDaysAgo.toISOString());

      // Aggregate by product
      const productQty: Record<string, number> = {};
      (outTransactions || []).forEach(tx => {
        productQty[tx.product_id] = (productQty[tx.product_id] || 0) + Math.abs(tx.quantity);
      });

      // Get product details
      const productIds = Object.keys(productQty);
      const { data: productDetails } = productIds.length > 0 
        ? await supabase.from('products').select('id, name, sku').in('id', productIds)
        : { data: [] };

      const productMap: Record<string, { name: string; sku: string | null }> = {};
      (productDetails || []).forEach(p => { productMap[p.id] = { name: p.name, sku: p.sku }; });

      // Create sorted lists
      const productMovements: ProductMovement[] = productIds.map(id => ({
        id,
        name: productMap[id]?.name || 'Unknown',
        sku: productMap[id]?.sku || null,
        totalQty: productQty[id],
      }));

      // Best selling = highest qty
      const bestSelling = [...productMovements].sort((a, b) => b.totalQty - a.totalQty).slice(0, 5);
      setBestSellingProducts(bestSelling);

      // Slowest moving = lowest qty (but > 0)
      const slowest = [...productMovements].sort((a, b) => a.totalQty - b.totalQty).slice(0, 5);
      setSlowestMovingProducts(slowest);

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

      {/* Alert Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <Card className="border-warning/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-warning/10">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <CardTitle className="text-lg">{language === 'en' ? 'Low Stock Alerts' : 'Peringatan Stok Rendah'}</CardTitle>
                  <CardDescription>{language === 'en' ? 'Products below minimum stock level' : 'Produk di bawah stok minimum'}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/data-stock')} className="gap-1">
                {language === 'en' ? 'View All' : 'Lihat Semua'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{language === 'en' ? 'All products have sufficient stock' : 'Semua produk memiliki stok yang cukup'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/20">
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.sku || '-'}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="pending" className="font-mono">
                        {item.currentStock} / {item.minStock}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring Batches Alerts */}
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <CalendarClock className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-lg">{language === 'en' ? 'Expiry Alerts' : 'Peringatan Kadaluarsa'}</CardTitle>
                  <CardDescription>{language === 'en' ? 'Batches expiring within 30 days' : 'Batch kadaluarsa dalam 30 hari'}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/reports/expiry')} className="gap-1">
                {language === 'en' ? 'View All' : 'Lihat Semua'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {expiringBatches.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{language === 'en' ? 'No products expiring soon' : 'Tidak ada produk yang akan kadaluarsa'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expiringBatches.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div>
                      <p className="font-medium text-sm">{batch.productName}</p>
                      <p className="text-xs text-muted-foreground">Batch: {batch.batchNo} • {batch.qty} units</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={batch.daysUntilExpiry <= 0 ? 'cancelled' : batch.daysUntilExpiry <= 7 ? 'pending' : 'draft'}>
                        {batch.daysUntilExpiry <= 0 
                          ? (language === 'en' ? 'Expired' : 'Kadaluarsa')
                          : `${batch.daysUntilExpiry} ${language === 'en' ? 'days' : 'hari'}`
                        }
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products Widget */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {productViewMode === 'best' 
                ? (language === 'en' ? 'Best Selling Products' : 'Produk Terlaris')
                : (language === 'en' ? 'Slowest Moving Products' : 'Produk Pergerakan Lambat')
              }
            </CardTitle>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setProductViewMode('best')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  productViewMode === 'best'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {language === 'en' ? 'Best Selling' : 'Terlaris'}
              </button>
              <button
                onClick={() => setProductViewMode('slow')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  productViewMode === 'slow'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {language === 'en' ? 'Slowest' : 'Lambat'}
              </button>
            </div>
          </div>
          <CardDescription>
            {language === 'en' ? 'Based on stock out transactions in the last 30 days' : 'Berdasarkan transaksi keluar dalam 30 hari terakhir'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(productViewMode === 'best' ? bestSellingProducts : slowestMovingProducts).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{language === 'en' ? 'No data available' : 'Data tidak tersedia'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(productViewMode === 'best' ? bestSellingProducts : slowestMovingProducts).map((product, idx) => (
                <div key={product.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      idx === 0 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku || '-'}</p>
                    </div>
                  </div>
                  <Badge variant={productViewMode === 'best' ? 'success' : 'pending'}>
                    {product.totalQty.toLocaleString()} {language === 'en' ? 'units' : 'unit'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                      <p className="text-sm font-medium">{activity.productName}</p>
                      <p className="text-xs text-muted-foreground">{activity.desc} • {activity.time}</p>
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
