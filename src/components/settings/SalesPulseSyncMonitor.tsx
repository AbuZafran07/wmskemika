import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, RefreshCw, Search, Wifi } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTablePagination } from '@/components/DataTablePagination';
import { toast } from 'sonner';

type SyncLogRow = {
  id: string;
  created_at: string;
  direction: string;
  endpoint: string;
  error_message: string | null;
  http_method: string;
  reference_number: string | null;
  request_payload: unknown;
  response_payload: unknown;
  retry_count: number;
  sales_order_id: string | null;
  status: string;
  status_code: number | null;
  triggered_by: string | null;
};

type StatusFilter = 'all' | 'success' | 'error' | 'pending';
type EndpointFilter = 'all' | 'customer' | 'product' | 'sales_order';

const ENDPOINT_MAP: Record<Exclude<EndpointFilter, 'all'>, string> = {
  customer: '/wms-customer-upsert',
  product: '/wms-product-upsert',
  sales_order: '/wms-so-approved',
};

const getStatusBadge = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'success' || normalized === 'ok') return 'success' as const;
  if (normalized === 'pending') return 'pending' as const;
  if (normalized === 'error' || normalized === 'failed') return 'destructive' as const;
  return 'secondary' as const;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatPayload = (payload: unknown) => {
  if (!payload) return '-';
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
};

export default function SalesPulseSyncMonitor() {
  const [logs, setLogs] = useState<SyncLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [endpointFilter, setEndpointFilter] = useState<EndpointFilter>('all');
  const [selectedLog, setSelectedLog] = useState<SyncLogRow | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  const endpointValue = useMemo(
    () => (endpointFilter === 'all' ? null : ENDPOINT_MAP[endpointFilter]),
    [endpointFilter],
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales_pulse_sync_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (endpointValue) {
        query = query.eq('endpoint', endpointValue);
      }

      const keyword = search.trim();
      if (keyword) {
        const safeKeyword = keyword.replace(/[% ,]/g, ' ').trim();
        query = query.or(
          `reference_number.ilike.%${safeKeyword}%,endpoint.ilike.%${safeKeyword}%,status.ilike.%${safeKeyword}%,error_message.ilike.%${safeKeyword}%`,
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setLogs((data || []) as SyncLogRow[]);
      setTotalItems(count || 0);
    } catch (error) {
      console.error('Error fetching Sales Pulse sync logs:', error);
      toast.error('Gagal memuat log Sales Pulse');
    } finally {
      setLoading(false);
    }
  }, [endpointValue, page, pageSize, search, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, endpointFilter]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Monitor Log Sales Pulse</CardTitle>
                <CardDescription>
                  Pantau sinkronisasi customer, product, dan sales order dari WMS.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" onClick={fetchLogs} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_220px_220px]">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari referensi, endpoint, status, atau error..."
              icon={<Search className="h-4 w-4" />}
            />

            <Select value={endpointFilter} onValueChange={(value) => setEndpointFilter(value as EndpointFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Semua endpoint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua endpoint</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="sales_order">Sales Order</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referensi</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Retry</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat log sinkronisasi...
                      </div>
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      Belum ada log yang cocok.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(log.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{log.direction.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{log.endpoint}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadge(log.status)} className="uppercase">{log.status}</Badge>
                      </TableCell>
                      <TableCell>{log.reference_number || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{log.http_method}</Badge>
                      </TableCell>
                      <TableCell>{log.retry_count}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <DataTablePagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Log Sales Pulse</DialogTitle>
            <DialogDescription>
              Detail request dan response sinkronisasi untuk endpoint {selectedLog?.endpoint || '-'}.
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={getStatusBadge(selectedLog.status)} className="mt-2 uppercase">
                    {selectedLog.status}
                  </Badge>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Status Code</p>
                  <p className="mt-2 text-sm font-medium">{selectedLog.status_code ?? '-'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Referensi</p>
                  <p className="mt-2 text-sm font-medium break-all">{selectedLog.reference_number || '-'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Waktu</p>
                  <p className="mt-2 text-sm font-medium">{formatDateTime(selectedLog.created_at)}</p>
                </div>
              </div>

              {selectedLog.error_message && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {selectedLog.error_message}
                  </p>
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Request Payload</p>
                  </div>
                  <pre className="overflow-x-auto p-4 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {formatPayload(selectedLog.request_payload)}
                  </pre>
                </div>

                <div className="rounded-lg border">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Response Payload</p>
                  </div>
                  <pre className="overflow-x-auto p-4 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {formatPayload(selectedLog.response_payload)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}