import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, FileText, Printer, Download, Eye, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { toast } from "sonner";
import { DeliveryOrderPdf, DeliveryOrderData } from "@/components/delivery/DeliveryOrderPdf";
import { usePagination } from "@/hooks/usePagination";
import { DataTablePagination } from "@/components/DataTablePagination";

interface StockOutRow {
  id: string;
  stock_out_number: string;
  delivery_date: string;
  delivery_actual_date: string | null;
  delivery_number: string | null;
  notes: string | null;
  created_at: string | null;
  sales_order_id: string;
  // Joined data
  so_number: string;
  customer_name: string;
  customer_po: string;
  customer_address: string | null;
  project_instansi: string;
  ship_to_address: string | null;
  sales_name: string;
  item_count: number;
}

export default function DeliveryOrder() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [stockOuts, setStockOuts] = useState<StockOutRow[]>([]);
  const [search, setSearch] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [selectedDO, setSelectedDO] = useState<DeliveryOrderData | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [loadingDO, setLoadingDO] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch stock outs with SO and customer info
      const { data: soHeaders, error: soErr } = await supabase
        .from("stock_out_headers")
        .select(`
          id, stock_out_number, delivery_date, delivery_actual_date, delivery_number, notes, created_at, sales_order_id,
          sales_order_headers!inner(
            sales_order_number, customer_po_number, project_instansi, sales_name, ship_to_address,
            customers!inner(name, address)
          )
        `)
        .order("created_at", { ascending: false });

      if (soErr) throw soErr;

      const rows: StockOutRow[] = (soHeaders || []).map((so: any) => {
        const soh = so.sales_order_headers;
        return {
          id: so.id,
          stock_out_number: so.stock_out_number,
          delivery_date: so.delivery_date,
          delivery_actual_date: so.delivery_actual_date,
          delivery_number: so.delivery_number,
          notes: so.notes,
          created_at: so.created_at,
          sales_order_id: so.sales_order_id,
          so_number: soh?.sales_order_number || '-',
          customer_name: soh?.customers?.name || '-',
          customer_po: soh?.customer_po_number || '-',
          customer_address: soh?.customers?.address || null,
          project_instansi: soh?.project_instansi || '-',
          ship_to_address: soh?.ship_to_address || null,
          sales_name: soh?.sales_name || '-',
          item_count: 0,
        };
      });

      setStockOuts(rows);

      // Fetch unique customers for filter
      const uniqueCustomers = Array.from(
        new Map(rows.map(r => [r.customer_name, { id: r.customer_name, name: r.customer_name }])).values()
      );
      setCustomers(uniqueCustomers);
    } catch (err: any) {
      toast.error("Gagal memuat data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    return stockOuts.filter(so => {
      const matchSearch = !search || 
        so.stock_out_number.toLowerCase().includes(search.toLowerCase()) ||
        so.delivery_number?.toLowerCase().includes(search.toLowerCase()) ||
        so.so_number.toLowerCase().includes(search.toLowerCase()) ||
        so.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        so.customer_po.toLowerCase().includes(search.toLowerCase());
      const matchCustomer = filterCustomer === "all" || so.customer_name === filterCustomer;
      return matchSearch && matchCustomer;
    });
  }, [stockOuts, search, filterCustomer]);

  const { currentPage, pageSize, totalPages, paginatedData, setCurrentPage, setPageSize } = usePagination(filtered, { defaultPageSize: 20 });

  const handleViewDO = async (row: StockOutRow) => {
    setLoadingDO(row.id);
    try {
      // Fetch items with product and batch details
      const { data: items, error } = await supabase
        .from("stock_out_items")
        .select(`
          id, qty_out,
          products!inner(name, sku, unit_id, units(name)),
          inventory_batches!inner(batch_no, expired_date)
        `)
        .eq("stock_out_id", row.id);

      if (error) throw error;

      const doData: DeliveryOrderData = {
        id: row.id,
        delivery_number: row.delivery_number,
        stock_out_number: row.stock_out_number,
        delivery_date: row.delivery_date,
        delivery_actual_date: row.delivery_actual_date,
        notes: row.notes,
        sales_order_number: row.so_number,
        customer_name: row.customer_name,
        customer_po_number: row.customer_po,
        customer_address: row.customer_address,
        project_instansi: row.project_instansi,
        ship_to_address: row.ship_to_address,
        sales_name: row.sales_name,
        items: (items || []).map((it: any) => ({
          id: it.id,
          product_name: it.products?.name || '-',
          sku: it.products?.sku || null,
          qty_out: it.qty_out,
          batch_no: it.inventory_batches?.batch_no || '-',
          expired_date: it.inventory_batches?.expired_date || null,
          unit_name: it.products?.units?.name || null,
        })),
      };

      setSelectedDO(doData);
      setPdfOpen(true);
    } catch (err: any) {
      toast.error("Gagal memuat detail DO: " + err.message);
    } finally {
      setLoadingDO(null);
    }
  };

  const formatDate = (d: string) => format(new Date(d), 'dd MMM yyyy', { locale: localeId });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Delivery Order</h1>
          <p className="text-sm text-muted-foreground">Kelola dan cetak surat jalan pengiriman</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari No. DO, No. SO, Customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Semua Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Customer</SelectItem>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Belum ada Delivery Order</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">No</TableHead>
                      <TableHead>No. DO</TableHead>
                      <TableHead>No. SO</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>PO Customer</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((row, idx) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground">
                          {(pagination.currentPage - 1) * pagination.pageSize + idx + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.delivery_number || row.stock_out_number}
                          {row.delivery_number && row.delivery_number !== row.stock_out_number && (
                            <span className="text-[10px] text-muted-foreground block">
                              SO: {row.stock_out_number}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{row.so_number}</TableCell>
                        <TableCell className="font-medium">{row.customer_name}</TableCell>
                        <TableCell>{row.customer_po}</TableCell>
                        <TableCell>
                          {formatDate(row.delivery_actual_date || row.delivery_date)}
                          {row.delivery_actual_date && row.delivery_actual_date !== row.delivery_date && (
                            <span className="text-[10px] text-muted-foreground block">
                              Rencana: {formatDate(row.delivery_date)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleViewDO(row)}
                              disabled={loadingDO === row.id}
                            >
                              {loadingDO === row.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              Lihat DO
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <DataTablePagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  pageSize={pagination.pageSize}
                  totalItems={filtered.length}
                  onPageChange={pagination.goToPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <DeliveryOrderPdf
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        data={selectedDO}
      />
    </div>
  );
}
