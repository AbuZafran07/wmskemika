import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Printer, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
  const contentRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const doNumber = data.delivery_number || data.stock_out_number;
  const doDate = data.delivery_actual_date || data.delivery_date;

  const formatDate = (dateStr: string) => format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });

  const handlePrint = async () => {
    if (!contentRef.current) return;
    setIsPrinting(true);

    try {
      const offscreenContainer = document.createElement('div');
      offscreenContainer.style.position = 'absolute';
      offscreenContainer.style.left = '-9999px';
      offscreenContainer.style.top = '0';
      offscreenContainer.style.width = '210mm';
      offscreenContainer.style.minHeight = '297mm';
      offscreenContainer.style.padding = '12mm 15mm';
      offscreenContainer.style.backgroundColor = '#ffffff';
      offscreenContainer.style.boxSizing = 'border-box';
      offscreenContainer.style.zIndex = '-1';
      document.body.appendChild(offscreenContainer);

      const clonedContent = contentRef.current.cloneNode(true) as HTMLElement;
      clonedContent.style.width = '100%';
      offscreenContainer.appendChild(clonedContent);

      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(offscreenContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: offscreenContainer.offsetWidth,
        height: offscreenContainer.offsetHeight,
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = 297;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = `DO-${doNumber}.pdf`;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      
      setTimeout(() => {
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobUrl);
      }, 200);

      document.body.removeChild(offscreenContainer);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Gagal membuat PDF. Silakan coba lagi.');
    } finally {
      setIsPrinting(false);
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
            th { background: #1f2937; color: white; }
            @media print { body { padding: 0; } }
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

        {/* PDF Preview Content */}
        <div className="border rounded-lg p-8 bg-white text-gray-900" ref={contentRef}>
          {/* Header Title - right aligned */}
          <div className="text-right mb-6">
            <h1 className="text-xl font-bold tracking-wide" style={{ color: '#111' }}>DELIVERY ORDER</h1>
          </div>

          {/* Info Section - matching reference layout */}
          <div className="grid grid-cols-2 gap-x-8 mb-6 text-sm" style={{ color: '#111' }}>
            {/* Left column */}
            <div className="space-y-1.5">
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>No. DO</span>
                <span className="font-bold">: {doNumber}</span>
              </div>
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>Date</span>
                <span className="font-semibold">: {formatDate(doDate)}</span>
              </div>
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>No. SO</span>
                <span>: {data.sales_order_number}</span>
              </div>
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>Customer</span>
                <span className="font-semibold">: {data.customer_name}</span>
              </div>
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>PIC</span>
                <span>: {data.customer_pic || '-'}</span>
              </div>
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>Phone</span>
                <span>: {data.customer_phone || '-'}</span>
              </div>
            </div>
            {/* Right column */}
            <div className="space-y-1.5">
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>PO Customer</span>
                <span className="font-semibold">: {data.customer_po_number}</span>
              </div>
              <div className="flex">
                <span className="w-28 shrink-0" style={{ color: '#555' }}>Ship Address</span>
                <span>: {data.ship_to_address || data.customer_address || '-'}</span>
              </div>
            </div>
          </div>

          {/* Items Table - SKU first, green bottle color */}
          <div className="mb-6">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr style={{ backgroundColor: '#1f2937', color: 'white' }}>
                  <th className="border border-gray-300 px-2 py-2 text-center w-8">No</th>
                  <th className="border border-gray-300 px-2 py-2 text-left w-24">SKU</th>
                  <th className="border border-gray-300 px-2 py-2 text-left">Nama Produk</th>
                  <th className="border border-gray-300 px-2 py-2 text-center w-14">Qty</th>
                  <th className="border border-gray-300 px-2 py-2 text-center w-16">Satuan</th>
                  <th className="border border-gray-300 px-2 py-2 text-left w-28">Batch No</th>
                  <th className="border border-gray-300 px-2 py-2 text-left w-24">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => (
                  <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td className="border border-gray-300 px-2 py-2 text-center">{idx + 1}</td>
                    <td className="border border-gray-300 px-2 py-2 font-medium" style={{ color: '#166534' }}>{item.sku || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2 font-medium">{item.product_name}</td>
                    <td className="border border-gray-300 px-2 py-2 text-center font-bold">{item.qty_out}</td>
                    <td className="border border-gray-300 px-2 py-2 text-center">{item.unit_name || '-'}</td>
                    <td className="border border-gray-300 px-2 py-2">{item.batch_no}</td>
                    <td className="border border-gray-300 px-2 py-2">{item.expired_date ? formatDate(item.expired_date) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <td colSpan={3} className="border border-gray-300 px-2 py-2 text-right font-bold">Total:</td>
                  <td className="border border-gray-300 px-2 py-2 text-center font-bold">
                    {data.items.reduce((s, i) => s + i.qty_out, 0)}
                  </td>
                  <td colSpan={3} className="border border-gray-300 px-2 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes - in a bordered box above signature */}
          {data.notes && (
            <div className="mb-6" style={{ border: '1px solid #d1d5db', padding: '10px 14px', borderRadius: '4px' }}>
              <p className="font-semibold text-sm mb-1" style={{ color: '#111' }}>Catatan / Notes:</p>
              <p className="text-sm" style={{ color: '#555' }}>{data.notes}</p>
            </div>
          )}

          {/* Signature Section - 4 columns with Date + name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0', borderTop: '1px solid #000', borderLeft: '1px solid #000' }}>
            {/* Received by */}
            <div style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
              <div style={{ borderBottom: '1px solid #000', padding: '4px 8px', fontSize: '11px' }}>
                Date :
              </div>
              <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600 }}>
                Received by,
              </div>
              <div style={{ height: '70px' }}></div>
              <div style={{ padding: '4px 8px', borderTop: '1px dashed #999', margin: '0 8px', textAlign: 'center', fontSize: '10px', color: '#666' }}>
                (........................................)
              </div>
            </div>
            {/* Shipped by */}
            <div style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
              <div style={{ borderBottom: '1px solid #000', padding: '4px 8px', fontSize: '11px' }}>
                Date :
              </div>
              <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600 }}>
                Shipped by,
              </div>
              <div style={{ height: '70px' }}></div>
              <div style={{ padding: '4px 8px', borderTop: '1px dashed #999', margin: '0 8px', textAlign: 'center', fontSize: '10px', color: '#666' }}>
                (........................................)
              </div>
            </div>
            {/* Warehouse by */}
            <div style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
              <div style={{ borderBottom: '1px solid #000', padding: '4px 8px', fontSize: '11px' }}>
                Date :
              </div>
              <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600 }}>
                Warehouse by,
              </div>
              <div style={{ height: '70px' }}></div>
              <div style={{ padding: '4px 8px', borderTop: '1px dashed #999', margin: '0 8px', textAlign: 'center', fontSize: '10px', color: '#666' }}>
                (........................................)
              </div>
            </div>
            {/* Approved by */}
            <div style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
              <div style={{ borderBottom: '1px solid #000', padding: '4px 8px', fontSize: '11px' }}>
                Date :
              </div>
              <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600 }}>
                Approved by,
              </div>
              <div style={{ height: '70px' }}></div>
              <div style={{ padding: '4px 8px', borderTop: '1px dashed #999', margin: '0 8px', textAlign: 'center', fontSize: '10px', color: '#666' }}>
                (........................................)
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-xs" style={{ color: '#999' }}>
            <p>Dicetak pada: {format(new Date(), 'dd MMM yyyy HH:mm', { locale: localeId })}</p>
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
          <Button onClick={handlePrint} disabled={isPrinting}>
            {isPrinting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 mr-2" />
                Simpan PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
