import React, { useState, useRef } from 'react';
import { Plus, Search, Filter, Eye, Edit, MoreHorizontal, CheckCircle, XCircle, Loader2, Upload, ArrowLeft, Trash2 } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanOrders, usePlanOrderItems, createPlanOrder, PlanOrderHeader, PlanOrderItem } from '@/hooks/usePlanOrders';
import { useSuppliers, useProducts, Product } from '@/hooks/useMasterData';
import { uploadFile } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OrderItem {
  id: string;
  product_id: string;
  product?: Partial<Product> & { id: string; name: string };
  unit_price: number;
  planned_qty: number;
  notes: string;
}

const statusConfig: Record<string, { label: string; labelId: string; variant: 'draft' | 'approved' | 'pending' | 'success' | 'cancelled' }> = {
  draft: { label: 'Draft', labelId: 'Draft', variant: 'draft' },
  approved: { label: 'Approved', labelId: 'Disetujui', variant: 'approved' },
  partially_received: { label: 'Partially Received', labelId: 'Diterima Sebagian', variant: 'pending' },
  received: { label: 'Received', labelId: 'Diterima', variant: 'success' },
  cancelled: { label: 'Cancelled', labelId: 'Dibatalkan', variant: 'cancelled' },
};

export default function PlanOrder() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { planOrders, loading, refetch } = usePlanOrders();
  const { suppliers } = useSuppliers();
  const { products } = useProducts();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PlanOrderHeader | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  
  // Fetch items for selected order in detail view
  const { items: selectedOrderItems, loading: itemsLoading } = usePlanOrderItems(selectedOrder?.id || null);
  
  // Form state
  const [planNumber, setPlanNumber] = useState('');
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [poDocumentUrl, setPoDocumentUrl] = useState('');
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('11');
  const [shippingCost, setShippingCost] = useState('0');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const filteredOrders = planOrders.filter(order =>
    order.plan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const calculateTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + (item.unit_price * item.planned_qty), 0);
    const discountValue = parseFloat(discount) || 0;
    const afterDiscount = subtotal - discountValue;
    const taxValue = afterDiscount * (parseFloat(taxRate) || 0) / 100;
    const shippingValue = parseFloat(shippingCost) || 0;
    const grandTotal = afterDiscount + taxValue + shippingValue;
    
    return { subtotal, discountValue, taxValue, shippingValue, grandTotal };
  };

  const resetForm = () => {
    setPlanNumber('');
    setPlanDate(new Date().toISOString().split('T')[0]);
    setSupplierId('');
    setExpectedDelivery('');
    setNotes('');
    setPoDocumentUrl('');
    setDiscount('0');
    setTaxRate('11');
    setShippingCost('0');
    setOrderItems([]);
  };

  const handleAddItem = () => {
    setOrderItems(prev => [...prev, {
      id: Date.now().toString(),
      product_id: '',
      unit_price: 0,
      planned_qty: 1,
      notes: '',
    }]);
  };

  const handleRemoveItem = (id: string) => {
    setOrderItems(prev => prev.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: string | number) => {
    setOrderItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      if (field === 'product_id') {
        const product = products.find(p => p.id === value);
        return {
          ...item,
          product_id: value as string,
          product,
          unit_price: product?.purchase_price || 0,
        };
      }
      
      return { ...item, [field]: value };
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, 'documents', 'plan-orders');
    
    if (result) {
      setPoDocumentUrl(result.url);
      toast.success(language === 'en' ? 'Document uploaded successfully' : 'Dokumen berhasil diupload');
    } else {
      toast.error(language === 'en' ? 'Failed to upload document' : 'Gagal upload dokumen');
    }
    setIsUploading(false);
  };

  const handleSubmit = async () => {
    if (!planNumber || !supplierId || orderItems.length === 0) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (orderItems.some(item => !item.product_id || item.planned_qty <= 0)) {
      toast.error(language === 'en' ? 'Please complete all line items' : 'Harap lengkapi semua item');
      return;
    }

    if (!poDocumentUrl) {
      toast.error(language === 'en' ? 'Please upload PO document' : 'Harap upload dokumen PO');
      return;
    }

    setIsSaving(true);
    const { subtotal, discountValue, grandTotal } = calculateTotals();

    const result = await createPlanOrder(
      {
        plan_number: planNumber,
        plan_date: planDate,
        supplier_id: supplierId,
        expected_delivery_date: expectedDelivery || null,
        notes: notes || null,
        po_document_url: poDocumentUrl,
        status: 'draft',
        total_amount: subtotal,
        discount: discountValue,
        tax_rate: parseFloat(taxRate) || 0,
        shipping_cost: parseFloat(shippingCost) || 0,
        grand_total: grandTotal,
        created_by: user?.id || null,
        approved_by: null,
        approved_at: null,
      },
      orderItems.map(item => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        planned_qty: item.planned_qty,
        notes: item.notes,
      }))
    );

    if (result.success) {
      toast.success(language === 'en' ? 'Plan Order created successfully' : 'Plan Order berhasil dibuat');
      setIsFormOpen(false);
      resetForm();
      refetch();
    } else {
      toast.error(result.error || 'Failed to create plan order');
    }

    setIsSaving(false);
  };

  const canApprove = () => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    // Check settings for allow_admin_approve
    return false; // Will be checked via settings
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;
    
    if (!canApprove() && user?.role !== 'super_admin') {
      toast.error(language === 'en' ? 'Only super_admin can approve orders' : 'Hanya super_admin yang dapat menyetujui order');
      return;
    }

    const { error } = await supabase
      .from('plan_order_headers')
      .update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', selectedOrder.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Plan Order approved' : 'Plan Order disetujui');
      refetch();
    }

    setIsApproveDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleCancel = async () => {
    if (!selectedOrder) return;

    const { error } = await supabase
      .from('plan_order_headers')
      .update({ status: 'cancelled' })
      .eq('id', selectedOrder.id);
    
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Plan Order cancelled' : 'Plan Order dibatalkan');
      refetch();
    }

    setIsCancelDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleViewDetail = (order: PlanOrderHeader) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);
  };

  const handleEdit = (order: PlanOrderHeader) => {
    // Populate form with order data
    setPlanNumber(order.plan_number);
    setPlanDate(order.plan_date);
    setSupplierId(order.supplier_id);
    setExpectedDelivery(order.expected_delivery_date || '');
    setNotes(order.notes || '');
    setPoDocumentUrl(order.po_document_url || '');
    setDiscount(order.discount?.toString() || '0');
    setTaxRate(order.tax_rate?.toString() || '11');
    setShippingCost(order.shipping_cost?.toString() || '0');
    setEditingOrderId(order.id);
    setIsEditMode(true);
    setIsFormOpen(true);
    
    // Fetch and populate items
    fetchOrderItemsForEdit(order.id);
  };

  const fetchOrderItemsForEdit = async (orderId: string) => {
    const { data, error } = await supabase
      .from('plan_order_items')
      .select(`*, product:products(id, name, sku, purchase_price)`)
      .eq('plan_order_id', orderId);
    
    if (!error && data) {
      setOrderItems(data.map(item => ({
        id: item.id,
        product_id: item.product_id,
        product: item.product,
        unit_price: item.unit_price,
        planned_qty: item.planned_qty,
        notes: item.notes || '',
      })));
    }
  };

  const handleUpdate = async () => {
    if (!editingOrderId || !planNumber || !supplierId || orderItems.length === 0) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (orderItems.some(item => !item.product_id || item.planned_qty <= 0)) {
      toast.error(language === 'en' ? 'Please complete all line items' : 'Harap lengkapi semua item');
      return;
    }

    setIsSaving(true);
    const { subtotal, discountValue, grandTotal } = calculateTotals();

    try {
      // Update header
      const { error: headerError } = await supabase
        .from('plan_order_headers')
        .update({
          plan_number: planNumber,
          plan_date: planDate,
          supplier_id: supplierId,
          expected_delivery_date: expectedDelivery || null,
          notes: notes || null,
          po_document_url: poDocumentUrl,
          total_amount: subtotal,
          discount: discountValue,
          tax_rate: parseFloat(taxRate) || 0,
          shipping_cost: parseFloat(shippingCost) || 0,
          grand_total: grandTotal,
        })
        .eq('id', editingOrderId);

      if (headerError) throw headerError;

      // Delete existing items and re-insert
      await supabase.from('plan_order_items').delete().eq('plan_order_id', editingOrderId);

      const itemsToInsert = orderItems.map(item => ({
        plan_order_id: editingOrderId,
        product_id: item.product_id,
        unit_price: item.unit_price,
        planned_qty: item.planned_qty,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase.from('plan_order_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      toast.success(language === 'en' ? 'Plan Order updated successfully' : 'Plan Order berhasil diupdate');
      setIsFormOpen(false);
      setIsEditMode(false);
      setEditingOrderId(null);
      resetForm();
      refetch();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update';
      toast.error(message);
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedOrder) return;

    try {
      // Delete items first
      await supabase.from('plan_order_items').delete().eq('plan_order_id', selectedOrder.id);
      
      // Delete header
      const { error } = await supabase
        .from('plan_order_headers')
        .delete()
        .eq('id', selectedOrder.id);
      
      if (error) throw error;
      
      toast.success(language === 'en' ? 'Plan Order deleted' : 'Plan Order dihapus');
      refetch();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete';
      toast.error(message);
    }

    setIsDeleteDialogOpen(false);
    setSelectedOrder(null);
  };

  const { subtotal, discountValue, taxValue, shippingValue, grandTotal } = calculateTotals();

  // Form View
  if (isFormOpen) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setIsFormOpen(false); setIsEditMode(false); setEditingOrderId(null); resetForm(); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {isEditMode 
                ? (language === 'en' ? 'Edit Plan Order' : 'Edit Plan Order')
                : (language === 'en' ? 'Create Plan Order' : 'Buat Plan Order')
              }
            </h1>
            <p className="text-muted-foreground">
              {isEditMode
                ? (language === 'en' ? 'Update existing plan order' : 'Ubah plan order yang ada')
                : (language === 'en' ? 'Create new inbound plan' : 'Buat rencana pembelian baru')
              }
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'en' ? 'Order Information' : 'Informasi Order'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Plan Number' : 'Nomor Plan'} *</Label>
                    <Input
                      placeholder="e.g., PO-2026-001"
                      value={planNumber}
                      onChange={(e) => setPlanNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Plan Date' : 'Tanggal Plan'} *</Label>
                    <Input
                      type="date"
                      value={planDate}
                      onChange={(e) => setPlanDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Supplier *</Label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'en' ? 'Select supplier' : 'Pilih supplier'} />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Expected Delivery' : 'Estimasi Pengiriman'}</Label>
                    <Input
                      type="date"
                      value={expectedDelivery}
                      onChange={(e) => setExpectedDelivery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'PO Document' : 'Dokumen PO'} *</Label>
                  <div className="flex items-center gap-4">
                    {poDocumentUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded">
                        <span className="text-sm truncate max-w-xs">{poDocumentUrl.split('/').pop()}</span>
                        <Button 
                          variant="ghost" 
                          size="iconSm"
                          onClick={() => setPoDocumentUrl('')}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {language === 'en' ? 'Upload Document' : 'Upload Dokumen'}
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
                  <Textarea
                    placeholder={language === 'en' ? 'Additional notes...' : 'Catatan tambahan...'}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{language === 'en' ? 'Order Items' : 'Item Order'}</CardTitle>
                <Button size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Add Item' : 'Tambah Item'}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                      <TableHead className="text-right">{language === 'en' ? 'Unit Price' : 'Harga'}</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {language === 'en' ? 'No items added yet' : 'Belum ada item'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Select
                              value={item.product_id}
                              onValueChange={(value) => handleItemChange(item.id, 'product_id', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={language === 'en' ? 'Select product' : 'Pilih produk'} />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} {p.sku && `(${p.sku})`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              className="w-32 text-right ml-auto"
                              value={item.unit_price}
                              onChange={(e) => handleItemChange(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="w-20 text-center mx-auto"
                              value={item.planned_qty}
                              onChange={(e) => handleItemChange(item.id, 'planned_qty', parseInt(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.unit_price * item.planned_qty)}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="iconSm"
                              onClick={() => handleRemoveItem(item.id)}
                            >
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
          </div>

          {/* Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'en' ? 'Order Summary' : 'Ringkasan Order'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Discount</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Tax (%)</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax Amount</span>
                    <span>{formatCurrency(taxValue)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{language === 'en' ? 'Shipping' : 'Ongkir'}</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                    />
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Grand Total</span>
                    <span className="text-primary">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button onClick={isEditMode ? handleUpdate : handleSubmit} disabled={isSaving} className="w-full">
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditMode 
                  ? (language === 'en' ? 'Update Order' : 'Update Order')
                  : (language === 'en' ? 'Save as Draft' : 'Simpan Draft')
                }
              </Button>
              <Button variant="outline" onClick={() => { setIsFormOpen(false); setIsEditMode(false); setEditingOrderId(null); resetForm(); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.planOrder')}</h1>
          <p className="text-muted-foreground">{t('menu.planOrderSub')} - {language === 'en' ? 'Manage procurement plans' : 'Kelola rencana pembelian'}</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {language === 'en' ? 'Create Plan Order' : 'Buat Plan Order'}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search by PO number or supplier...' : 'Cari berdasarkan nomor PO atau supplier...'}
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
                  <TableHead>{language === 'en' ? 'Plan Number' : 'Nomor Plan'}</TableHead>
                  <TableHead>{language === 'en' ? 'Date' : 'Tanggal'}</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>{language === 'en' ? 'Expected Delivery' : 'Estimasi Pengiriman'}</TableHead>
                  <TableHead className="text-right">{language === 'en' ? 'Total Amount' : 'Total'}</TableHead>
                  <TableHead className="text-center">{t('common.status')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No plan orders found' : 'Tidak ada plan order ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const status = statusConfig[order.status];
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.plan_number}</TableCell>
                        <TableCell>{formatDate(order.plan_date)}</TableCell>
                        <TableCell>{order.supplier?.name}</TableCell>
                        <TableCell>{order.expected_delivery_date ? formatDate(order.expected_delivery_date) : '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(order.grand_total)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={status?.variant || 'draft'}>
                            {language === 'en' ? status?.label : status?.labelId}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="iconSm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(order)}>
                                <Eye className="w-4 h-4 mr-2" />
                                {language === 'en' ? 'View Details' : 'Lihat Detail'}
                              </DropdownMenuItem>
                              {order.status === 'draft' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleEdit(order)}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    {t('common.edit')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-success"
                                    onClick={() => { setSelectedOrder(order); setIsApproveDialogOpen(true); }}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => { setSelectedOrder(order); setIsCancelDialogOpen(true); }}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Cancel
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onClick={() => { setSelectedOrder(order); setIsDeleteDialogOpen(true); }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {t('common.delete')}
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

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Approve Plan Order' : 'Setujui Plan Order'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to approve "${selectedOrder?.plan_number}"?`
                : `Apakah Anda yakin ingin menyetujui "${selectedOrder?.plan_number}"?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} className="bg-success hover:bg-success/90">
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Cancel Plan Order' : 'Batalkan Plan Order'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to cancel "${selectedOrder?.plan_number}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin membatalkan "${selectedOrder?.plan_number}"? Tindakan ini tidak dapat dibatalkan.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive hover:bg-destructive/90">
              {language === 'en' ? 'Cancel Order' : 'Batalkan Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Plan Order' : 'Hapus Plan Order'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${selectedOrder?.plan_number}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${selectedOrder?.plan_number}"? Tindakan ini tidak dapat dibatalkan.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Plan Order Details' : 'Detail Plan Order'}</DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Plan Number' : 'Nomor Plan'}</p>
                  <p className="font-medium">{selectedOrder.plan_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Date' : 'Tanggal'}</p>
                  <p className="font-medium">{formatDate(selectedOrder.plan_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{selectedOrder.supplier?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Expected Delivery' : 'Estimasi Pengiriman'}</p>
                  <p className="font-medium">{selectedOrder.expected_delivery_date ? formatDate(selectedOrder.expected_delivery_date) : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('common.status')}</p>
                  <Badge variant={statusConfig[selectedOrder.status]?.variant || 'draft'}>
                    {language === 'en' ? statusConfig[selectedOrder.status]?.label : statusConfig[selectedOrder.status]?.labelId}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Grand Total</p>
                  <p className="font-medium text-primary">{formatCurrency(selectedOrder.grand_total)}</p>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Notes' : 'Catatan'}</p>
                  <p className="text-sm">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Order Items */}
              <div>
                <h4 className="font-semibold mb-3">{language === 'en' ? 'Order Items' : 'Item Order'}</h4>
                {itemsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>{language === 'en' ? 'Product Name' : 'Nama Barang'}</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">{language === 'en' ? 'Unit Price' : 'Harga'}</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrderItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            {language === 'en' ? 'No items found' : 'Tidak ada item'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedOrderItems.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{item.product?.name}</p>
                                {item.product?.sku && (
                                  <p className="text-xs text-muted-foreground">SKU: {item.product.sku}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{item.planned_qty}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.subtotal || item.unit_price * item.planned_qty)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Summary */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span>-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({selectedOrder.tax_rate}%)</span>
                  <span>{formatCurrency((selectedOrder.total_amount - selectedOrder.discount) * selectedOrder.tax_rate / 100)}</span>
                </div>
                {selectedOrder.shipping_cost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === 'en' ? 'Shipping' : 'Ongkir'}</span>
                    <span>{formatCurrency(selectedOrder.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Grand Total</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.grand_total)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
