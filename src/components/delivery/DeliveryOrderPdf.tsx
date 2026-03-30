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

export interface DeliveryOrderData {
  id: string;
  delivery_number: string | null;
  stock_out_number: string;
  delivery_date: string;
  delivery_actual_date: string | null;
  notes: string | null;
  sales_order_number: string;
  customer_name: string;
  customer_po_number: string;
  customer_address: string | null;
  project_instansi: string;
  ship_to_address: string | null;
  sales_name: string;
  customer_pic: string | null;
  customer_phone: string | null;
  items: {
    id: string;
    product_name: string;
    sku: string | null;
    qty_out: number;
    batch_no: string;
    expired_date: string | null;
    unit_name: string | null;
  }[];
}

interface DeliveryOrderPdfProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DeliveryOrderData | null;
}

export function DeliveryOrderPdf({ open, onOpenChange, data }: DeliveryOrderPdfProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const doNumber = data.delivery_number || data.stock_out_number;
  const doDate = data.delivery_actual_date || data.delivery_date;

  const formatDate = (dateStr: string) => format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });

  const handleSavePdf = async () => {
    if (!contentRef.current) return;
    setIsPrinting(true);
    setPdfProgress(0);

    try {
      await exportSectionBasedPdf({
        element: contentRef.current,
        filename: `DO-${doNumber}.pdf`,
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
          <title>Delivery Order - ${doNumber}</title>
          <style>
            body { margin: 0; padding: 15mm; font-family: Arial, sans-serif; color: #111; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 11px; }
            th { background: #1f2937 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @media print { body { padding: 10mm; } @page { size: A4; margin: 10mm; } }
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
            Delivery Order - {doNumber}
          </DialogTitle>
        </DialogHeader>

        {isPrinting && <PdfGeneratingOverlay isVisible={isPrinting} progress={pdfProgress} />}

        {/* PDF Content - section-based for smart page breaks */}
        <div ref={contentRef} style={{ backgroundColor: '#ffffff' }}>
          <div data-pdf-root className="bg-white text-gray-900" style={{ fontFamily: 'Arial, sans-serif' }}>
            
            {/* Section 1: Header */}
            <div data-pdf-section>
              <div style={{ textAlign: 'right', marginBottom: '4px' }}>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '1px', color: '#111', margin: 0 }}>DELIVERY ORDER</h1>
              </div>
              <div style={{ borderBottom: '2px solid #111', marginBottom: '16px' }}></div>

              {/* Info Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px', marginBottom: '16px', fontSize: '12px', color: '#111' }}>
                {/* Left column */}
                <div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>No. DO</span>
                    <span style={{ fontWeight: 'bold' }}>: {doNumber}</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>Date</span>
                    <span style={{ fontWeight: 600 }}>: {formatDate(doDate)}</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>No. SO</span>
                    <span>: {data.sales_order_number}</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>Customer</span>
                    <span style={{ fontWeight: 600 }}>: {data.customer_name}</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>PIC</span>
                    <span>: {data.customer_pic || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>Phone</span>
                    <span>: {data.customer_phone || '-'}</span>
                  </div>
                </div>
                {/* Right column */}
                <div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>PO Customer</span>
                    <span style={{ fontWeight: 600 }}>: {data.customer_po_number}</span>
                  </div>
                  <div style={{ display: 'flex', marginBottom: '4px' }}>
                    <span style={{ width: '100px', flexShrink: 0, color: '#555' }}>Ship Address</span>
                    <span>: {data.ship_to_address || data.customer_address || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Items Table */}
            <div data-pdf-section>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '0' }}>
                <thead>
                  <tr>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '6px 8px', textAlign: 'center', width: '30px', WebkitPrintColorAdjust: 'exact' as any }}>No</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '6px 8px', textAlign: 'left', width: '80px', WebkitPrintColorAdjust: 'exact' as any }}>SKU</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '6px 8px', textAlign: 'left', WebkitPrintColorAdjust: 'exact' as any }}>Nama Produk</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '6px 8px', textAlign: 'center', width: '50px', WebkitPrintColorAdjust: 'exact' as any }}>Qty</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '6px 8px', textAlign: 'center', width: '55px', WebkitPrintColorAdjust: 'exact' as any }}>Satuan</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '6px 8px', textAlign: 'left', width: '90px', WebkitPrintColorAdjust: 'exact' as any }}>Batch No</th>
                    <th style={{ backgroundColor: '#166534', color: 'white', border: '1px solid #15803d', padding: '6px 8px', textAlign: 'left', width: '80px', WebkitPrintColorAdjust: 'exact' as any }}>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', textAlign: 'center', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>{idx + 1}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', fontWeight: 500, color: '#166534', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>{item.sku || '-'}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', fontWeight: 500, backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>{item.product_name}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', textAlign: 'center', fontWeight: 'bold', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>{item.qty_out}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', textAlign: 'center', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>{item.unit_name || '-'}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>{item.batch_no}</td>
                      <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>{item.expired_date ? formatDate(item.expired_date) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ border: '1px solid #d1d5db', padding: '5px 8px', textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f3f4f6' }}>Total:</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '5px 8px', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f3f4f6' }}>
                      {data.items.reduce((s, i) => s + i.qty_out, 0)}
                    </td>
                    <td colSpan={3} style={{ border: '1px solid #d1d5db', padding: '5px 8px', backgroundColor: '#f3f4f6' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Section 3: Separator line + Notes + Signature */}
            <div data-pdf-section>
              {/* Separator line like reference image */}
              <div style={{ borderBottom: '1.5px solid #111', marginTop: '80px', marginBottom: '50px' }}></div>

              {/* Notes - always visible */}
              <div style={{ border: '1px solid #999', padding: '10px 14px', marginBottom: '24px', minHeight: '50px' }}>
                <p style={{ fontWeight: 600, fontSize: '11px', color: '#111', margin: '0 0 4px 0' }}>Catatan / Notes:</p>
                <p style={{ fontSize: '11px', color: '#555', margin: 0, whiteSpace: 'pre-wrap' }}>{data.notes || '-'}</p>
              </div>

              {/* Signature Section - 4 columns with generous height */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', borderTop: '1px solid #000', borderLeft: '1px solid #000' }}>
                {['Received by', 'Shipped by', 'Warehouse by', 'Approved by'].map((label) => (
                  <div key={label} style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                    {/* Date field */}
                    <div style={{ borderBottom: '1px solid #000', padding: '6px 10px', fontSize: '11px', minHeight: '28px' }}>
                      Date : _______________
                    </div>
                    {/* Label */}
                    <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600 }}>
                      {label},
                    </div>
                    {/* Signature space - generous */}
                    <div style={{ height: '100px' }}></div>
                    {/* Name placeholder */}
                    <div style={{ padding: '4px 10px', textAlign: 'center', fontSize: '10px', color: '#333' }}>
                      <div style={{ borderTop: '1px solid #666', display: 'inline-block', width: '80%', paddingTop: '4px' }}>
                        (........................................)
                      </div>
                    </div>
                    {/* Name field */}
                    <div style={{ padding: '2px 10px 8px', textAlign: 'center', fontSize: '10px', color: '#555' }}>
                      Nama / Name
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '10px', color: '#999' }}>
                <p style={{ margin: 0 }}>Dicetak pada: {format(new Date(), 'dd MMM yyyy HH:mm', { locale: localeId })}</p>
              </div>
            </div>

          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            Tutup
          </Button>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
