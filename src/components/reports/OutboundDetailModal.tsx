import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { X, Package, Truck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

interface OutboundDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: StockOutRecord | null;
}

export function OutboundDetailModal({ open, onOpenChange, record }: OutboundDetailModalProps) {
  const { language } = useLanguage();

  if (!record) return null;

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });
  };

  const totalQty = record.items.reduce((sum, item) => sum + item.qty_out, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-info" />
            {language === 'en' ? 'Outbound Detail' : 'Detail Pengiriman'}
          </DialogTitle>
        </DialogHeader>

        {/* Header Info */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Stock Out No' : 'No. Stock Out'}</p>
              <p className="font-semibold">{record.stock_out_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Delivery Date' : 'Tanggal Kirim'}</p>
              <p className="font-semibold">{formatDate(record.delivery_date)}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Sales Order</p>
              <p className="font-semibold">{record.sales_order?.sales_order_number || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Customer</p>
              <p className="font-semibold">{record.sales_order?.customer?.name || '-'}</p>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">
              {language === 'en' ? 'Delivered Items' : 'Item Dikirim'}
            </h3>
            <Badge variant="secondary">{record.items.length} items</Badge>
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">No</TableHead>
                  <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-center">{language === 'en' ? 'Qty Out' : 'Qty Keluar'}</TableHead>
                  <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                  <TableHead>{language === 'en' ? 'Expiry' : 'Kadaluarsa'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {record.items.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{item.product?.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.product?.sku || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="info">{item.qty_out}</Badge>
                    </TableCell>
                    <TableCell>{item.batch?.batch_no || '-'}</TableCell>
                    <TableCell>
                      {item.batch?.expired_date ? formatDate(item.batch.expired_date) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Total */}
          <div className="flex justify-end mt-3 p-3 bg-muted/50 rounded-lg">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{language === 'en' ? 'Total Qty Delivered' : 'Total Qty Dikirim'}</p>
              <p className="text-xl font-bold text-info">{totalQty.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {record.notes && (
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">{language === 'en' ? 'Notes' : 'Catatan'}</p>
            <p className="text-sm">{record.notes}</p>
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Close' : 'Tutup'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
