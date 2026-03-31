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

function numberToWords(num: number): string {
  if (num === 0) return 'Nol';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  const convert = (n: number): string => {
    if (n < 12) return satuan[n];
    if (n < 20) return satuan[n - 10] + ' Belas';
    if (n < 100) return satuan[Math.floor(n / 10)] + ' Puluh' + (n % 10 ? ' ' + satuan[n % 10] : '');
    if (n < 200) return 'Seratus' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 1000) return satuan[Math.floor(n / 100)] + ' Ratus' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 2000) return 'Seribu' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 1000000) return convert(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 1000000000) return convert(Math.floor(n / 1000000)) + ' Juta' + (n % 1000000 ? ' ' + convert(n % 1000000) : '');
    if (n < 1000000000000) return convert(Math.floor(n / 1000000000)) + ' Miliar' + (n % 1000000000 ? ' ' + convert(n % 1000000000) : '');
    return convert(Math.floor(n / 1000000000000)) + ' Triliun' + (n % 1000000000000 ? ' ' + convert(n % 1000000000000) : '');
  };
  return convert(Math.round(num));
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
    const piPrintStyles = `
      @page { size: A4; margin: 0; }
      body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; background-image: url(/kop-surat-pi-bg.jpg); background-size: 210mm 297mm; background-repeat: no-repeat; background-position: center top; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      th[style*="background"] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    `;
    securePrint({
      title: `ProformaInvoice_${detail.pi_number}`,
      styles: piPrintStyles,
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
          {detail && (() => {
            const customer = detail.customer as any;
            const so = detail.sales_order as any;
            const dpp = Math.round(detail.subtotal);
            const dppPengganti = 0;
            const pajak = Math.round(detail.tax_amount || 0);
            const biayaPengantaran = Math.round(detail.shipping_cost || 0);
            const subTotalCalc = Math.round(dpp + pajak + biayaPengantaran);
            const materai = Math.round(detail.materai_amount || 0);
            const saldo = Math.round(detail.grand_total);
            const approverName = detail.approved_by_profile?.full_name || null;
            const isApproved = !!detail.approved_by && !!detail.approved_at;
            const approverSignatureUrl = (detail as any).approver_signature_url || null;

            const labelStyle: React.CSSProperties = { fontSize: "11px", color: "#333", whiteSpace: "nowrap" };
            const valStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 600 };

            const fmtNum = (n: number) => new Intl.NumberFormat('id-ID').format(n);

            return (
              <div data-pdf-root style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#111", paddingTop: "100px" }}>
                {/* Section 1: Title + Header Info */}
                <div data-pdf-section>
                  <div style={{ textAlign: "right", marginBottom: "2px", marginRight: "12mm" }}>
                    <h1 style={{ fontSize: "20px", fontWeight: "bold", letterSpacing: "1px", color: "#111", margin: 0 }}>PROFORMA INVOICE</h1>
                  </div>
                  <div style={{ borderBottom: "2.5px solid #111", marginBottom: "14px", marginRight: "12mm" }} />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                    {/* Left */}
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        {[
                          ["Nomor PI", detail.pi_number],
                          ["Kepada", customer?.name || '-'],
                          ["Up.", customer?.pic || so?.sales_name || '-'],
                          ["Alamat", customer?.address || '-'],
                        ].map(([label, val]) => (
                          <tr key={label}>
                            <td style={{ ...labelStyle, width: "90px", padding: "3px 0" }}>{label}</td>
                            <td style={{ width: "10px", padding: "3px 0" }}>:</td>
                            <td style={{ ...valStyle, padding: "3px 0" }}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Right */}
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        <tr>
                          <td style={{ ...labelStyle, width: "90px", padding: "3px 0" }}>Tanggal</td>
                          <td style={{ width: "10px", padding: "3px 0" }}>:</td>
                          <td style={{ ...valStyle, padding: "3px 0" }}>{detail.created_at ? formatDateID(detail.created_at) : '-'}</td>
                        </tr>
                        <tr>
                          <td style={{ ...labelStyle, padding: "3px 0" }}>Mata Uang</td>
                          <td style={{ padding: "3px 0" }}>:</td>
                          <td style={{ ...valStyle, padding: "3px 0" }}>IDR - (Rupiah)</td>
                        </tr>
                        <tr>
                          <td style={{ ...labelStyle, padding: "3px 0" }}>Nomor SO</td>
                          <td style={{ padding: "3px 0" }}>:</td>
                          <td style={{ ...valStyle, padding: "3px 0" }}>{so?.sales_order_number || '-'}</td>
                        </tr>
                        <tr>
                          <td style={{ ...labelStyle, padding: "3px 0" }}>Term</td>
                          <td style={{ padding: "3px 0" }}>:</td>
                          <td style={{ ...valStyle, padding: "3px 0", color: "#b91c1c" }}>{detail.payment_terms || '-'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 2: Items Table */}
                <div data-pdf-section style={{ marginTop: "12px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #333" }}>
                    <thead>
                      <tr>
                        {[
                          { label: "No", w: "30px", align: "center" as const },
                          { label: "Kode", w: "70px", align: "left" as const },
                          { label: "Nama Barang", w: "auto", align: "left" as const },
                          { label: "Jumlah", w: "55px", align: "center" as const },
                          { label: "Unit", w: "40px", align: "center" as const },
                          { label: "Harga", w: "90px", align: "right" as const },
                          { label: "Disc.", w: "40px", align: "center" as const },
                          { label: "Sub Total", w: "95px", align: "right" as const },
                          { label: "Pajak", w: "45px", align: "center" as const },
                        ].map((h) => (
                          <th key={h.label} style={{
                            backgroundColor: "#166534", color: "white",
                            border: "1px solid #15803d", padding: "7px 6px", fontSize: "10px",
                            textAlign: h.align, whiteSpace: "nowrap", width: h.w,
                            WebkitPrintColorAdjust: "exact" as any,
                          }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items?.map((item, idx) => (
                        <tr key={item.id}>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", textAlign: "center", fontSize: "10px" }}>{idx + 1}</td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", fontSize: "10px", color: "#166534", fontWeight: 600 }}>
                            {(item as any).product?.sku || '-'}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", fontSize: "10px" }}>{item.product_name}</td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", textAlign: "center", fontSize: "10px" }}>{item.qty}</td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", textAlign: "center", fontSize: "10px" }}>
                            {(item as any).product?.unit?.name || 'unit'}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", textAlign: "right", fontSize: "10px" }}>
                            {fmtNum(Math.round(item.unit_price))}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", textAlign: "center", fontSize: "10px" }}>
                            {item.discount ? item.discount : 0}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", textAlign: "right", fontSize: "10px" }}>
                            {fmtNum(Math.round(item.subtotal))}
                          </td>
                          <td style={{ border: "1px solid #d1d5db", padding: "6px", textAlign: "center", fontSize: "10px" }}>
                            {detail.tax_rate ? `${detail.tax_rate}%` : '0%'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Section 3: Summary + Terbilang side-by-side */}
                <div data-pdf-section style={{ marginTop: "14px" }}>
                  <div style={{ display: "flex", gap: "20px", alignItems: "flex-end" }}>
                    {/* Left: Terbilang + Bank Info */}
                    <div style={{ flex: 1, fontSize: "10px" }}>
                      <div style={{ marginBottom: "10px" }}>
                        <b>Terbilang : </b><i>{numberToWords(saldo)} Rupiah</i>
                      </div>
                      <div style={{ lineHeight: "1.6" }}>
                        <div style={{ fontWeight: 600, marginBottom: "2px" }}>Keterangan :</div>
                        <div>- Account Banking a/n PT. KEMIKA KARYA PRATAMA</div>
                        <div>- Bank Mandiri KCP Tangerang Ciledug</div>
                        <div>- Acc. No 155-005-755-575-0</div>
                        <div>- NPWP : 71.608.326.6-416.000</div>
                      </div>
                    </div>
                    {/* Right: Calculation summary */}
                    <div style={{ minWidth: "260px" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "3px 12px 3px 0", fontSize: "10px" }}>DPP</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "center", width: "10px" }}>:</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "right" }}>{fmtNum(dpp)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "3px 12px 3px 0", fontSize: "10px" }}>DPP Pengganti</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "right" }}>{fmtNum(dppPengganti)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "3px 12px 3px 0", fontSize: "10px" }}>Pajak</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "right" }}>{fmtNum(pajak)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "3px 12px 3px 0", fontSize: "10px" }}>Biaya Pengantaran</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "right" }}>{fmtNum(biayaPengantaran)}</td>
                          </tr>
                          <tr><td colSpan={3} style={{ padding: 0 }}><div style={{ borderTop: "1px solid #333", margin: "3px 0" }} /></td></tr>
                          <tr>
                            <td style={{ padding: "3px 12px 3px 0", fontSize: "10px", fontWeight: 600 }}>Sub Total</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "right", fontWeight: 600 }}>Rp {fmtNum(subTotalCalc)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "3px 12px 3px 0", fontSize: "10px" }}>Bea Materai</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "right" }}>Rp {fmtNum(materai)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: "3px 12px 3px 0", fontSize: "10px" }}>Down Payment</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "center" }}>:</td>
                            <td style={{ padding: "3px 0", fontSize: "10px", textAlign: "right" }}>-</td>
                          </tr>
                          <tr><td colSpan={3} style={{ padding: 0 }}><div style={{ borderTop: "2px solid #111", margin: "3px 0" }} /></td></tr>
                          <tr>
                            <td style={{ padding: "4px 12px 4px 0", fontSize: "12px", fontWeight: 700 }}>Saldo</td>
                            <td style={{ padding: "4px 0", fontSize: "12px", textAlign: "center" }}>:</td>
                            <td style={{ padding: "4px 0", fontSize: "12px", textAlign: "right", fontWeight: 700 }}>Rp {fmtNum(saldo)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Section 4: Signature - pushed to bottom */}
                <div data-pdf-section data-pdf-bottom style={{ marginTop: "24px" }}>
                  <div style={{ borderBottom: "1.5px solid #111", marginBottom: "16px" }} />
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: "20px" }}>
                    <div style={{ textAlign: "center", minWidth: "180px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 600, marginBottom: "6px" }}>KEMIKA KARYA PRATAMA</div>
                      {isApproved && approverSignatureUrl ? (
                        <div style={{ height: "60px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <img src={approverSignatureUrl} alt="signature" style={{ maxHeight: "55px", maxWidth: "160px", objectFit: "contain" }} crossOrigin="anonymous" />
                        </div>
                      ) : (
                        <div style={{ height: "60px" }} />
                      )}
                      <div style={{ borderBottom: "1px solid #111", width: "80%", margin: "0 auto" }} />
                      <div style={{ fontSize: "10px", marginTop: "4px", fontWeight: 600 }}>
                        {isApproved && approverName ? approverName : '(..................................)'}
                      </div>
                      <div style={{ fontSize: "9px", color: "#666" }}>FINANCE</div>
                    </div>
                  </div>
                  <div style={{ height: "65px" }} />
                </div>
              </div>
            );
          })()}
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
