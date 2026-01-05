import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, Filter, Eye, Edit, MoreHorizontal, FileText, Printer, Trash2, Loader2, Upload, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSalesOrders, createSalesOrder, updateSalesOrderStatus, getProductStock } from '@/hooks/useSalesOrders';
import { useCustomers, useProducts, Product } from '@/hooks/useMasterData';
import { uploadFile } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; variant: 'draft' | 'approved' | 'pending' | 'success' | 'cancelled' }> = {
  draft: { label: 'Draft', variant: 'draft' },
  approved: { label: 'Approved', variant: 'approved' },
  partially_delivered: { label: 'Partially Delivered', variant: 'pending' },
  delivered: { label: 'Delivered', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'cancelled' },
};

const allocationTypes = ['Selling', 'Sample', 'Stock', 'Project'];

interface OrderItem {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  unit_price: number;
  ordered_qty: number;
  discount: number;
  subtotal: number;
  stock_available: number;
}

export default function SalesOrder() {
  const { t, language } = useLanguage();
  const { salesOrders, loading, refetch } = useSalesOrders();
  const { customers } = useCustomers();
  const { products } = useProducts();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [soNumber, setSoNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState('');
  const [customerPoNumber, setCustomerPoNumber] = useState('');
  const [salesName, setSalesName] = useState('');
  const [allocationType, setAllocationType] = useState('');
  const [projectInstansi, setProjectInstansi] = useState('');
  const [deliveryDeadline, setDeliveryDeadline] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [poDocumentUrl, setPoDocumentUrl] = useState('');
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(11);
  const [shippingCost, setShippingCost] = useState(0);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Product selection
  const [selectedProductId, setSelectedProductId] = useState('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const filteredOrders = salesOrders.filter(order =>
    order.sales_order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer_po_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const generateSoNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setSoNumber(`SO-${year}${month}-${random}`);
  };

  const handleOpenDialog = () => {
    generateSoNumber();
    setOrderDate(new Date().toISOString().split('T')[0]);
    setCustomerId('');
    setCustomerPoNumber('');
    setSalesName('');
    setAllocationType('');
    setProjectInstansi('');
    setDeliveryDeadline('');
    setShipToAddress('');
    setNotes('');
    setPoDocumentUrl('');
    setDiscount(0);
    setTaxRate(11);
    setShippingCost(0);
    setOrderItems([]);
    setIsDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, 'documents', 'po-documents');
    
    if (result) {
      setPoDocumentUrl(result.url);
      toast.success(language === 'en' ? 'Document uploaded successfully' : 'Dokumen berhasil diupload');
    } else {
      toast.error(language === 'en' ? 'Failed to upload document' : 'Gagal upload dokumen');
    }
    setIsUploading(false);
  };

  const handleAddProduct = async () => {
    if (!selectedProductId) return;

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    // Check if already added
    if (orderItems.some(item => item.product_id === selectedProductId)) {
      toast.error(language === 'en' ? 'Product already added' : 'Produk sudah ditambahkan');
      return;
    }

    // Get stock availability
    const stockAvailable = await getProductStock(selectedProductId);

    const newItem: OrderItem = {
      product_id: product.id,
      product_name: product.name,
      sku: product.sku || '-',
      unit: product.unit?.name || '-',
      unit_price: product.selling_price || product.purchase_price,
      ordered_qty: 1,
      discount: 0,
      subtotal: product.selling_price || product.purchase_price,
      stock_available: stockAvailable,
    };

    setOrderItems(prev => [...prev, newItem]);
    setSelectedProductId('');
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: number) => {
    setOrderItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      // Recalculate subtotal
      const qty = field === 'ordered_qty' ? value : item.ordered_qty;
      const price = field === 'unit_price' ? value : item.unit_price;
      const disc = field === 'discount' ? value : item.discount;
      updated.subtotal = (qty * price) - disc;
      return updated;
    }));
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalAfterDiscount = subtotal - discount;
    const taxAmount = totalAfterDiscount * (taxRate / 100);
    const grandTotal = totalAfterDiscount + taxAmount + shippingCost;
    return { subtotal, taxAmount, grandTotal };
  };

  const handleSave = async (asDraft: boolean = true) => {
    if (!customerId || !customerPoNumber || !salesName || !allocationType || !projectInstansi || !deliveryDeadline) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (orderItems.length === 0) {
      toast.error(language === 'en' ? 'Please add at least one product' : 'Tambahkan minimal satu produk');
      return;
    }

    // Check stock availability
    for (const item of orderItems) {
      if (item.ordered_qty > item.stock_available) {
        toast.warning(
          language === 'en' 
            ? `Warning: ${item.product_name} has insufficient stock (Available: ${item.stock_available})`
            : `Peringatan: ${item.product_name} stok tidak cukup (Tersedia: ${item.stock_available})`
        );
      }
    }

    setIsSaving(true);

    const { subtotal, grandTotal } = calculateTotals();

    const result = await createSalesOrder(
      {
        sales_order_number: soNumber,
        order_date: orderDate,
        customer_id: customerId,
        customer_po_number: customerPoNumber,
        sales_name: salesName,
        allocation_type: allocationType,
        project_instansi: projectInstansi,
        delivery_deadline: deliveryDeadline,
        ship_to_address: shipToAddress || null,
        notes: notes || null,
        po_document_url: poDocumentUrl || null,
        status: asDraft ? 'draft' : 'approved',
        total_amount: subtotal,
        discount: discount,
        tax_rate: taxRate,
        shipping_cost: shippingCost,
        grand_total: grandTotal,
        created_by: null,
        approved_by: null,
        approved_at: null,
      },
      orderItems.map(item => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        ordered_qty: item.ordered_qty,
        discount: item.discount,
        notes: undefined,
      }))
    );

    if (result.success) {
      toast.success(language === 'en' ? 'Sales Order created successfully' : 'Sales Order berhasil dibuat');
      setIsDialogOpen(false);
      refetch();
    } else {
      toast.error(result.error || 'Failed to create Sales Order');
    }

    setIsSaving(false);
  };

  const handleApprove = async (id: string) => {
    const result = await updateSalesOrderStatus(id, 'approved');
    if (result.success) {
      toast.success(language === 'en' ? 'Sales Order approved' : 'Sales Order disetujui');
      refetch();
    } else {
      toast.error(result.error);
    }
  };

  const { subtotal, taxAmount, grandTotal } = calculateTotals();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.salesOrder')}</h1>
          <p className="text-muted-foreground">{t('menu.salesOrderSub')} - {language === 'en' ? 'Manage customer orders' : 'Kelola pesanan customer'}</p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="w-4 h-4 mr-2" />
          {language === 'en' ? 'Create Sales Order' : 'Buat Sales Order'}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search by SO number, customer, or PO...' : 'Cari berdasarkan No. SO, customer, atau PO...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              {t('common.filter')}
            </Button>
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
                  <TableHead>{language === 'en' ? 'SO Number' : 'No. SO'}</TableHead>
                  <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>{language === 'en' ? 'Customer PO' : 'PO Customer'}</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>{language === 'en' ? 'Allocation' : 'Alokasi'}</TableHead>
                  <TableHead className="text-right">{language === 'en' ? 'Amount' : 'Jumlah'}</TableHead>
                  <TableHead className="text-center">{t('common.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No sales orders found' : 'Tidak ada sales order ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const status = statusConfig[order.status] || statusConfig.draft;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.sales_order_number}</TableCell>
                        <TableCell>{formatDate(order.order_date)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.customer?.name}</p>
                            <p className="text-xs text-muted-foreground">{order.project_instansi}</p>
                          </div>
                        </TableCell>
                        <TableCell>{order.customer_po_number}</TableCell>
                        <TableCell>{order.sales_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{order.allocation_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(order.grand_total)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="iconSm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="w-4 h-4 mr-2" />
                                {language === 'en' ? 'View Details' : 'Lihat Detail'}
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Printer className="w-4 h-4 mr-2" />
                                Print PDF
                              </DropdownMenuItem>
                              {order.status === 'draft' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleApprove(order.id)}>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    {language === 'en' ? 'Approve' : 'Setujui'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Edit className="w-4 h-4 mr-2" />
                                    {t('common.edit')}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Sales Order Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Create Sales Order' : 'Buat Sales Order'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Header Info */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'SO Number' : 'No. SO'} *</Label>
                <Input value={soNumber} onChange={(e) => setSoNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Order Date' : 'Tanggal Order'} *</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select customer' : 'Pilih customer'} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Customer PO Number' : 'No. PO Customer'} *</Label>
                <Input
                  placeholder="e.g., CUST-PO-001"
                  value={customerPoNumber}
                  onChange={(e) => setCustomerPoNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Sales Name' : 'Nama Sales'} *</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter sales name' : 'Nama sales'}
                  value={salesName}
                  onChange={(e) => setSalesName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Allocation Type' : 'Tipe Alokasi'} *</Label>
                <Select value={allocationType} onValueChange={setAllocationType}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select type' : 'Pilih tipe'} />
                  </SelectTrigger>
                  <SelectContent>
                    {allocationTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Project/Instansi' : 'Proyek/Instansi'} *</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter project name' : 'Nama proyek'}
                  value={projectInstansi}
                  onChange={(e) => setProjectInstansi(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Delivery Deadline' : 'Batas Pengiriman'} *</Label>
                <Input
                  type="date"
                  value={deliveryDeadline}
                  onChange={(e) => setDeliveryDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Ship To Address' : 'Alamat Pengiriman'}</Label>
                <Textarea
                  placeholder={language === 'en' ? 'Enter shipping address' : 'Alamat pengiriman'}
                  value={shipToAddress}
                  onChange={(e) => setShipToAddress(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
                <Textarea
                  placeholder={language === 'en' ? 'Enter notes' : 'Catatan'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'PO Document' : 'Dokumen PO'}</Label>
              <div className="flex gap-2">
                <Input
                  value={poDocumentUrl ? 'Document uploaded' : ''}
                  disabled
                  placeholder={language === 'en' ? 'Upload PO document' : 'Upload dokumen PO'}
                  className="bg-muted"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
                {poDocumentUrl && (
                  <Button variant="outline" size="icon" onClick={() => setPoDocumentUrl('')}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>

            {/* Product Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{language === 'en' ? 'Order Items' : 'Item Pesanan'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={language === 'en' ? 'Select product to add' : 'Pilih produk untuk ditambahkan'} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.filter(p => p.is_active).map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.sku || '-'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddProduct} disabled={!selectedProductId}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('common.add')}
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>{language === 'en' ? 'Unit' : 'Satuan'}</TableHead>
                      <TableHead className="text-center">{language === 'en' ? 'Stock' : 'Stok'}</TableHead>
                      <TableHead className="text-right">{language === 'en' ? 'Unit Price' : 'Harga Satuan'}</TableHead>
                      <TableHead className="text-center">{language === 'en' ? 'Qty' : 'Jumlah'}</TableHead>
                      <TableHead className="text-right">{language === 'en' ? 'Discount' : 'Diskon'}</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          {language === 'en' ? 'No products added' : 'Belum ada produk ditambahkan'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((item, index) => (
                        <TableRow key={item.product_id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.sku}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={item.stock_available >= item.ordered_qty ? 'success' : 'pending'}>
                              {item.stock_available}
                            </Badge>
                            {item.stock_available < item.ordered_qty && (
                              <AlertTriangle className="w-4 h-4 text-warning inline ml-1" />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              value={item.unit_price}
                              onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-28 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.ordered_qty}
                              onChange={(e) => handleItemChange(index, 'ordered_qty', parseInt(e.target.value) || 1)}
                              className="w-20 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={item.discount}
                              onChange={(e) => handleItemChange(index, 'discount', parseFloat(e.target.value) || 0)}
                              className="w-24 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.subtotal)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(index)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Discount' : 'Diskon'}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Tax Rate (%)' : 'Tarif Pajak (%)'}</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Shipping Cost' : 'Biaya Pengiriman'}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'en' ? 'Discount' : 'Diskon'}</span>
                    <span className="font-medium text-destructive">-{formatCurrency(discount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'en' ? 'Tax' : 'Pajak'} ({taxRate}%)</span>
                    <span className="font-medium">{formatCurrency(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === 'en' ? 'Shipping' : 'Pengiriman'}</span>
                    <span className="font-medium">{formatCurrency(shippingCost)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between">
                    <span className="font-bold">Grand Total</span>
                    <span className="font-bold text-lg">{formatCurrency(grandTotal)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="outline" onClick={() => handleSave(true)} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Save as Draft' : 'Simpan Draft'}
            </Button>
            <Button onClick={() => handleSave(false)} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Save & Approve' : 'Simpan & Setujui'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
