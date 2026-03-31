import React, { useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import usePermissions from '@/hooks/usePermissions';
import {
  useProformaInvoices,
  useProformaInvoiceDetail,
  useApprovePI,
  useRejectPI,
  useCancelPI,
  ProformaInvoice as PIType,
} from '@/hooks/useProformaInvoices';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Eye, CheckCircle, XCircle, Ban, Receipt, FileText, Printer, Download, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { toast } from 'sonner';
import { exportSectionBasedPdf } from '@/lib/pdfSectionExport';
import { securePrint, printStyles, sanitizeHtml } from '@/lib/printUtils';
import { PdfGeneratingOverlay } from '@/components/PdfGeneratingOverlay';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Menunggu Approval', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Ditolak', variant: 'destructive' },
  cancelled: { label: 'Dibatalkan', variant: 'outline' },
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatDateID(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatDateTimeID(d: Date) {
  const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export default function ProformaInvoicePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { data: invoices = [], isLoading } = useProformaInvoices();
  
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [cancelDialogId, setCancelDialogId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  
  const printRef = useRef<HTMLDivElement>(null);
  
  const { data: detail, isLoading: detailLoading } = useProformaInvoiceDetail(selectedId);
  const approveMutation = useApprovePI();
  const rejectMutation = useRejectPI();
  const cancelMutation = useCancelPI();

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    return (
      inv.pi_number?.toLowerCase().includes(q) ||
      (inv.customer as any)?.name?.toLowerCase().includes(q) ||
      (inv.sales_order as any)?.sales_order_number?.toLowerCase().includes(q)
    );
  });

  const canApprove = permissions.canPerformAction('proforma_invoice', 'approve');
  const canCancel = permissions.canPerformAction('proforma_invoice', 'cancel');
  const canPrint = permissions.canPerformAction('proforma_invoice', 'print');

  const handleApprove = (id: string) => {
    if (confirm('Apakah Anda yakin ingin meng-approve Proforma Invoice ini?')) {
      approveMutation.mutate(id);
      setSelectedId(null);
    }
  };

  const handleReject = () => {
    if (!reason.trim()) return;
    rejectMutation.mutate({ piId: rejectDialogId!, reason });
    setRejectDialogId(null);
    setReason('');
    setSelectedId(null);
  };

  const handleCancel = () => {
    if (!reason.trim()) return;
    cancelMutation.mutate({ piId: cancelDialogId!, reason });
    setCancelDialogId(null);
    setReason('');
    setSelectedId(null);
  };

  const handlePrintPI = () => {
    if (!printRef.current || !detail) return;
    securePrint({
      title: `ProformaInvoice_${detail.pi_number}`,
      styles: printStyles.salesOrder,
      content: printRef.current.innerHTML,
    });
  };

  const handleSaveAsPDF = async () => {
    if (!printRef.current || !detail) return;
    setIsSavingPdf(true);
    setPdfProgress(0);
    try {
      const filename = `PI_${detail.pi_number.replace(/[^a-zA-Z0-9.-]/g, "_")}.pdf`;
      await exportSectionBasedPdf({
        element: printRef.current,
        filename,
        onProgress: setPdfProgress,
        backgroundImage: `${window.location.origin}/kop-surat-pi-bg.jpg`,
      });
      toast.success('PDF berhasil disimpan');
    } catch (err: any) {
      toast.error('Gagal menyimpan PDF');
    } finally {
      setIsSavingPdf(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6" />
            Proforma Invoice
          </h1>
          <p className="text-sm text-muted-foreground">Invoice CBD - Cash Before Delivery</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nomor PI, customer, atau nomor SO..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. PI</TableHead>
                <TableHead>No. SO</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Grand Total</TableHead>
                <TableHead className="text-right">Materai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Tidak ada data Proforma Invoice
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => {
                  const status = statusConfig[inv.status] || statusConfig.pending;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono font-medium">{inv.pi_number}</TableCell>
                      <TableCell className="font-mono text-sm">{(inv.sales_order as any)?.sales_order_number || '-'}</TableCell>
                      <TableCell>{(inv.customer as any)?.name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {inv.customer_type || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(inv.grand_total)}</TableCell>
                      <TableCell className="text-right">{inv.materai_amount > 0 ? formatCurrency(inv.materai_amount) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {inv.created_at ? format(new Date(inv.created_at), 'dd MMM yyyy', { locale: localeId }) : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedId(inv.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canApprove && inv.status === 'pending' && (
                            <>
                              <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleApprove(inv.id)}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { setRejectDialogId(inv.id); setReason(''); }}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {canCancel && inv.status === 'approved' && (
                            <Button size="sm" variant="ghost" className="text-orange-600" onClick={() => { setCancelDialogId(inv.id); setReason(''); }}>
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Detail Proforma Invoice
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-center py-8 text-muted-foreground">Memuat...</p>
          ) : detail ? (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">No. PI</p>
                  <p className="font-mono font-medium">{detail.pi_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={statusConfig[detail.status]?.variant || 'secondary'}>
                    {statusConfig[detail.status]?.label || detail.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">No. SO</p>
                  <p className="font-mono">{(detail.sales_order as any)?.sales_order_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p>{(detail.customer as any)?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tipe Customer</p>
                  <p>{detail.customer_type || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Terms</p>
                  <p>{detail.payment_terms || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sales</p>
                  <p>{(detail.sales_order as any)?.sales_name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dibuat Oleh</p>
                  <p>{detail.created_by_profile?.full_name || detail.created_by_profile?.email || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p>{detail.created_at ? format(new Date(detail.created_at), 'dd MMM yyyy HH:mm', { locale: localeId }) : '-'}</p>
                </div>
                {detail.approved_by_profile && (
                  <div>
                    <p className="text-muted-foreground">Di-approve Oleh</p>
                    <p>{detail.approved_by_profile.full_name || detail.approved_by_profile.email}</p>
                  </div>
                )}
              </div>

              {/* Items table */}
              <div>
                <h3 className="font-semibold mb-2">Detail Produk</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items?.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.subtotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Financial summary */}
              <div className="border-t pt-4 space-y-1 text-sm">
                {detail.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Diskon</span>
                    <span>- {formatCurrency(detail.discount)}</span>
                  </div>
                )}
                {detail.shipping_cost > 0 && (
                  <div className="flex justify-between">
                    <span>Biaya Pengiriman</span>
                    <span>{formatCurrency(detail.shipping_cost)}</span>
                  </div>
                )}
                {detail.other_costs > 0 && (
                  <div className="flex justify-between">
                    <span>Biaya Lainnya</span>
                    <span>{formatCurrency(detail.other_costs)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Subtotal (Nilai DPP)</span>
                  <span>{formatCurrency(detail.subtotal)}</span>
                </div>
                {detail.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span>PPN ({detail.tax_rate}%)</span>
                    <span>{formatCurrency(detail.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total (DPP + PPN)</span>
                  <span>{formatCurrency(detail.subtotal + (detail.tax_amount || 0))}</span>
                </div>
                {detail.materai_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Bea Materai</span>
                    <span>{formatCurrency(detail.materai_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Grand Total</span>
                  <span>{formatCurrency(detail.grand_total)}</span>
                </div>
              </div>

              {/* Rejection/Cancel reason */}
              {detail.rejected_reason && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <p className="text-sm font-medium text-destructive">Alasan Penolakan:</p>
                  <p className="text-sm">{detail.rejected_reason}</p>
                </div>
              )}
              {detail.cancel_reason && (
                <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Alasan Pembatalan:</p>
                  <p className="text-sm">{detail.cancel_reason}</p>
                </div>
              )}

              {detail.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Catatan:</p>
                  <p className="text-sm">{detail.notes}</p>
                </div>
              )}
            </div>
          ) : null}
          
          <DialogFooter className="gap-2 flex-wrap">
            {detail?.status === 'pending' && canApprove && (
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={() => { setRejectDialogId(detail.id); setReason(''); }}>
                  <XCircle className="w-4 h-4 mr-1" /> Tolak
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(detail.id)}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Approve
                </Button>
              </div>
            )}
            {detail?.status === 'approved' && canCancel && (
              <Button variant="outline" size="sm" className="text-orange-600" onClick={() => { setCancelDialogId(detail.id); setReason(''); }}>
                <Ban className="w-4 h-4 mr-1" /> Cancel PI
              </Button>
            )}
            {detail && canPrint && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsPdfPreviewOpen(true)}>
                  <Eye className="w-4 h-4 mr-1" /> Preview PDF
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={setIsPdfPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview PDF - Proforma Invoice</DialogTitle>
            <DialogDescription>Lihat dokumen sebelum mencetak atau menyimpan sebagai PDF</DialogDescription>
          </DialogHeader>

          <div className="bg-white p-4 rounded border overflow-x-auto">
            <style dangerouslySetInnerHTML={{ __html: `.pdf-preview-pi th[style*="background"] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }` }} />
            <div className="pdf-preview-pi" dangerouslySetInnerHTML={{ __html: sanitizeHtml(printRef.current?.innerHTML || "") }} />
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setIsPdfPreviewOpen(false)}>Tutup</Button>
            <Button variant="success" onClick={handleSaveAsPDF} disabled={isSavingPdf}>
              {isSavingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Simpan PDF
            </Button>
            <Button variant="outline" onClick={handlePrintPI}>
              <Download className="w-4 h-4 mr-2" /> Cetak ke PDF
            </Button>
            <Button onClick={handlePrintPI}>
              <Printer className="w-4 h-4 mr-2" /> Cetak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Template */}
      <div className="hidden">
        <div ref={printRef}>
          {detail && (
            <div data-pdf-root style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#111" }}>
              {/* Header */}
              <div data-pdf-section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", minHeight: "70px" }}>
                  <div>
                    <img 
                      src={`${window.location.origin}/logo-kemika.png`} 
                      crossOrigin="anonymous"
                      alt="Kemika" 
                      style={{ height: "42px", objectFit: "contain" }} 
                    />
                  </div>
                  <div style={{ textAlign: "right", minWidth: "300px" }}>
                    <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: 0.5 }}>PROFORMA INVOICE</div>
                    <div style={{ height: "6px" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "120px 10px 1fr", gap: "6px", justifyContent: "end" }}>
                      <div style={{ textAlign: "left", fontSize: "11px" }}>No. PI</div>
                      <div>:</div>
                      <div style={{ fontWeight: 700 }}>{detail.pi_number}</div>
                      <div style={{ textAlign: "left", fontSize: "11px" }}>Tanggal</div>
                      <div>:</div>
                      <div style={{ fontWeight: 700 }}>{detail.created_at ? formatDateID(detail.created_at) : '-'}</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "8px", borderTop: "2px solid #111" }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: "8px", columnGap: "10px" }}>
                    <div style={{ color: "#333" }}>CUSTOMER</div>
                    <div style={{ fontWeight: 700 }}>{(detail.customer as any)?.name || '-'}</div>
                    <div style={{ color: "#333" }}>TIPE</div>
                    <div style={{ fontWeight: 700 }}>{detail.customer_type || '-'}</div>
                    <div style={{ color: "#333" }}>SALES</div>
                    <div style={{ fontWeight: 700 }}>{(detail.sales_order as any)?.sales_name || '-'}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", rowGap: "8px", columnGap: "10px" }}>
                    <div style={{ color: "#333" }}>NO. SO</div>
                    <div style={{ fontWeight: 700 }}>{(detail.sales_order as any)?.sales_order_number || '-'}</div>
                    <div style={{ color: "#333" }}>PO CUSTOMER</div>
                    <div style={{ fontWeight: 700 }}>{(detail.sales_order as any)?.customer_po_number || '-'}</div>
                    <div style={{ color: "#333" }}>PAYMENT TERMS</div>
                    <div style={{ fontWeight: 700, color: "#b91c1c" }}>{(detail.payment_terms || '-').toUpperCase()}</div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div data-pdf-section style={{ marginTop: "12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "2px solid #111" }}>
                  <thead>
                    <tr style={{ background: "#0b6b3a", color: "white" }}>
                      {["No", "Nama Barang", "Qty", "Harga Satuan", "Subtotal"].map((h) => (
                        <th key={h} style={{
                          background: "#0b6b3a", color: "white",
                          border: "1px solid #111", padding: "8px", fontSize: "11px",
                          textAlign: h === "Harga Satuan" || h === "Subtotal" ? "right" : h === "Qty" || h === "No" ? "center" : "left",
                          whiteSpace: "nowrap",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items?.map((item, idx) => (
                      <tr key={item.id}>
                        <td style={{ border: "1px solid #111", padding: "8px", textAlign: "center" }}>{idx + 1}</td>
                        <td style={{ border: "1px solid #111", padding: "8px" }}>{item.product_name}</td>
                        <td style={{ border: "1px solid #111", padding: "8px", textAlign: "center" }}>{item.qty}</td>
                        <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>{formatCurrency(item.unit_price)}</td>
                        <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals - matching DPP format */}
              <div data-pdf-section style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 280px", gap: "10px" }}>
                <div />
                <div style={{ borderTop: "1px solid #111", paddingTop: "8px" }}>
                  {detail.discount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", color: "#b91c1c" }}>
                      <span>Diskon</span>
                      <b>- {formatCurrency(detail.discount)}</b>
                    </div>
                  )}
                  {detail.shipping_cost > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span>Biaya Pengiriman</span>
                      <b>{formatCurrency(detail.shipping_cost)}</b>
                    </div>
                  )}
                  {detail.other_costs > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span>Biaya Lainnya</span>
                      <b>{formatCurrency(detail.other_costs)}</b>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span>Subtotal (Nilai DPP)</span>
                    <b>{formatCurrency(detail.subtotal)}</b>
                  </div>
                  {detail.tax_amount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span>PPN ({detail.tax_rate}%)</span>
                      <b>{formatCurrency(detail.tax_amount)}</b>
                    </div>
                  )}
                  <div style={{ borderTop: "1px solid #111", paddingTop: "6px", display: "flex", justifyContent: "space-between", marginBottom: "6px", fontWeight: 600 }}>
                    <span>Total (DPP + PPN)</span>
                    <span>{formatCurrency(detail.subtotal + (detail.tax_amount || 0))}</span>
                  </div>
                  {detail.materai_amount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span>Bea Materai</span>
                      <b>{formatCurrency(detail.materai_amount)}</b>
                    </div>
                  )}
                  <div style={{ borderTop: "2px solid #111", marginTop: "8px", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700 }}>Grand Total</span>
                    <span style={{ fontSize: "13px", fontWeight: 700 }}>{formatCurrency(detail.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {detail.notes && (
                <div data-pdf-section style={{ marginTop: "12px" }}>
                  <div style={{ border: "1px solid #111", padding: "10px", minHeight: "50px" }}>
                    <div style={{ fontWeight: 700, fontSize: "10px", marginBottom: "6px", color: "#333" }}>CATATAN :</div>
                    <div style={{ fontSize: "10px" }}>{detail.notes}</div>
                  </div>
                </div>
              )}

              {/* Signature - 3 columns: Sales, Finance, Approve */}
              <div data-pdf-section data-pdf-bottom style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0px" }}>
                {(() => {
                  const cellBase: React.CSSProperties = {
                    border: "1px solid #111", padding: "10px", minHeight: "140px",
                    display: "flex", flexDirection: "column",
                  };
                  const cellNoLeft: React.CSSProperties = { ...cellBase, borderLeft: "0px" };
                  const headerStyle: React.CSSProperties = { textAlign: "right", fontSize: "9px", marginBottom: "6px", color: "#444", lineHeight: 1.2, minHeight: "14px" };
                  const metaRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px", minHeight: "14px" };
                  const leftRole: React.CSSProperties = { fontSize: "10px", color: "#666" };
                  const rightDate: React.CSSProperties = { fontSize: "9px", color: "#666", textAlign: "right" };
                  const signArea: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "56px" };
                  const lineStyle: React.CSSProperties = { borderBottom: "1px solid #111", height: "1px", marginTop: "6px" };
                  const nameStyle: React.CSSProperties = { fontSize: "10px", marginTop: "6px", textAlign: "center", fontWeight: 700, color: "#111", minHeight: "14px" };
                  const placeholderName: React.CSSProperties = { ...nameStyle, fontWeight: 400, color: "#666" };

                  const creatorName = detail.created_by_profile?.full_name || '-';
                  const createdAt = detail.created_at ? new Date(detail.created_at) : null;
                  const approverName = detail.approved_by_profile?.full_name || '-';
                  const isApproved = !!detail.approved_by && !!detail.approved_at;
                  const approvedAt = isApproved ? new Date(detail.approved_at!) : null;

                  return (
                    <>
                      {/* Sales */}
                      <div style={cellBase}>
                        <div style={headerStyle}>Ditandatangani oleh <span style={{ fontWeight: 700 }}>{creatorName}</span></div>
                        <div style={metaRow}>
                          <div style={leftRole}>Sales,</div>
                          <div style={rightDate}>{createdAt ? `Pada ${formatDateTimeID(createdAt)}` : '-'}</div>
                        </div>
                        <div style={signArea} />
                        <div style={lineStyle} />
                        <div style={placeholderName}>(.................................)</div>
                      </div>

                      {/* Finance */}
                      <div style={cellNoLeft}>
                        <div style={headerStyle}>Ditandatangani oleh <span style={{ fontWeight: 700 }}>-</span></div>
                        <div style={metaRow}>
                          <div style={leftRole}>Finance,</div>
                          <div style={rightDate}>-</div>
                        </div>
                        <div style={signArea} />
                        <div style={lineStyle} />
                        <div style={placeholderName}>(.................................)</div>
                      </div>

                      {/* Approve */}
                      <div style={cellNoLeft}>
                        <div style={headerStyle}>Ditandatangani oleh <span style={{ fontWeight: 700 }}>{isApproved ? approverName : '-'}</span></div>
                        <div style={metaRow}>
                          <div style={leftRole}>Approve,</div>
                          <div style={rightDate}>{approvedAt ? `Pada ${formatDateTimeID(approvedAt)}` : '-'}</div>
                        </div>
                        <div style={signArea} />
                        <div style={lineStyle} />
                        <div style={isApproved ? nameStyle : placeholderName}>{isApproved ? approverName : '(.................................)'}</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div style={{ marginTop: "10px", fontSize: "9px", color: "#333" }}>
                Print: {formatDateTimeID(new Date())}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialogId} onOpenChange={(open) => !open && setRejectDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Proforma Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder="Alasan penolakan..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogId(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!reason.trim()}>Tolak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelDialogId} onOpenChange={(open) => !open && setCancelDialogId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan Proforma Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder="Alasan pembatalan..." value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogId(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!reason.trim()}>Batalkan PI</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Generating Overlay */}
      <PdfGeneratingOverlay isVisible={isSavingPdf} progress={pdfProgress} language="id" />
    </div>
  );
}
