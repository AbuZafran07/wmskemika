import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Printer, X, Loader2, FileText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface StockOutRecord {
  id: string;
  stock_out_number: string;
  delivery_date: string;
  delivery_number?: string | null;
  delivery_actual_date?: string | null;
  notes?: string | null;
  sales_order: {
    sales_order_number: string;
    customer: { name: string } | null;
  } | null;
  items: {
    id: string;
    qty_out: number;
    batch: { batch_no: string; expired_date: string | null } | null;
    product: { name: string; sku: string | null } | null;
  }[];
}

interface OutboundBulkPdfPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: StockOutRecord[];
  filterDescription: string;
}

export function OutboundBulkPdfPreview({ open, onOpenChange, records, filterDescription }: OutboundBulkPdfPreviewProps) {
  const { language } = useLanguage();
  const [isPrinting, setIsPrinting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });
  };

  const totalQty = records.reduce(
    (sum, r) => sum + r.items.reduce((s, i) => s + i.qty_out, 0), 0
  );

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
      document.body.appendChild(offscreenContainer);

      const clonedContent = contentRef.current.cloneNode(true) as HTMLElement;
      clonedContent.style.width = '100%';
      offscreenContainer.appendChild(clonedContent);

      const images = offscreenContainer.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(
          (img) => new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else { img.onload = () => resolve(); img.onerror = () => resolve(); }
          })
        )
      );

      const canvas = await html2canvas(offscreenContainer, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pageHeight = 297;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);

      // Multi-page support
      let remainingHeight = pdfHeight - pageHeight;
      while (remainingHeight > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        remainingHeight -= pageHeight;
      }

      pdf.save(`outbound-report-${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.removeChild(offscreenContainer);
    } catch (error) {
      console.error('PDF generation error:', error);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {language === 'en' ? 'Print Outbound Report (Bulk)' : 'Cetak Laporan Pengiriman (Keseluruhan)'}
          </DialogTitle>
        </DialogHeader>

        {/* PDF Preview Content */}
        <div className="border rounded-lg p-6 bg-white text-black" ref={contentRef}>
          {/* Header */}
          <div className="flex items-start justify-between mb-4 pb-3 border-b-2 border-gray-800">
            <div className="flex items-center gap-4">
              <img
                src="/logo-kemika.png"
                alt="Kemika Logo"
                className="h-12 object-contain"
                crossOrigin="anonymous"
              />
              <div>
                <h1 className="text-lg font-bold text-gray-900">PT. KEMIKA KARYA PRATAMA</h1>
                <p className="text-xs text-gray-600">Warehouse Management System</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold text-gray-900">LAPORAN PENGIRIMAN</h2>
              <p className="text-xs text-gray-600">Outbound Report</p>
            </div>
          </div>

          {/* Filter Info */}
          <div className="mb-4 text-xs">
            <div className="flex gap-6">
              <div>
                <span className="text-gray-500">Filter: </span>
                <span className="font-medium">{filterDescription}</span>
              </div>
              <div>
                <span className="text-gray-500">Dicetak: </span>
                <span className="font-medium">{format(new Date(), 'dd MMM yyyy HH:mm', { locale: localeId })}</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="border border-gray-300 rounded p-2 text-center">
              <p className="text-xs text-gray-500">Total Transaksi</p>
              <p className="text-lg font-bold">{records.length}</p>
            </div>
            <div className="border border-gray-300 rounded p-2 text-center">
              <p className="text-xs text-gray-500">Total Item</p>
              <p className="text-lg font-bold">{records.reduce((s, r) => s + r.items.length, 0)}</p>
            </div>
            <div className="border border-gray-300 rounded p-2 text-center">
              <p className="text-xs text-gray-500">Total Qty Keluar</p>
              <p className="text-lg font-bold text-blue-600">{totalQty.toLocaleString()}</p>
            </div>
          </div>

          {/* Main Table */}
          <table className="w-full border-collapse text-xs mb-4">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="border border-gray-300 px-2 py-1.5 text-left w-6">No</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">No. Pengiriman</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">Tanggal</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">Sales Order</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">Customer</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">Produk</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">SKU</th>
                <th className="border border-gray-300 px-2 py-1.5 text-center w-10">Qty</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">Batch</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, rIdx) => {
                const displayNo = record.delivery_number || record.stock_out_number;
                const displayDate = record.delivery_actual_date || record.delivery_date;
                return record.items.map((item, iIdx) => (
                  <tr key={`${record.id}-${item.id}`} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {iIdx === 0 && (
                      <>
                        <td className="border border-gray-300 px-2 py-1" rowSpan={record.items.length}>{rIdx + 1}</td>
                        <td className="border border-gray-300 px-2 py-1 font-medium" rowSpan={record.items.length}>{displayNo}</td>
                        <td className="border border-gray-300 px-2 py-1" rowSpan={record.items.length}>{formatDate(displayDate)}</td>
                        <td className="border border-gray-300 px-2 py-1" rowSpan={record.items.length}>{record.sales_order?.sales_order_number || '-'}</td>
                        <td className="border border-gray-300 px-2 py-1" rowSpan={record.items.length}>{record.sales_order?.customer?.name || '-'}</td>
                      </>
                    )}
                    <td className="border border-gray-300 px-2 py-1">{item.product?.name || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-600">{item.product?.sku || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center font-semibold">{item.qty_out}</td>
                    <td className="border border-gray-300 px-2 py-1">{item.batch?.batch_no || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1">{item.batch?.expired_date ? formatDate(item.batch.expired_date) : '-'}</td>
                  </tr>
                ));
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={7} className="border border-gray-300 px-2 py-1.5 text-right">Total Qty Keluar:</td>
                <td className="border border-gray-300 px-2 py-1.5 text-center">{totalQty.toLocaleString()}</td>
                <td colSpan={2} className="border border-gray-300 px-2 py-1.5"></td>
              </tr>
            </tfoot>
          </table>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t text-center text-xs text-gray-500">
            <p>© {new Date().getFullYear()} PT. Kemika Karya Pratama — Warehouse Management System</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Close' : 'Tutup'}
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting || records.length === 0}>
            {isPrinting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {language === 'en' ? 'Generating...' : 'Memproses...'}
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 mr-2" />
                {language === 'en' ? 'Print / Save PDF' : 'Cetak / Simpan PDF'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
