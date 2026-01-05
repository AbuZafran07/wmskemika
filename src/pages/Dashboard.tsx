import React from 'react';
import {
  Package,
  Building2,
  UserCircle,
  AlertTriangle,
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const stockMovementData = [
  { day: 'Mon', inbound: 45, outbound: 32 },
  { day: 'Tue', inbound: 52, outbound: 48 },
  { day: 'Wed', inbound: 38, outbound: 55 },
  { day: 'Thu', inbound: 65, outbound: 42 },
  { day: 'Fri', inbound: 48, outbound: 58 },
  { day: 'Sat', inbound: 28, outbound: 22 },
  { day: 'Sun', inbound: 15, outbound: 12 },
];

const topProductsData = [
  { name: 'Chemical A-100', qty: 245 },
  { name: 'Solvent B-200', qty: 198 },
  { name: 'Additive C-300', qty: 156 },
  { name: 'Reagent D-400', qty: 134 },
  { name: 'Compound E-500', qty: 98 },
];

const categoryData = [
  { name: 'Chemicals', value: 45000000, color: 'hsl(153, 100%, 30%)' },
  { name: 'Solvents', value: 32000000, color: 'hsl(199, 89%, 48%)' },
  { name: 'Additives', value: 18000000, color: 'hsl(38, 92%, 50%)' },
  { name: 'Reagents', value: 12000000, color: 'hsl(280, 65%, 60%)' },
  { name: 'Others', value: 8000000, color: 'hsl(340, 75%, 55%)' },
];

const recentActivity = [
  { id: 1, type: 'inbound', desc: 'Stock In - PO-2026-001', time: '2 hours ago', qty: '+150 units' },
  { id: 2, type: 'outbound', desc: 'Stock Out - SO-2026-045', time: '3 hours ago', qty: '-75 units' },
  { id: 3, type: 'adjustment', desc: 'Adjustment - Chemical A-100', time: '5 hours ago', qty: '+5 units' },
  { id: 4, type: 'inbound', desc: 'Stock In - PO-2026-002', time: '1 day ago', qty: '+200 units' },
];

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  color: 'primary' | 'success' | 'warning' | 'info' | 'destructive';
}

function StatCard({ title, value, subtitle, icon: Icon, trend, color }: StatCardProps) {
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
            <p className="text-2xl font-bold font-display">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend && (
              <div className={`flex items-center gap-1 text-xs ${trend.positive ? 'text-success' : 'text-destructive'}`}>
                {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{trend.positive ? '+' : ''}{trend.value}%</span>
                <span className="text-muted-foreground">vs last month</span>
              </div>
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

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display">
          {t('dashboard.welcome')}, {user?.name?.split(' ')[0]}! 👋
        </h1>
        <p className="text-muted-foreground">Here's what's happening with your warehouse today.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('dashboard.totalProducts')} value="1,247" icon={Package} color="primary" trend={{ value: 12, positive: true }} />
        <StatCard title={t('dashboard.totalSuppliers')} value="86" icon={Building2} color="info" trend={{ value: 5, positive: true }} />
        <StatCard title={t('dashboard.totalCustomers')} value="342" icon={UserCircle} color="success" trend={{ value: 8, positive: true }} />
        <StatCard title={t('dashboard.lowStock')} value="23" subtitle="Items below minimum" icon={AlertTriangle} color="warning" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t('dashboard.stockValue')} value={formatCurrency(115000000)} icon={DollarSign} color="primary" />
        <StatCard title={t('dashboard.inbound30')} value="2,458" subtitle="units received" icon={ArrowDownToLine} color="success" trend={{ value: 15, positive: true }} />
        <StatCard title={t('dashboard.outbound30')} value="1,892" subtitle="units shipped" icon={ArrowUpFromLine} color="info" trend={{ value: 3, positive: false }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('dashboard.stockMovement')}</CardTitle>
            <CardDescription>Inbound vs Outbound comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stockMovementData}>
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
            <CardTitle className="text-lg">{t('dashboard.topMoving')}</CardTitle>
            <CardDescription>Top 5 products by movement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProductsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={100} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="qty" fill="hsl(153, 100%, 30%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">{t('dashboard.recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map(activity => (
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
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
