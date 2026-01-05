import React, { useState, useEffect } from 'react';
import { Search, Filter, FileText, User, Clock, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuditLogEntry {
  id: string;
  action: string;
  module: string;
  ref_table: string | null;
  ref_id: string | null;
  ref_no: string | null;
  user_id: string | null;
  user_email: string | null;
  old_data: unknown;
  new_data: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Helper to safely cast to record
const asRecord = (data: unknown): Record<string, unknown> | null => {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
};

const moduleLabels: Record<string, { en: string; id: string }> = {
  plan_order: { en: 'Plan Order', id: 'Plan Order' },
  sales_order: { en: 'Sales Order', id: 'Sales Order' },
  stock_in: { en: 'Stock In', id: 'Penerimaan Stok' },
  stock_out: { en: 'Stock Out', id: 'Pengeluaran Stok' },
  stock_adjustment: { en: 'Stock Adjustment', id: 'Penyesuaian Stok' },
  product: { en: 'Product', id: 'Produk' },
  user_management: { en: 'User Management', id: 'Manajemen Pengguna' },
};

const actionLabels: Record<string, { en: string; id: string; color: 'default' | 'secondary' | 'success' | 'destructive' | 'pending' }> = {
  CREATE: { en: 'Created', id: 'Dibuat', color: 'success' },
  UPDATE: { en: 'Updated', id: 'Diperbarui', color: 'secondary' },
  DELETE: { en: 'Deleted', id: 'Dihapus', color: 'destructive' },
  APPROVE: { en: 'Approved', id: 'Disetujui', color: 'success' },
  REJECT: { en: 'Rejected', id: 'Ditolak', color: 'destructive' },
  CANCEL: { en: 'Cancelled', id: 'Dibatalkan', color: 'pending' },
  STOCK_IN_CREATE: { en: 'Stock Received', id: 'Stok Diterima', color: 'success' },
  STOCK_OUT_CREATE: { en: 'Stock Delivered', id: 'Stok Dikirim', color: 'secondary' },
  ADJUSTMENT_CREATE: { en: 'Adjustment Created', id: 'Penyesuaian Dibuat', color: 'pending' },
};

export default function AuditLog() {
  const { t, language } = useLanguage();
  const { hasPermission } = useAuth();
  
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchLogs();
  }, [moduleFilter, dateFrom, dateTo]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (moduleFilter !== 'all') {
        query = query.eq('module', moduleFilter);
      }

      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      toast.error(language === 'en' ? 'Failed to load audit logs' : 'Gagal memuat log audit');
    }
    setLoading(false);
  };

  const filteredLogs = logs.filter(log =>
    log.ref_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getActionLabel = (action: string) => {
    const info = actionLabels[action] || { en: action, id: action, color: 'default' as const };
    return {
      label: language === 'en' ? info.en : info.id,
      color: info.color,
    };
  };

  const getModuleLabel = (module: string) => {
    const info = moduleLabels[module] || { en: module, id: module };
    return language === 'en' ? info.en : info.id;
  };

  const renderDataPreview = (data: unknown) => {
    const record = asRecord(data);
    if (!record) return '-';
    
    const keys = Object.keys(record);
    if (keys.length === 0) return '-';

    // For stock_in, show summary
    if (record.items && Array.isArray(record.items)) {
      return (
        <div className="text-sm">
          <p><span className="text-muted-foreground">PO:</span> {String(record.plan_order_number || '')}</p>
          <p><span className="text-muted-foreground">Items:</span> {String(record.total_items || 0)} ({String(record.total_qty_received || 0)} pcs)</p>
        </div>
      );
    }

    // Generic preview - show first 2 key values
    const preview = keys.slice(0, 2).map(key => `${key}: ${JSON.stringify(record[key])}`).join(', ');
    return preview.length > 50 ? preview.substring(0, 50) + '...' : preview;
  };

  const clearFilters = () => {
    setModuleFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  const hasActiveFilters = moduleFilter !== 'all' || dateFrom || dateTo;

  if (!hasPermission(['super_admin', 'admin'])) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <FileText className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">
          {language === 'en' ? 'Access Denied' : 'Akses Ditolak'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'en' 
            ? 'Only Admin can access audit logs.' 
            : 'Hanya Admin yang dapat mengakses log audit.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Audit Log</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'View complete system audit trail with before/after changes' : 'Lihat jejak audit sistem lengkap dengan perubahan sebelum/sesudah'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchLogs}>
          {language === 'en' ? 'Refresh' : 'Muat Ulang'}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search by ref no, user, or action...' : 'Cari berdasarkan no. ref, user, atau aksi...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={language === 'en' ? 'All Modules' : 'Semua Modul'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Modules' : 'Semua Modul'}</SelectItem>
                {Object.entries(moduleLabels).map(([key, val]) => (
                  <SelectItem key={key} value={key}>
                    {language === 'en' ? val.en : val.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" />
                  {language === 'en' ? 'Date Range' : 'Rentang Tanggal'}
                  {hasActiveFilters && <Badge variant="draft" className="text-xs px-1">!</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'From Date' : 'Dari Tanggal'}</Label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'To Date' : 'Sampai Tanggal'}</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
                    {language === 'en' ? 'Clear Filters' : 'Hapus Filter'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
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
                  <TableHead className="w-10"></TableHead>
                  <TableHead>{language === 'en' ? 'Timestamp' : 'Waktu'}</TableHead>
                  <TableHead>{language === 'en' ? 'Module' : 'Modul'}</TableHead>
                  <TableHead>{language === 'en' ? 'Action' : 'Aksi'}</TableHead>
                  <TableHead>{language === 'en' ? 'Reference' : 'Referensi'}</TableHead>
                  <TableHead>{language === 'en' ? 'User' : 'Pengguna'}</TableHead>
                  <TableHead>{language === 'en' ? 'Data' : 'Data'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No audit logs found' : 'Tidak ada log audit ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => {
                    const actionInfo = getActionLabel(log.action);
                    const isExpanded = expandedRows.has(log.id);

                    return (
                      <React.Fragment key={log.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(log.id)}>
                          <TableCell>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{formatDate(log.created_at)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getModuleLabel(log.module)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={actionInfo.color as any}>{actionInfo.label}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{log.ref_no || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm truncate max-w-[150px]">{log.user_email || 'System'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {renderDataPreview(log.new_data)}
                          </TableCell>
                        </TableRow>
                        
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {asRecord(log.old_data) && Object.keys(asRecord(log.old_data)!).length > 0 && (
                                  <div>
                                    <h4 className="font-medium mb-2 text-sm text-muted-foreground">
                                      {language === 'en' ? 'Old Data' : 'Data Lama'}
                                    </h4>
                                    <pre className="p-3 bg-background rounded-lg text-xs overflow-auto max-h-[200px]">
                                      {JSON.stringify(log.old_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {asRecord(log.new_data) && Object.keys(asRecord(log.new_data)!).length > 0 && (
                                  <div>
                                    <h4 className="font-medium mb-2 text-sm text-muted-foreground">
                                      {language === 'en' ? 'New Data' : 'Data Baru'}
                                    </h4>
                                    <pre className="p-3 bg-background rounded-lg text-xs overflow-auto max-h-[200px]">
                                      {JSON.stringify(log.new_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                              {(log.ip_address || log.user_agent) && (
                                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                                  {log.ip_address && <span className="mr-4">IP: {log.ip_address}</span>}
                                  {log.user_agent && <span>User Agent: {log.user_agent}</span>}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{filteredLogs.length}</div>
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Logs' : 'Total Log'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {filteredLogs.filter(l => l.module === 'stock_in').length}
            </div>
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Stock In Logs' : 'Log Penerimaan'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {new Set(filteredLogs.map(l => l.user_email)).size}
            </div>
            <p className="text-sm text-muted-foreground">{language === 'en' ? 'Active Users' : 'Pengguna Aktif'}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
