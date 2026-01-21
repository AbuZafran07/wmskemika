import React, { useState, useEffect } from 'react';
import { Search, Download, CalendarIcon, ArrowUpFromLine, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/DataTablePagination';

interface StockOutRecord {
  id: string;
  stock_out_number: string;
  delivery_date: string;
  sales_order: {
    sales_order_number: string;
    customer: { name: string } | null;
  } | null;
  items: {
    id: string;
    qty_out: number;
    batch: { batch_no: string; expired_date: string | null } | null;
    product: { name: string; sku: string | null } | null;
  }[];
}

export default function OutboundReport() {
  const { language } = useLanguage();
  const { canUpload } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<StockOutRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_out_headers')
      .select(`
        id, stock_out_number, delivery_date,
        sales_order:sales_order_headers(
          sales_order_number,
          customer:customers(name)
        ),
        items:stock_out_items(
          id, qty_out,
          batch:inventory_batches(batch_no, expired_date),
          product:products(name, sku)
        )
      `)
      .order('delivery_date', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  const filteredRecords = records.filter(record => {
    const matchesSearch = 
      record.stock_out_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.sales_order?.sales_order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.sales_order?.customer?.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const recordDate = new Date(record.delivery_date);
    const matchesDateFrom = !dateFrom || recordDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || recordDate <= new Date(dateTo);
    
    return matchesSearch && matchesDateFrom && matchesDateTo;
  });

  // Pagination
  const {
    currentPage,
    pageSize,
    totalPages,
    paginatedData: paginatedRecords,
    setCurrentPage,
    setPageSize,
  } = usePagination(filteredRecords);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = dateFrom || dateTo;

  const totalQtyOut = filteredRecords.reduce(
    (sum, r) => sum + r.items.reduce((s, i) => s + i.qty_out, 0),
    0
  );

  const handleExportCSV = () => {
    const headers = ['Delivery No', 'Date', 'Sales Order', 'Customer', 'Product', 'SKU', 'Qty Out', 'Batch No', 'Expiry Date'];
    const rows: string[][] = [];

    filteredRecords.forEach(record => {
      record.items.forEach(item => {
        rows.push([
          record.stock_out_number,
          formatDate(record.delivery_date),
          record.sales_order?.sales_order_number || '',
          record.sales_order?.customer?.name || '',
          item.product?.name || '',
          item.product?.sku || '',
          item.qty_out.toString(),
          item.batch?.batch_no || '',
          item.batch?.expired_date ? formatDate(item.batch.expired_date) : '',
        ]);
      });
    });

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `outbound-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-info/10 rounded-lg">
            <ArrowUpFromLine className="w-6 h-6 text-info" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {language === 'en' ? 'Outbound Report' : 'Laporan Pengiriman'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {language === 'en' ? 'View and export outbound transaction history' : 'Lihat dan ekspor riwayat transaksi pengiriman'}
            </p>
          </div>
        </div>
        {canUpload('report') && (
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Export CSV' : 'Ekspor CSV'}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Transactions' : 'Total Transaksi'}</p>
            <p className="text-2xl font-bold">{filteredRecords.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Items' : 'Total Item'}</p>
            <p className="text-2xl font-bold">{filteredRecords.reduce((sum, r) => sum + r.items.length, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Qty Out' : 'Total Qty Keluar'}</p>
            <p className="text-2xl font-bold text-info">{totalQtyOut.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search by stock out no, SO, or customer...' : 'Cari berdasarkan no stock out, SO, atau customer...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {language === 'en' ? 'Date Range' : 'Rentang Tanggal'}
                  {hasActiveFilters && <Badge variant="secondary" className="ml-1">1</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'From Date' : 'Dari Tanggal'}</Label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'To Date' : 'Sampai Tanggal'}</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                      {language === 'en' ? 'Clear Filters' : 'Hapus Filter'}
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'en' ? 'Delivery No' : 'No. Pengiriman'}</TableHead>
                  <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                  <TableHead>{language === 'en' ? 'Sales Order' : 'Sales Order'}</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                  <TableHead className="text-center">{language === 'en' ? 'Qty' : 'Qty'}</TableHead>
                  <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                  <TableHead>{language === 'en' ? 'Expiry' : 'Kadaluarsa'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No outbound records found' : 'Tidak ada data pengiriman'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRecords.flatMap((record) =>
                    record.items.map((item, idx) => (
                      <TableRow key={`${record.id}-${item.id}`}>
                        {idx === 0 ? (
                          <>
                            <TableCell rowSpan={record.items.length} className="font-medium align-top">
                              {record.stock_out_number}
                            </TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">
                              {formatDate(record.delivery_date)}
                            </TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">
                              {record.sales_order?.sales_order_number}
                            </TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">
                              {record.sales_order?.customer?.name}
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell>{item.product?.name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="info">{item.qty_out}</Badge>
                        </TableCell>
                        <TableCell>{item.batch?.batch_no || '-'}</TableCell>
                        <TableCell>{item.batch?.expired_date ? formatDate(item.batch.expired_date) : '-'}</TableCell>
                      </TableRow>
                    ))
                  )
                )}
              </TableBody>
            </Table>
          )}
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredRecords.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}