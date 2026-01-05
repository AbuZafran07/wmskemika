import React, { useState } from 'react';
import { RefreshCw, Info, CheckCircle, AlertCircle, Calendar, Package, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { useLanguage } from '@/contexts/LanguageContext';

// Mock data for Plan Orders
const availablePlanOrders = [
  { id: '1', number: 'PO-2026-001', supplier: 'PT. Supplier Utama', status: 'approved' },
  { id: '2', number: 'PO-2026-002', supplier: 'PT. Chemical Indonesia', status: 'partially_received' },
];

export default function StockIn() {
  const { t, language } = useLanguage();
  const [selectedPlanOrder, setSelectedPlanOrder] = useState<string>('');
  const [inboundDate, setInboundDate] = useState(new Date().toISOString().split('T')[0]);

  const selectedOrder = availablePlanOrders.find(po => po.id === selectedPlanOrder);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-success/10 rounded-lg">
            <Package className="w-6 h-6 text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {t('menu.stockIn')} ({language === 'en' ? 'Inbound' : 'Penerimaan'}) - From Plan Order
            </h1>
          </div>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Step 1: Select Plan Order */}
      <Card className="border-info/30 bg-info/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-info" />
            <CardTitle className="text-base text-info">
              {language === 'en' ? 'Step 1: Select Plan Order' : 'Langkah 1: Pilih Plan Order'}
            </CardTitle>
          </div>
          <CardDescription>
            {language === 'en' 
              ? 'Stock In MUST be created from an approved Plan Order. Only Plan Orders with remaining quantities will appear below.'
              : 'Stock In HARUS dibuat dari Plan Order yang sudah disetujui. Hanya Plan Order dengan sisa kuantitas yang akan muncul di bawah.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label className="text-sm font-medium">Plan Order *</label>
            <Select value={selectedPlanOrder} onValueChange={setSelectedPlanOrder}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'en' ? '-- Select Plan Order --' : '-- Silakan pilih Plan Order --'} />
              </SelectTrigger>
              <SelectContent>
                {availablePlanOrders.map(po => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.number} - {po.supplier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inbound Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">Inbound Header</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Inbound *</label>
              <Input
                type="date"
                value={inboundDate}
                onChange={(e) => setInboundDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Plan Order No.</label>
              <Input
                value={selectedOrder?.number || ''}
                disabled
                placeholder="Will be filled after selecting Plan Order"
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Supplier</label>
              <Input
                value={selectedOrder?.supplier || ''}
                disabled
                placeholder="Will be filled after selecting Plan Order"
                className="bg-muted"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items to Receive */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">Items to Receive</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PRODUCT</TableHead>
                <TableHead>CODE</TableHead>
                <TableHead>CATEGORY</TableHead>
                <TableHead>UNIT</TableHead>
                <TableHead className="text-center">QTY ORDERED</TableHead>
                <TableHead className="text-center">QTY REMAINING</TableHead>
                <TableHead className="text-center">QTY RECEIVED *</TableHead>
                <TableHead>BATCH NO</TableHead>
                <TableHead>EXPIRED DATE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!selectedPlanOrder && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Package className="w-12 h-12 opacity-30" />
                      <p className="font-medium">
                        {language === 'en' ? 'Please select a Plan Order' : 'Silakan pilih Plan Order'}
                      </p>
                      <p className="text-sm">
                        {language === 'en' 
                          ? 'Items will appear after you select a Plan Order above'
                          : 'Items akan muncul setelah Anda memilih Plan Order di atas'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-info/30 bg-info/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-info">Partial Receiving</p>
              <p className="text-sm text-muted-foreground">
                {language === 'en'
                  ? "Enter the quantity you're receiving now. You can receive the remaining quantity in a future Stock In."
                  : 'Masukkan jumlah yang Anda terima sekarang. Anda dapat menerima sisa jumlah di Stock In berikutnya.'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-success">Full Receiving</p>
              <p className="text-sm text-muted-foreground">
                {language === 'en'
                  ? 'When all items are fully received, the Plan Order will automatically be marked as CLOSED.'
                  : 'Ketika semua item diterima penuh, Plan Order akan otomatis ditandai sebagai SELESAI.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline">
          <AlertCircle className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button disabled={!selectedPlanOrder}>
          <CheckCircle className="w-4 h-4 mr-2" />
          Save Stock In
        </Button>
      </div>
    </div>
  );
}
