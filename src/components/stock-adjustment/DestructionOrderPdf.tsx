import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Printer, X, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { exportSectionBasedPdf } from '@/lib/pdfSectionExport';
import { PdfGeneratingOverlay } from '@/components/PdfGeneratingOverlay';

export interface DestructionOrderData {
  id: string;
  bap_number: string;
  status: 'pending' | 'approved' | 'rejected';
  destruction_date: string;
  notes: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  items: {
    id: string;
    product_name: string;
    product_sku: string | null;
    batch_no: string;
    expired_date: string | null;
    qty_to_destroy: number;
    unit_name: string | null;
  }[];
}

interface DestructionOrderPdfProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DestructionOrderData | null;
}

export function DestructionOrderPdf({ open, onOpenChange, data }: DestructionOrderPdfProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const formatDate = (dateStr: string) => format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });

  const handleSavePdf = async () => {
    if (!contentRef.current) return;
    setIsPrinting(true);
    setPdfProgress(0);
    try {
      await exportSectionBasedPdf({
        element: contentRef.current,
        filename: `${data.bap_number.replace(/\//g, '-')}.pdf`,
        onProgress: setPdfProgress,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Gagal membuat PDF. Silakan coba lagi.');
    } finally {
      setIsPrinting(false);
      setPdfProgress(0);
    }
  };

  const handleBrowserPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !contentRef.current) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${data.bap_number}</title>
          <style>
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 11px; }
            th { background: #166534 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @media print { body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { size: A4; margin: 0; } }
          </style>
        </head>
        <body>${contentRef.current.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5" />
            Berita Acara Pemusnahan - {data.bap_number}
          </DialogTitle>
        </DialogHeader>

        {isPrinting && <PdfGeneratingOverlay isVisible={isPrinting} progress={pdfProgress} />}

        <div ref={contentRef} style={{ backgroundColor: '#ffffff' }}>
          <div data-pdf-root className="bg-white text-gray-900" style={{
            fontFamily: 'Arial, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '267mm',
            padding: '15mm',
            WebkitPrintColorAdjust: 'exact' as any,
          }}>

            {/* Section 1: Header */}
            <div data-pdf-section style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '2px solid #166534', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img src="/logo-kemika.png" alt="Kemika Logo" crossOrigin="anonymous" style={{ height: '56px', objectFit: 'contain' }} />
                  <div>
                    <h1 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#111' }}>PT. KEMIKA KARYA PRATAMA</h1>
                    <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>Warehouse Management System</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: '#111' }}>BERITA ACARA PEMUSNAHAN</h2>
                  <p style={{ fontSize: '12px', color: '#333', margin: '4px 0 0 0' }}>No. {data.bap_number}</p>
                  <p style={{ fontSize: '11px', color: '#555', margin: '2px 0 0 0' }}>Tanggal: {formatDate(data.destruction_date)}</p>
                </div>
              </div>

              {data.notes && (
                <div style={{ border: '1px solid #999', padding: '8px 12px', marginBottom: '16px', fontSize: '11px' }}>
                  <span style={{ fontWeight: 600 }}>Catatan: </span>{data.notes}
                </div>
              )}
            </div>

            {/* Section 2: Items Table */}
            <div data-pdf-section style={{ position: 'relative' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'center', width: '35px', WebkitPrintColorAdjust: 'exact' as any }}>No.</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', WebkitPrintColorAdjust: 'exact' as any }}>Nama Produk</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', width: '80px', WebkitPrintColorAdjust: 'exact' as any }}>Kode</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', width: '90px', WebkitPrintColorAdjust: 'exact' as any }}>Batch No</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'left', width: '80px', WebkitPrintColorAdjust: 'exact' as any }}>Tgl Expired</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'center', width: '60px', WebkitPrintColorAdjust: 'exact' as any }}>Jumlah</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '7px 8px', textAlign: 'center', width: '60px', WebkitPrintColorAdjust: 'exact' as any }}>Satuan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px' }}>{item.product_name}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', fontWeight: 500, color: '#166534' }}>{item.product_sku || '-'}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px' }}>{item.batch_no}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px' }}>{item.expired_date ? formatDate(item.expired_date) : '-'}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>{item.qty_to_destroy}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center' }}>{item.unit_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Section 3: Signatures — pushed to bottom */}
            <div data-pdf-section data-pdf-bottom style={{ position: 'relative', marginTop: 'auto' }}>
              <div style={{ borderBottom: '1.5px solid #111', marginBottom: '16px', marginTop: '24px' }}></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: '1px solid #000' }}>
                {[
                  { label: 'Dibuat oleh', role: 'Finance / Purchasing', name: data.created_by_name, date: data.destruction_date },
                  { label: 'Mengetahui', role: 'Warehouse', name: null as string | null, date: null as string | null },
                  { label: 'Menyetujui', role: 'Direktur', name: data.approved_by_name, date: data.approved_at },
                ].map((col, i) => (
                  <div key={col.label} style={{ borderRight: i < 2 ? '1px solid #000' : 'none' }}>
                    <div style={{ borderBottom: '1px solid #000', padding: '8px 10px', fontSize: '11px' }}>
                      Tanggal: {col.date ? formatDate(col.date) : ''}
                    </div>
                    <div style={{ padding: '8px 10px', fontSize: '11px', fontStyle: 'italic' }}>
                      {col.label},
                    </div>
                    <div style={{ height: '70px' }}></div>
                    <div style={{ padding: '4px 10px 12px', textAlign: 'center', fontSize: '10px', color: '#333' }}>
                      {col.name ? `(${col.name})` : '(........................................)'}
                      <div style={{ color: '#666', marginTop: '2px' }}>{col.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            Tutup
          </Button>
          {data.status === 'approved' && (
            <>
              <Button variant="outline" onClick={handleBrowserPrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print Langsung
              </Button>
              <Button onClick={handleSavePdf} disabled={isPrinting}>
                {isPrinting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Simpan PDF
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
