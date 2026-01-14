import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, RefreshCw, Loader2, ArrowDownToLine, ArrowUpFromLine, Settings2, Calendar } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StockTransaction {
  id: string;
  transaction_type: string;
  quantity: number;
  reference_type: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
  } | null;
  batch: {
    id: string;
    batch_no: string;
  } | null;
}

export default function StockMovement() {
  const { t, language } = useLanguage();
  const { canUpload } = usePermissions();
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch products for filter
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('name');
      
      setProducts(productsData || []);

      // Fetch transactions
      let query = supabase
        .from('stock_transactions')
        .select(`
          id, transaction_type, quantity, reference_type, reference_number, notes, created_at,
          product:products(id, name, sku),
          batch:inventory_batches(id, batch_no)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (typeFilter !== 'all') {
        query = query.eq('transaction_type', typeFilter);
      }

      if (productFilter !== 'all') {
        query = query.eq('product_id', productFilter);
      }

      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;

      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error(language === 'en' ? 'Failed to load transactions' : 'Gagal memuat transaksi');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [typeFilter, productFilter, dateFrom, dateTo]);

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'inbound':
        return <ArrowDownToLine className="w-4 h-4 text-success" />;
      case 'outbound':
        return <ArrowUpFromLine className="w-4 h-4 text-destructive" />;
      case 'adjustment':
        return <Settings2 className="w-4 h-4 text-warning" />;
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'inbound':
        return <Badge variant="success">{language === 'en' ? 'Stock In' : 'Masuk'}</Badge>;
      case 'outbound':
        return <Badge variant="destructive">{language === 'en' ? 'Stock Out' : 'Keluar'}</Badge>;
      case 'adjustment':
        return <Badge variant="warning">{language === 'en' ? 'Adjustment' : 'Penyesuaian'}</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getReferenceTypeBadge = (type: string | null) => {
    if (!type) return '-';
    switch (type) {
      case 'stock_in':
        return <Badge variant="outline">{language === 'en' ? 'Stock In' : 'Penerimaan'}</Badge>;
      case 'stock_out':
        return <Badge variant="outline">{language === 'en' ? 'Stock Out' : 'Pengeluaran'}</Badge>;
      case 'adjustment':
        return <Badge variant="outline">{language === 'en' ? 'Adjustment' : 'Penyesuaian'}</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = 
      (tx.product?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.product?.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.reference_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.batch?.batch_no || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  // Calculate summary
  const totalIn = filteredTransactions.filter(t => t.transaction_type === 'inbound').reduce((sum, t) => sum + t.quantity, 0);
  const totalOut = filteredTransactions.filter(t => t.transaction_type === 'outbound').reduce((sum, t) => sum + Math.abs(t.quantity), 0);
  const totalAdjustment = filteredTransactions.filter(t => t.transaction_type === 'adjustment').length;

  const exportCSV = () => {
    const headers = ['Date/Time', 'Product', 'SKU', 'Type', 'Quantity', 'Batch', 'Reference Type', 'Reference No', 'Notes'];
    const rows = filteredTransactions.map(tx => [
      formatDateTime(tx.created_at),
      tx.product?.name || '-',
      tx.product?.sku || '-',
      tx.transaction_type,
      tx.quantity,
      tx.batch?.batch_no || '-',
      tx.reference_type || '-',
      tx.reference_number || '-',
      tx.notes || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stock-movement-${new Date().toISOString().split('T')[0]}.csv`;
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
            {language === 'en' ? 'Stock Movement History' : 'Riwayat Pergerakan Stok'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'View all stock transactions (in/out/adjustment)' : 'Lihat semua transaksi stok (masuk/keluar/penyesuaian)'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {canUpload('report') && (
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-success/10 rounded-xl">
              <ArrowDownToLine className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalIn.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Stock In' : 'Total Masuk'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-destructive/10 rounded-xl">
              <ArrowUpFromLine className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalOut.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Stock Out' : 'Total Keluar'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-warning/10 rounded-xl">
              <Settings2 className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalAdjustment}</p>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Adjustments' : 'Penyesuaian'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <Input
                placeholder={language === 'en' ? 'Search product, SKU, reference, batch...' : 'Cari produk, SKU, referensi, batch...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'en' ? 'All Types' : 'Semua Tipe'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Types' : 'Semua Tipe'}</SelectItem>
                <SelectItem value="inbound">{language === 'en' ? 'Stock In' : 'Masuk'}</SelectItem>
                <SelectItem value="outbound">{language === 'en' ? 'Stock Out' : 'Keluar'}</SelectItem>
                <SelectItem value="adjustment">{language === 'en' ? 'Adjustment' : 'Penyesuaian'}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder={language === 'en' ? 'From Date' : 'Dari Tanggal'}
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder={language === 'en' ? 'To Date' : 'Sampai Tanggal'}
            />
          </div>
          <div className="mt-4">
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder={language === 'en' ? 'All Products' : 'Semua Produk'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Products' : 'Semua Produk'}</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
                <TableHead>{language === 'en' ? 'Date/Time' : 'Tanggal/Waktu'}</TableHead>
                <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>{language === 'en' ? 'Type' : 'Tipe'}</TableHead>
                <TableHead className="text-right">{language === 'en' ? 'Quantity' : 'Kuantitas'}</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>{language === 'en' ? 'Reference' : 'Referensi'}</TableHead>
                <TableHead>{language === 'en' ? 'Notes' : 'Catatan'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {language === 'en' ? 'No transactions found' : 'Tidak ada transaksi ditemukan'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {formatDateTime(tx.created_at)}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{tx.product?.name || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{tx.product?.sku || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(tx.transaction_type)}
                        {getTypeBadge(tx.transaction_type)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={
                        tx.transaction_type === 'inbound' ? 'text-success' :
                        tx.transaction_type === 'outbound' ? 'text-destructive' :
                        tx.quantity >= 0 ? 'text-success' : 'text-destructive'
                      }>
                        {tx.transaction_type === 'inbound' ? '+' : tx.transaction_type === 'outbound' ? '-' : tx.quantity >= 0 ? '+' : ''}
                        {Math.abs(tx.quantity)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{tx.batch?.batch_no || '-'}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {getReferenceTypeBadge(tx.reference_type)}
                        {tx.reference_number && (
                          <p className="text-xs text-muted-foreground">{tx.reference_number}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {tx.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground text-center">
        {language === 'en' 
          ? `Showing ${filteredTransactions.length} of ${transactions.length} transactions`
          : `Menampilkan ${filteredTransactions.length} dari ${transactions.length} transaksi`}
      </div>
    </div>
  );
}
