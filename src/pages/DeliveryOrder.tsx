import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Search, FileText, Eye, RefreshCw, CheckCircle, Clock, PenLine, Printer } from "lucide-react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { toast } from "sonner";
import { DeliveryOrderPdf, DeliveryOrderData } from "@/components/delivery/DeliveryOrderPdf";
import { usePagination } from "@/hooks/usePagination";
import { DataTablePagination } from "@/components/DataTablePagination";
import { sendApprovalPushNotification } from "@/lib/pushNotifications";

interface DORow {
  id: string;
  do_number: string;
  stock_out_id: string;
  sales_order_id: string;
  created_at: string;
  // joined
  stock_out_number: string;
  delivery_date: string;
  delivery_actual_date: string | null;
  delivery_number: string | null;
  so_notes: string | null;
  so_number: string;
  customer_name: string;
  customer_po: string;
  customer_address: string | null;
  project_instansi: string;
  ship_to_address: string | null;
  sales_name: string;
  customer_pic: string | null;
  customer_phone: string | null;
  status: 'pending' | 'released';
  signed_by: string | null;
  signed_at: string | null;
  signer_name: string | null;
}

export default function DeliveryOrder() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DORow[]>([]);
  const [search, setSearch] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [customers, setCustomers] = useState<string[]>([]);
  const [selectedDO, setSelectedDO] = useState<DeliveryOrderData | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [loadingDO, setLoadingDO] = useState<string | null>(null);
  const [signTarget, setSignTarget] = useState<DORow | null>(null);
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [signingDO, setSigningDO] = useState(false);

  const role = user?.role;
  const hasRole = (roles: string[]) => !!role && roles.includes(role);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("delivery_orders")
        .select(`
          id, do_number, stock_out_id, sales_order_id, created_at, status, signed_by, signed_at,
          stock_out_headers!inner(
            stock_out_number, delivery_date, delivery_actual_date, delivery_number, notes
          ),
          sales_order_headers!inner(
            sales_order_number, customer_po_number, project_instansi, sales_name, ship_to_address,
            customers!inner(name, address, pic, phone)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const signerIds = Array.from(
        new Set((data || []).map((d: any) => d.signed_by).filter(Boolean))
      );
      const signerMap: Record<string, string> = {};
      if (signerIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", signerIds);
        (profs || []).forEach((p: any) => { signerMap[p.id] = p.full_name; });
      }

      const mapped: DORow[] = (data || []).map((d: any) => {
        const so = d.stock_out_headers;
        const soh = d.sales_order_headers;
        return {
          id: d.id,
          do_number: d.do_number,
          stock_out_id: d.stock_out_id,
          sales_order_id: d.sales_order_id,
          created_at: d.created_at,
          stock_out_number: so?.stock_out_number || '-',
          delivery_date: so?.delivery_date || '',
          delivery_actual_date: so?.delivery_actual_date || null,
          delivery_number: so?.delivery_number || null,
          so_notes: so?.notes || null,
          so_number: soh?.sales_order_number || '-',
          customer_name: soh?.customers?.name || '-',
          customer_po: soh?.customer_po_number || '-',
          customer_address: soh?.customers?.address || null,
          project_instansi: soh?.project_instansi || '-',
          ship_to_address: soh?.ship_to_address || null,
          sales_name: soh?.sales_name || '-',
          customer_pic: soh?.customers?.pic || null,
          customer_phone: soh?.customers?.phone || null,
          status: (d.status === 'pending' ? 'pending' : 'released') as 'pending' | 'released',
          signed_by: d.signed_by || null,
          signed_at: d.signed_at || null,
          signer_name: d.signed_by ? (signerMap[d.signed_by] || null) : null,
        };
      });

      setRows(mapped);
      setCustomers(Array.from(new Set(mapped.map(r => r.customer_name))));
    } catch (err: any) {
      toast.error("Gagal memuat data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Realtime sync status DO
  useEffect(() => {
    const channel = supabase
      .channel('delivery-orders-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'delivery_orders',
      }, () => { fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSignRelease = (row: DORow) => {
    setSignTarget(row);
    setShowSignConfirm(true);
  };

  const confirmSignRelease = async () => {
    if (!signTarget) return;
    setSigningDO(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const { error } = await supabase
        .from('delivery_orders')
        .update({
          status: 'released',
          signed_by: userId,
          signed_at: new Date().toISOString(),
        })
        .eq('id', signTarget.id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: userId,
        user_email: userData.user?.email,
        action: 'RELEASE_DO',
        module: 'Delivery Order',
        ref_table: 'delivery_orders',
        ref_id: signTarget.id,
        ref_no: signTarget.do_number,
        new_data: { do_number: signTarget.do_number, status: 'released' },
      });

      await sendApprovalPushNotification({
        title: '🚚 DO Siap Diprint',
        body: `DO ${signTarget.do_number} sudah di-release oleh Finance. Silakan print.`,
        data: {
          tag: 'do-released',
          link: '/delivery-order',
          do_number: signTarget.do_number,
        },
        targetRoles: ['warehouse', 'sales', 'super_admin', 'admin'],
        excludeUserId: userId,
      });

      toast.success(`DO ${signTarget.do_number} berhasil di-release!`);
      setShowSignConfirm(false);
      setSignTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Gagal release DO');
    }
    setSigningDO(false);
  };

  const handlePrintDO = async (row: DORow) => {
    if (row.status !== 'released') {
      toast.warning('DO belum di-release oleh Finance');
      return;
    }
    await handleViewDO(row);
  };

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const matchSearch = !search ||
        (r.do_number || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.stock_out_number || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.so_number || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.customer_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.customer_po || "").toLowerCase().includes(search.toLowerCase());
      const matchCustomer = filterCustomer === "all" || r.customer_name === filterCustomer;
      return matchSearch && matchCustomer;
    });
  }, [rows, search, filterCustomer]);

  const { currentPage, pageSize, totalPages, paginatedData, setCurrentPage, setPageSize } = usePagination(filtered, { defaultPageSize: 20 });

  const handleViewDO = async (row: DORow) => {
    setLoadingDO(row.id);
    try {
      const { data: items, error } = await supabase
        .from("stock_out_items")
        .select(`
          id, qty_out,
          products!inner(name, sku, unit_id, units(name)),
          inventory_batches!inner(batch_no, expired_date)
        `)
        .eq("stock_out_id", row.stock_out_id);

      if (error) throw error;

      // Fetch TTD Finance jika DO sudah released
      let signerSignatureUrl: string | null = null;
      if (row.signed_by) {
        const { data: sig } = await supabase
          .from('user_signatures')
          .select('signature_path')
          .eq('user_id', row.signed_by)
          .maybeSingle();
        if (sig?.signature_path) {
          const { data: urlData } = await supabase.storage
            .from('signatures')
            .createSignedUrl(sig.signature_path, 3600);
          signerSignatureUrl = urlData?.signedUrl || null;
        }
      }

      // Extract date from DO number (DO/YYYYMMDD.XX) for accurate DO date
      const doDateMatch = row.do_number.match(/(\d{4})(\d{2})(\d{2})/);
      const doDateStr = doDateMatch
        ? `${doDateMatch[1]}-${doDateMatch[2]}-${doDateMatch[3]}`
        : row.delivery_actual_date || row.delivery_date;

      const doData: DeliveryOrderData = {
        id: row.id,
        delivery_number: row.do_number,
        stock_out_number: row.stock_out_number,
        delivery_date: doDateStr,
        delivery_actual_date: row.delivery_actual_date || doDateStr,
        notes: row.so_notes,
        sales_order_number: row.so_number,
        customer_name: row.customer_name,
        customer_po_number: row.customer_po,
        customer_address: row.customer_address,
        project_instansi: row.project_instansi,
        ship_to_address: row.ship_to_address,
        sales_name: row.sales_name,
        customer_pic: row.customer_pic || null,
        customer_phone: row.customer_phone || null,
        status: row.status,
        signed_by: row.signed_by,
        signed_at: row.signed_at,
        signer_name: row.signer_name,
        signer_signature_url: signerSignatureUrl,
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

  const formatDate = (d: string) => {
    if (!d) return '-';
    return format(new Date(d), 'dd MMM yyyy', { locale: localeId });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Delivery Order</h1>
          <p className="text-sm text-muted-foreground">Daftar surat jalan yang telah diterbitkan dari Kanban</p>
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
                  <SelectItem key={c} value={c}>{c}</SelectItem>
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
              <p>Belum ada Delivery Order yang diterbitkan</p>
              <p className="text-xs mt-1">Klik "Generate DO" di kartu Kanban untuk menerbitkan DO</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">No</TableHead>
                      <TableHead>No. DO</TableHead>
                      <TableHead>No. Stock Out</TableHead>
                      <TableHead>No. SO</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>PO Customer</TableHead>
                      <TableHead>Tanggal Generate</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((row, idx) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground">
                          {(currentPage - 1) * pageSize + idx + 1}
                        </TableCell>
                        <TableCell className="font-bold text-primary">{row.do_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.stock_out_number}</TableCell>
                        <TableCell>{row.so_number}</TableCell>
                        <TableCell className="font-medium">{row.customer_name}</TableCell>
                        <TableCell>{row.customer_po}</TableCell>
                        <TableCell>{formatDate(row.created_at)}</TableCell>
                        <TableCell className="text-center">
                          {row.status === 'released' ? (
                            <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Released
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-400 gap-1">
                              <Clock className="w-3 h-3" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {hasRole(['finance', 'admin', 'super_admin']) && row.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 text-amber-600 border-amber-400 hover:bg-amber-50"
                                onClick={() => handleSignRelease(row)}
                              >
                                <PenLine className="h-3 w-3" />
                                Sign & Release
                              </Button>
                            )}
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
                            {hasRole(['warehouse', 'admin', 'super_admin', 'finance', 'sales']) && row.status === 'released' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 text-green-700 border-green-400 hover:bg-green-50"
                                onClick={() => handlePrintDO(row)}
                                disabled={loadingDO === row.id}
                              >
                                <Printer className="h-3 w-3" />
                                Print
                              </Button>
                            )}
                            {hasRole(['warehouse']) && row.status === 'pending' && (
                              <span className="text-xs text-muted-foreground italic">
                                Menunggu Finance
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <DataTablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
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

      <AlertDialog open={showSignConfirm} onOpenChange={setShowSignConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PenLine className="w-5 h-5 text-amber-500" />
              Sign &amp; Release Delivery Order
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Anda akan men-sign dan me-release DO berikut:</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  <p className="font-semibold text-foreground text-base">{signTarget?.do_number}</p>
                  <p className="text-sm">Customer: {signTarget?.customer_name}</p>
                  <p className="text-sm">SO: {signTarget?.so_number}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
                  <p className="font-medium mb-1">⚠️ Setelah di-release:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>TTD Anda akan otomatis muncul di PDF DO</li>
                    <li>Warehouse akan mendapat notifikasi</li>
                    <li>DO bisa langsung diprint oleh Warehouse</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingDO}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmSignRelease(); }}
              disabled={signingDO}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {signingDO ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <PenLine className="w-4 h-4 mr-2" />
              )}
              Ya, Sign &amp; Release
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
