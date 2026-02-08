import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { X, Package } from 'lucide-react';
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

interface StockInRecord {
  id: string;
  stock_in_number: string;
  received_date: string;
  plan_order: {
    plan_number: string;
    supplier: { name: string } | null;
  } | null;
  items: {
    id: string;
    qty_received: number;
    batch_no: string;
    expired_date: string | null;
    product: { name: string; sku: string | null } | null;
  }[];
}

interface InboundDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: StockInRecord | null;
}

export function InboundDetailModal({ open, onOpenChange, record }: InboundDetailModalProps) {
  const { language } = useLanguage();

  if (!record) return null;

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd MMM yyyy', { locale: localeId });
  };

  const totalQty = record.items.reduce((sum, item) => sum + item.qty_received, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-success" />
            {language === 'en' ? 'Inbound Detail' : 'Detail Penerimaan'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info Header */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">
                {language === 'en' ? 'Stock In No' : 'No. Stock In'}
              </p>
              <p className="font-semibold">{record.stock_in_number}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {language === 'en' ? 'Date' : 'Tanggal'}
              </p>
              <p className="font-semibold">{formatDate(record.received_date)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Plan Order</p>
              <p className="font-semibold">{record.plan_order?.plan_number || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Supplier</p>
              <p className="font-semibold">{record.plan_order?.supplier?.name || '-'}</p>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              {language === 'en' ? 'Received Items' : 'Item Diterima'}
              <Badge variant="secondary">{record.items.length} items</Badge>
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-center">{language === 'en' ? 'Qty' : 'Qty'}</TableHead>
                    <TableHead>{language === 'en' ? 'Batch No' : 'No. Batch'}</TableHead>
                    <TableHead>{language === 'en' ? 'Expiry' : 'Kadaluarsa'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {record.items.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">{item.product?.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{item.product?.sku || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="success">{item.qty_received}</Badge>
                      </TableCell>
                      <TableCell>{item.batch_no}</TableCell>
                      <TableCell>
                        {item.expired_date ? formatDate(item.expired_date) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">
                  {language === 'en' ? 'Total Qty Received' : 'Total Qty Diterima'}
                </p>
                <p className="text-xl font-bold text-success">{totalQty}</p>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
