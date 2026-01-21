import React, { useState, useEffect } from 'react';
import { Package, Search, Filter, Download, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/DataTablePagination';

interface ProductStock {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  unit: string;
  min_stock: number;
  max_stock: number | null;
  total_qty: number;
  batches: BatchInfo[];
}

interface BatchInfo {
  id: string;
  batch_no: string;
  qty_on_hand: number;
  expired_date: string | null;
  is_expired: boolean;
  days_to_expire: number | null;
}

export default function StockReport() {
  const { language } = useLanguage();
  const { canUpload } = usePermissions();
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchStockData();
  }, []);

  const fetchStockData = async () => {
    setLoading(true);

    // Fetch products with their batches
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        id, name, sku, min_stock, max_stock,
        category:categories(name),
        unit:units(name)
      `)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name');

    if (productsError) {
      console.error(productsError);
      setLoading(false);
      return;
    }

    const { data: batches, error: batchesError } = await supabase
      .from('inventory_batches')
      .select('*')
      .order('expired_date', { ascending: true });

    if (batchesError) {
      console.error(batchesError);
      setLoading(false);
      return;
    }

    const today = new Date();
    
    const stockProducts: ProductStock[] = (products || []).map(product => {
      const productBatches = (batches || [])
        .filter(b => b.product_id === product.id && b.qty_on_hand > 0)
        .map(b => {
          const expDate = b.expired_date ? new Date(b.expired_date) : null;
          const isExpired = expDate ? expDate < today : false;
          const daysToExpire = expDate 
            ? Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) 
            : null;

          return {
            id: b.id,
            batch_no: b.batch_no,
            qty_on_hand: b.qty_on_hand,
            expired_date: b.expired_date,
            is_expired: isExpired,
            days_to_expire: daysToExpire,
          };
        });

      const totalQty = productBatches.reduce((sum, b) => sum + b.qty_on_hand, 0);

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: (product.category as { name: string } | null)?.name || '-',
        unit: (product.unit as { name: string } | null)?.name || '-',
        min_stock: product.min_stock || 0,
        max_stock: product.max_stock,
        total_qty: totalQty,
        batches: productBatches,
      };
    });

    setStockData(stockProducts);
    setLoading(false);
  };

  const getStockStatus = (product: ProductStock) => {
    if (product.total_qty === 0) return 'out_of_stock';
    if (product.total_qty <= product.min_stock) return 'low_stock';
    if (product.max_stock && product.total_qty >= product.max_stock) return 'overstock';
    return 'normal';
  };

  const getExpiryStatus = (batch: BatchInfo) => {
    if (batch.is_expired) return 'expired';
    if (batch.days_to_expire !== null && batch.days_to_expire <= 30) return 'expiring_soon';
    return 'normal';
  };

  const filteredData = stockData.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.sku || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;
    
    const status = getStockStatus(product);
    const hasExpiring = product.batches.some(b => 
      b.is_expired || (b.days_to_expire !== null && b.days_to_expire <= 30)
    );

    switch (filterStatus) {
      case 'low_stock': return status === 'low_stock';
      case 'out_of_stock': return status === 'out_of_stock';
      case 'overstock': return status === 'overstock';
      case 'expiring': return hasExpiring;
      default: return true;
    }
  });

  // Pagination
  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredData);

  const stats = {
    totalProducts: stockData.length,
    lowStock: stockData.filter(p => getStockStatus(p) === 'low_stock').length,
    outOfStock: stockData.filter(p => getStockStatus(p) === 'out_of_stock').length,
    expiringSoon: stockData.filter(p => 
      p.batches.some(b => b.days_to_expire !== null && b.days_to_expire <= 30 && !b.is_expired)
    ).length,
    expired: stockData.filter(p => p.batches.some(b => b.is_expired)).length,
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID');
  };

  const handleExport = () => {
    const csvContent = [
      ['SKU', 'Product Name', 'Category', 'Unit', 'Total Qty', 'Min Stock', 'Status', 'Batch', 'Batch Qty', 'Expiry Date'].join(','),
      ...filteredData.flatMap(product => 
        product.batches.length > 0
          ? product.batches.map((batch, idx) => 
              [
                idx === 0 ? `"${product.sku || ''}"` : '',
                idx === 0 ? `"${product.name}"` : '',
                idx === 0 ? `"${product.category}"` : '',
                idx === 0 ? `"${product.unit}"` : '',
                idx === 0 ? product.total_qty : '',
                idx === 0 ? product.min_stock : '',
                idx === 0 ? getStockStatus(product) : '',
                `"${batch.batch_no}"`,
                batch.qty_on_hand,
                batch.expired_date || '',
              ].join(',')
            )
          : [[
              `"${product.sku || ''}"`,
              `"${product.name}"`,
              `"${product.category}"`,
              `"${product.unit}"`,
              product.total_qty,
              product.min_stock,
              getStockStatus(product),
              '',
              '',
              '',
            ].join(',')]
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {language === 'en' ? 'Stock Report' : 'Laporan Stok'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {language === 'en' ? 'Current inventory levels, batch details, and expiry dates' : 'Level inventaris saat ini, detail batch, dan tanggal kadaluarsa'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchStockData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {canUpload('report') && (
            <Button size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Products' : 'Total Produk'}</p>
            <p className="text-2xl font-bold">{stats.totalProducts}</p>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4">
            <p className="text-sm text-warning">{language === 'en' ? 'Low Stock' : 'Stok Rendah'}</p>
            <p className="text-2xl font-bold text-warning">{stats.lowStock}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{language === 'en' ? 'Out of Stock' : 'Habis'}</p>
            <p className="text-2xl font-bold text-destructive">{stats.outOfStock}</p>
          </CardContent>
        </Card>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4">
            <p className="text-sm text-warning">{language === 'en' ? 'Expiring Soon' : 'Segera Kadaluarsa'}</p>
            <p className="text-2xl font-bold text-warning">{stats.expiringSoon}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{language === 'en' ? 'Expired' : 'Kadaluarsa'}</p>
            <p className="text-2xl font-bold text-destructive">{stats.expired}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search by product name or SKU...' : 'Cari berdasarkan nama produk atau SKU...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Status' : 'Semua Status'}</SelectItem>
                <SelectItem value="low_stock">{language === 'en' ? 'Low Stock' : 'Stok Rendah'}</SelectItem>
                <SelectItem value="out_of_stock">{language === 'en' ? 'Out of Stock' : 'Habis'}</SelectItem>
                <SelectItem value="overstock">{language === 'en' ? 'Overstock' : 'Kelebihan Stok'}</SelectItem>
                <SelectItem value="expiring">{language === 'en' ? 'Expiring/Expired' : 'Kadaluarsa'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stock Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {language === 'en' ? 'No products found' : 'Tidak ada produk ditemukan'}
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {paginatedData.map(product => {
                const status = getStockStatus(product);
                const hasExpiring = product.batches.some(b => 
                  b.is_expired || (b.days_to_expire !== null && b.days_to_expire <= 30)
                );

                return (
                  <AccordionItem key={product.id} value={product.id}>
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-medium text-left">{product.name}</p>
                            <p className="text-xs text-muted-foreground text-left">
                              {product.sku || '-'} | {product.category} | {product.unit}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold">{product.total_qty} {product.unit}</p>
                            <p className="text-xs text-muted-foreground">
                              Min: {product.min_stock}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {status === 'low_stock' && (
                              <Badge variant="pending">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {language === 'en' ? 'Low' : 'Rendah'}
                              </Badge>
                            )}
                            {status === 'out_of_stock' && (
                              <Badge variant="cancelled">
                                {language === 'en' ? 'Out' : 'Habis'}
                              </Badge>
                            )}
                            {status === 'normal' && (
                              <Badge variant="success">OK</Badge>
                            )}
                            {hasExpiring && (
                              <Badge variant="cancelled">
                                {language === 'en' ? 'Expiry!' : 'Kadaluarsa!'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      {product.batches.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">
                          {language === 'en' ? 'No batches available' : 'Tidak ada batch tersedia'}
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{language === 'en' ? 'Batch No.' : 'No. Batch'}</TableHead>
                              <TableHead className="text-right">{language === 'en' ? 'Qty on Hand' : 'Qty Tersedia'}</TableHead>
                              <TableHead>{language === 'en' ? 'Expiry Date' : 'Tgl Kadaluarsa'}</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {product.batches.map(batch => {
                              const expiryStatus = getExpiryStatus(batch);
                              return (
                                <TableRow key={batch.id}>
                                  <TableCell className="font-mono">{batch.batch_no}</TableCell>
                                  <TableCell className="text-right font-medium">{batch.qty_on_hand}</TableCell>
                                  <TableCell>{formatDate(batch.expired_date)}</TableCell>
                                  <TableCell className="text-center">
                                    {expiryStatus === 'expired' ? (
                                      <Badge variant="cancelled">{language === 'en' ? 'Expired' : 'Kadaluarsa'}</Badge>
                                    ) : expiryStatus === 'expiring_soon' ? (
                                      <Badge variant="pending">
                                        {language === 'en' ? `${batch.days_to_expire} days` : `${batch.days_to_expire} hari`}
                                      </Badge>
                                    ) : (
                                      <Badge variant="success">OK</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredData.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}
