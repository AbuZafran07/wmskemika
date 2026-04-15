import { useState, useEffect } from 'react';
import { Search, Download, ArrowDownToLine, CalendarIcon, Loader2, MoreHorizontal, Eye, Printer, FileText, FileSpreadsheet } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/DataTablePagination';
import { InboundDetailModal } from '@/components/reports/InboundDetailModal';
import { InboundPdfPreview } from '@/components/reports/InboundPdfPreview';
import { InboundBulkPdfPreview } from '@/components/reports/InboundBulkPdfPreview';
import { exportToXlsx } from '@/lib/xlsxExport';

interface StockInRecord {
  id: string;
  stock_in_number: string;
  received_date: string;
  plan_order: {
    plan_number: string;
    supplier: { name: string } | null;
  } | null;
  items: {
    id: string;
    qty_received: number;
    batch_no: string;
    expired_date: string | null;
    product: { name: string; sku: string | null } | null;
    plan_order_item: { planned_qty: number } | null;
  }[];
  created_by_email?: string;
}

export default function InboundReport() {
  const { language } = useLanguage();
  const { canUpload } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<StockInRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('__all__');

  const [selectedInbound, setSelectedInbound] = useState<StockInRecord | null>(null);
  const [isInboundDetailOpen, setIsInboundDetailOpen] = useState(false);
  const [isInboundPdfPreviewOpen, setIsInboundPdfPreviewOpen] = useState(false);
  const [isBulkPdfOpen, setIsBulkPdfOpen] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_in_headers')
      .select(`
        id, stock_in_number, received_date,
        plan_order:plan_order_headers(
          plan_number,
          supplier:suppliers(name)
        ),
        items:stock_in_items(
          id, qty_received, batch_no, expired_date,
          product:products(name, sku)
        )
      `)
      .order('received_date', { ascending: false });

    if (error) console.error(error);
    else setRecords(data || []);
    setLoading(false);
  };

  const uniqueSuppliers = Array.from(
    new Set(records.map(r => r.plan_order?.supplier?.name).filter(Boolean) as string[])
  ).sort();

  const filteredRecords = records.filter(record => {
    const matchesSearch =
      record.stock_in_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.plan_order?.plan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.plan_order?.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProduct = !productFilter ||
      record.items.some(item => item.product?.name?.toLowerCase().includes(productFilter.toLowerCase()));

    const matchesSupplier = supplierFilter === '__all__' ||
      record.plan_order?.supplier?.name === supplierFilter;

    const recordDate = new Date(record.received_date);
    const matchesDateFrom = !dateFrom || recordDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || recordDate <= new Date(dateTo);

    return matchesSearch && matchesProduct && matchesSupplier && matchesDateFrom && matchesDateTo;
  });

  const {
    currentPage, pageSize, totalPages,
    paginatedData: paginatedRecords,
    setCurrentPage, setPageSize,
  } = usePagination(filteredRecords);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const clearFilters = () => {
    setDateFrom(''); setDateTo(''); setProductFilter(''); setSupplierFilter('__all__'); setSearchQuery('');
  };

  const hasActiveFilters = dateFrom || dateTo || productFilter || supplierFilter !== '__all__';
  const activeFilterCount = [dateFrom || dateTo, productFilter, supplierFilter !== '__all__'].filter(Boolean).length;

  const totalQtyReceived = filteredRecords.reduce(
    (sum, r) => sum + r.items.reduce((s, i) => s + i.qty_received, 0), 0
  );

  const getExportRows = () => {
    const rows: Record<string, any>[] = [];
    filteredRecords.forEach(record => {
      record.items.forEach(item => {
        rows.push({
          stock_in_no: record.stock_in_number,
          date: formatDate(record.received_date),
          plan_order: record.plan_order?.plan_number || '',
          supplier: record.plan_order?.supplier?.name || '',
          product: item.product?.name || '',
          sku: item.product?.sku || '',
          qty: item.qty_received,
          batch: item.batch_no,
          expiry: item.expired_date ? formatDate(item.expired_date) : '',
        });
      });
    });
    return rows;
  };

  const exportColumns = [
    { header: 'Stock In No', key: 'stock_in_no', width: 20 },
    { header: 'Tanggal', key: 'date', width: 14 },
    { header: 'Plan Order', key: 'plan_order', width: 20 },
    { header: 'Supplier', key: 'supplier', width: 22 },
    { header: 'Produk', key: 'product', width: 25 },
    { header: 'SKU', key: 'sku', width: 15 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Batch No', key: 'batch', width: 15 },
    { header: 'Expiry', key: 'expiry', width: 14 },
  ];

  const handleExportCSV = () => {
    const rows = getExportRows();
    const headers = exportColumns.map(c => c.header);
    const csvRows = rows.map(row => exportColumns.map(c => `"${row[c.key]}"`).join(','));
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inbound-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportXlsx = () => {
    exportToXlsx(getExportRows(), exportColumns, `inbound-report-${new Date().toISOString().split('T')[0]}.xlsx`, 'Inbound Report');
  };

  const getFilterDescription = () => {
    const parts: string[] = [];
    if (supplierFilter !== '__all__') parts.push(`Supplier: ${supplierFilter}`);
    if (productFilter) parts.push(`Produk: ${productFilter}`);
    if (dateFrom) parts.push(`Dari: ${formatDate(dateFrom)}`);
    if (dateTo) parts.push(`Sampai: ${formatDate(dateTo)}`);
    if (searchQuery) parts.push(`Pencarian: ${searchQuery}`);
    return parts.length > 0 ? parts.join(' | ') : 'Semua Data';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-success/10 rounded-lg">
            <ArrowDownToLine className="w-6 h-6 text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {language === 'en' ? 'Inbound Report' : 'Laporan Penerimaan'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {language === 'en' ? 'View and export inbound transaction history' : 'Lihat dan ekspor riwayat transaksi penerimaan'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsBulkPdfOpen(true)} variant="outline" disabled={filteredRecords.length === 0}>
            <FileText className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Print Report' : 'Cetak Report'}
            {filteredRecords.length > 0 && <Badge variant="secondary" className="ml-2">{filteredRecords.length}</Badge>}
          </Button>
          {canUpload('report') && (
            <>
              <Button onClick={handleExportXlsx} variant="outline">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
              <Button onClick={handleExportCSV} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Transactions' : 'Total Transaksi'}</p>
          <p className="text-2xl font-bold">{filteredRecords.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Items' : 'Total Item'}</p>
          <p className="text-2xl font-bold">{filteredRecords.reduce((sum, r) => sum + r.items.length, 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Qty Received' : 'Total Qty Diterima'}</p>
          <p className="text-2xl font-bold text-success">{totalQtyReceived.toLocaleString()}</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder={language === 'en' ? 'Search by stock in no, PO, or supplier...' : 'Cari berdasarkan no stock in, PO, atau supplier...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder={language === 'en' ? 'Filter by product name...' : 'Filter nama barang...'}
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="sm:w-64">
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'All Suppliers' : 'Semua Supplier'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{language === 'en' ? 'All Suppliers' : 'Semua Supplier'}</SelectItem>
                    {uniqueSuppliers.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {language === 'en' ? 'Date Range' : 'Rentang Tanggal'}
                    {(dateFrom || dateTo) && <Badge variant="secondary" className="ml-1">1</Badge>}
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
                    {(dateFrom || dateTo) && (
                      <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }} className="w-full">
                        {language === 'en' ? 'Clear Date' : 'Hapus Tanggal'}
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  {language === 'en' ? 'Clear All Filters' : 'Hapus Semua Filter'}
                  <Badge variant="destructive" className="ml-2">{activeFilterCount}</Badge>
                </Button>
              )}
            </div>
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
                  <TableHead>{language === 'en' ? 'Stock In No' : 'No. Stock In'}</TableHead>
                  <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                  <TableHead>Plan Order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                  <TableHead>{language === 'en' ? 'Expiry' : 'Kadaluarsa'}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No inbound records found' : 'Tidak ada data penerimaan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRecords.flatMap((record) =>
                    record.items.map((item, idx) => (
                      <TableRow key={`${record.id}-${item.id}`}>
                        {idx === 0 ? (
                          <>
                            <TableCell rowSpan={record.items.length} className="font-medium align-top">{record.stock_in_number}</TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">{formatDate(record.received_date)}</TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">{record.plan_order?.plan_number}</TableCell>
                            <TableCell rowSpan={record.items.length} className="align-top">{record.plan_order?.supplier?.name}</TableCell>
                          </>
                        ) : null}
                        <TableCell>{item.product?.name}</TableCell>
                        <TableCell className="text-center"><Badge variant="success">{item.qty_received}</Badge></TableCell>
                        <TableCell>{item.batch_no}</TableCell>
                        <TableCell>{item.expired_date ? formatDate(item.expired_date) : '-'}</TableCell>
                        {idx === 0 ? (
                          <TableCell rowSpan={record.items.length} className="text-right align-top">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setSelectedInbound(record); setIsInboundDetailOpen(true); }}>
                                  <Eye className="w-4 h-4 mr-2" /> {language === 'en' ? 'View Detail' : 'Lihat Detail'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedInbound(record); setIsInboundPdfPreviewOpen(true); }}>
                                  <Printer className="w-4 h-4 mr-2" /> {language === 'en' ? 'Print PDF' : 'Cetak PDF'}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )
                )}
              </TableBody>
            </Table>
          )}
          <DataTablePagination
            currentPage={currentPage} totalPages={totalPages}
            pageSize={pageSize} totalItems={filteredRecords.length}
            onPageChange={setCurrentPage} onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>

      <InboundDetailModal open={isInboundDetailOpen} onOpenChange={setIsInboundDetailOpen} record={selectedInbound} />
      <InboundPdfPreview open={isInboundPdfPreviewOpen} onOpenChange={setIsInboundPdfPreviewOpen} record={selectedInbound} />
      <InboundBulkPdfPreview open={isBulkPdfOpen} onOpenChange={setIsBulkPdfOpen} records={filteredRecords} filterDescription={getFilterDescription()} />
    </div>
  );
}
