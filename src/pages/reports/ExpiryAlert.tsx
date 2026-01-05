import React, { useState, useEffect } from 'react';
import { Search, Download, RefreshCw, Loader2, AlertTriangle, Calendar, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExpiryItem {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  category: string;
  unit: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  daysUntilExpiry: number;
  status: 'expired' | 'critical' | 'warning' | 'ok';
}

export default function ExpiryAlert() {
  const { language } = useLanguage();
  const [items, setItems] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch categories
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name');
      
      setCategories(catData || []);

      // Fetch products
      const { data: products } = await supabase
        .from('products')
        .select(`
          id, name, sku,
          category:categories(id, name),
          unit:units(name)
        `)
        .is('deleted_at', null)
        .eq('is_active', true);

      // Fetch batches with expiry dates
      const { data: batches } = await supabase
        .from('inventory_batches')
        .select('id, product_id, batch_no, qty_on_hand, expired_date')
        .gt('qty_on_hand', 0)
        .not('expired_date', 'is', null)
        .order('expired_date', { ascending: true });

      if (products && batches) {
        const now = new Date();
        const expiryItems: ExpiryItem[] = [];

        batches.forEach((batch: any) => {
          const product = products.find((p: any) => p.id === batch.product_id);
          if (!product) return;

          const expiryDate = new Date(batch.expired_date);
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          let status: ExpiryItem['status'] = 'ok';
          if (daysUntilExpiry <= 0) status = 'expired';
          else if (daysUntilExpiry <= 30) status = 'critical';
          else if (daysUntilExpiry <= 90) status = 'warning';

          expiryItems.push({
            id: batch.id,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            category: product.category?.name || '-',
            unit: product.unit?.name || '-',
            batchNo: batch.batch_no,
            expiryDate: batch.expired_date,
            qtyOnHand: batch.qty_on_hand,
            daysUntilExpiry,
            status,
          });
        });

        setItems(expiryItems);
      }
    } catch (error) {
      console.error('Error fetching expiry data:', error);
      toast.error(language === 'en' ? 'Failed to load data' : 'Gagal memuat data');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: ExpiryItem['status'], days: number) => {
    switch (status) {
      case 'expired':
        return <Badge variant="destructive">{language === 'en' ? 'Expired' : 'Kadaluarsa'}</Badge>;
      case 'critical':
        return <Badge variant="destructive">{days} {language === 'en' ? 'days left' : 'hari lagi'}</Badge>;
      case 'warning':
        return <Badge variant="warning">{days} {language === 'en' ? 'days left' : 'hari lagi'}</Badge>;
      default:
        return <Badge variant="success">{days} {language === 'en' ? 'days left' : 'hari lagi'}</Badge>;
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.batchNo.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    
    let matchesTab = true;
    if (activeTab === '30') matchesTab = item.daysUntilExpiry <= 30;
    else if (activeTab === '60') matchesTab = item.daysUntilExpiry <= 60 && item.daysUntilExpiry > 30;
    else if (activeTab === '90') matchesTab = item.daysUntilExpiry <= 90 && item.daysUntilExpiry > 60;
    else if (activeTab === 'expired') matchesTab = item.daysUntilExpiry <= 0;

    return matchesSearch && matchesCategory && matchesTab;
  });

  // Stats
  const expiredCount = items.filter(i => i.status === 'expired').length;
  const criticalCount = items.filter(i => i.status === 'critical').length;
  const warningCount = items.filter(i => i.status === 'warning').length;

  const exportCSV = () => {
    const headers = ['Product', 'SKU', 'Category', 'Batch No', 'Expiry Date', 'Days Left', 'Quantity', 'Unit', 'Status'];
    const rows = filteredItems.map(item => [
      item.productName,
      item.sku || '-',
      item.category,
      item.batchNo,
      formatDate(item.expiryDate),
      item.daysUntilExpiry,
      item.qtyOnHand,
      item.unit,
      item.status
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `expiry-alert-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(language === 'en' ? 'CSV exported successfully' : 'CSV berhasil diekspor');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">
            {language === 'en' ? 'Batch Expiry Alert' : 'Peringatan Kadaluarsa Batch'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Monitor products expiring within 30/60/90 days' : 'Pantau produk yang akan kadaluarsa dalam 30/60/90 hari'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-destructive/10 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive">{expiredCount}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Expired Batches' : 'Batch Kadaluarsa'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-warning/10 rounded-xl">
              <Calendar className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-warning">{criticalCount}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Expiring in 30 days' : 'Kadaluarsa 30 hari'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-info/30 bg-info/5">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-info/10 rounded-xl">
              <Package className="w-6 h-6 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-info">{warningCount}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Expiring in 31-90 days' : 'Kadaluarsa 31-90 hari'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">{language === 'en' ? 'All' : 'Semua'}</TabsTrigger>
          <TabsTrigger value="expired" className="text-destructive">
            {language === 'en' ? 'Expired' : 'Kadaluarsa'} ({expiredCount})
          </TabsTrigger>
          <TabsTrigger value="30">
            ≤30 {language === 'en' ? 'days' : 'hari'} ({criticalCount})
          </TabsTrigger>
          <TabsTrigger value="60">
            31-60 {language === 'en' ? 'days' : 'hari'}
          </TabsTrigger>
          <TabsTrigger value="90">
            61-90 {language === 'en' ? 'days' : 'hari'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder={language === 'en' ? 'Search product, SKU, or batch...' : 'Cari produk, SKU, atau batch...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={<Search className="w-4 h-4" />}
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={language === 'en' ? 'All Categories' : 'Semua Kategori'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'en' ? 'All Categories' : 'Semua Kategori'}</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                    <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                    <TableHead>{language === 'en' ? 'Expiry Date' : 'Tgl. Kadaluarsa'}</TableHead>
                    <TableHead className="text-right">{language === 'en' ? 'Quantity' : 'Kuantitas'}</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {language === 'en' ? 'No expiring batches found' : 'Tidak ada batch yang akan kadaluarsa'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((item) => (
                      <TableRow 
                        key={item.id}
                        className={cn(
                          item.status === 'expired' && 'bg-destructive/5',
                          item.status === 'critical' && 'bg-warning/5'
                        )}
                      >
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="font-mono text-sm">{item.sku || '-'}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell className="font-mono text-sm">{item.batchNo}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            {formatDate(item.expiryDate)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{item.qtyOnHand} {item.unit}</TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(item.status, item.daysUntilExpiry)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-sm text-muted-foreground text-center">
        {language === 'en' 
          ? `Showing ${filteredItems.length} of ${items.length} batches with expiry dates`
          : `Menampilkan ${filteredItems.length} dari ${items.length} batch dengan tanggal kadaluarsa`}
      </div>
    </div>
  );
}
