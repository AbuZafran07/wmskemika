import React, { useState, useRef, useMemo } from 'react';
import { Plus, Search, Eye, Edit, MoreHorizontal, Printer, Trash2, Loader2, Upload, X, AlertTriangle, CheckCircle, XCircle, Archive, List, FileText } from 'lucide-react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useSalesOrders, 
  useSalesOrderItems,
  createSalesOrder, 
  updateSalesOrder,
  approveSalesOrder,
  cancelSalesOrder,
  deleteSalesOrder,
  getProductStock,
  SalesOrderHeader,
} from '@/hooks/useSalesOrders';
import { useSettings } from '@/hooks/usePlanOrders';
import { useCustomers, useProducts, Product } from '@/hooks/useMasterData';
import { uploadFile, getSignedUrl } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; labelId: string; variant: 'draft' | 'approved' | 'pending' | 'success' | 'cancelled' }> = {
  draft: { label: 'Draft', labelId: 'Draft', variant: 'draft' },
  approved: { label: 'Approved', labelId: 'Disetujui', variant: 'approved' },
  partially_delivered: { label: 'Partially Delivered', labelId: 'Terkirim Sebagian', variant: 'pending' },
  delivered: { label: 'Delivered', labelId: 'Terkirim', variant: 'success' },
  cancelled: { label: 'Cancelled', labelId: 'Dibatalkan', variant: 'cancelled' },
};

const allocationTypes = ['Selling', 'Sample', 'Stock', 'Project'];

interface OrderItem {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  category: string;
  unit_price: number;
  ordered_qty: number;
  discount: number;
  subtotal: number;
  stock_available: number;
}

export default function SalesOrder() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { salesOrders, loading, refetch } = useSalesOrders();
  const { customers } = useCustomers();
  const { products } = useProducts();
  const { allowAdminApprove } = useSettings();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrderHeader | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpeningPoDoc, setIsOpeningPoDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch items for detail view
  const { items: selectedOrderItems, loading: itemsLoading } = useSalesOrderItems(selectedOrder?.id || null);

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
  const [poDocumentKey, setPoDocumentKey] = useState('');
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(11);
  const [shippingCost, setShippingCost] = useState(0);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  // Check if user can approve orders
  const canApprove = useMemo(() => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'admin' && allowAdminApprove) return true;
    return false;
  }, [user, allowAdminApprove]);

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

  // Filter logic
  const filteredOrders = useMemo(() => {
    return salesOrders.filter(order => {
      const matchesSearch = 
        order.sales_order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_po_number.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      
      const orderDate = new Date(order.order_date);
      const matchesDateFrom = !dateFrom || orderDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || orderDate <= new Date(dateTo);
      
      const activeStatuses = ['draft', 'approved', 'partially_delivered'];
      const archivedStatuses = ['delivered', 'cancelled'];
      const matchesViewMode = viewMode === 'active' 
        ? activeStatuses.includes(order.status)
        : archivedStatuses.includes(order.status);
      
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [salesOrders, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  const clearFilters = () => {
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = statusFilter !== 'all' || dateFrom || dateTo;

  const generateSoNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setSoNumber(`SO-${year}${month}-${random}`);
  };

  const resetForm = () => {
    setSoNumber('');
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
    setPoDocumentKey('');
    setDiscount(0);
    setTaxRate(11);
    setShippingCost(0);
    setOrderItems([]);
    setSelectedProductId('');
  };

  const handleOpenDialog = () => {
    generateSoNumber();
    resetForm();
    setOrderDate(new Date().toISOString().split('T')[0]);
    setIsEditMode(false);
    setEditingOrderId(null);
    setIsDialogOpen(true);
  };

  const handleEdit = async (order: SalesOrderHeader) => {
    setSoNumber(order.sales_order_number);
    setOrderDate(order.order_date);
    setCustomerId(order.customer_id);
    setCustomerPoNumber(order.customer_po_number);
    setSalesName(order.sales_name);
    setAllocationType(order.allocation_type);
    setProjectInstansi(order.project_instansi);
    setDeliveryDeadline(order.delivery_deadline);
    setShipToAddress(order.ship_to_address || '');
    setNotes(order.notes || '');
    setPoDocumentUrl(order.po_document_url || '');
    setPoDocumentKey('');
    setDiscount(order.discount || 0);
    setTaxRate(order.tax_rate || 11);
    setShippingCost(order.shipping_cost || 0);
    setEditingOrderId(order.id);
    setIsEditMode(true);
    
    // Fetch items
    const { data } = await supabase
      .from('sales_order_items')
      .select(`*, product:products(id, name, sku, selling_price, category:categories(name), unit:units(name))`)
      .eq('sales_order_id', order.id);
    
    if (data) {
      const items: OrderItem[] = [];
      for (const item of data) {
        const stock = await getProductStock(item.product_id);
        items.push({
          product_id: item.product_id,
          product_name: item.product?.name || '',
          sku: item.product?.sku || '-',
          unit: item.product?.unit?.name || '-',
          category: item.product?.category?.name || '-',
          unit_price: item.unit_price,
          ordered_qty: item.ordered_qty,
          discount: item.discount || 0,
          subtotal: (item.ordered_qty * item.unit_price) - (item.discount || 0),
          stock_available: stock,
        });
      }
      setOrderItems(items);
    }
    
    setIsDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, 'documents', 'sales-orders');
    
    if (result) {
      setPoDocumentUrl(result.url);
      setPoDocumentKey(result.path);
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

    if (orderItems.some(item => item.product_id === selectedProductId)) {
      toast.error(language === 'en' ? 'Product already added' : 'Produk sudah ditambahkan');
      return;
    }

    const stockAvailable = await getProductStock(selectedProductId);

    const newItem: OrderItem = {
      product_id: product.id,
      product_name: product.name,
      sku: product.sku || '-',
      unit: product.unit?.name || '-',
      category: product.category?.name || '-',
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

  const handleSave = async () => {
    if (!customerId || !customerPoNumber || !salesName || !allocationType || !projectInstansi || !deliveryDeadline) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    if (orderItems.length === 0) {
      toast.error(language === 'en' ? 'Please add at least one product' : 'Tambahkan minimal satu produk');
      return;
    }

    // Warn about low stock
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

    if (isEditMode && editingOrderId) {
      const result = await updateSalesOrder(
        editingOrderId,
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
          total_amount: subtotal,
          discount: discount,
          tax_rate: taxRate,
          shipping_cost: shippingCost,
          grand_total: grandTotal,
        },
        orderItems.map(item => ({
          product_id: item.product_id,
          unit_price: item.unit_price,
          ordered_qty: item.ordered_qty,
          discount: item.discount,
        }))
      );

      if (result.success) {
        toast.success(language === 'en' ? 'Sales Order updated successfully' : 'Sales Order berhasil diupdate');
        setIsDialogOpen(false);
        setIsEditMode(false);
        setEditingOrderId(null);
        resetForm();
        refetch();
      } else {
        toast.error(result.error || 'Failed to update');
      }
    } else {
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
          status: 'draft',
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
        }))
      );

      if (result.success) {
        toast.success(language === 'en' ? 'Sales Order created successfully' : 'Sales Order berhasil dibuat');
        setIsDialogOpen(false);
        resetForm();
        refetch();
      } else {
        toast.error(result.error || 'Failed to create Sales Order');
      }
    }

    setIsSaving(false);
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;
    
    if (!canApprove) {
      toast.error(language === 'en' ? 'You do not have permission to approve orders' : 'Anda tidak memiliki izin untuk menyetujui order');
      return;
    }

    setIsApproving(true);
    const result = await approveSalesOrder(selectedOrder.id);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Sales Order approved' : 'Sales Order disetujui');
      refetch();
    } else {
      toast.error(result.error || 'Failed to approve');
    }

    setIsApproving(false);
    setIsApproveDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleCancel = async () => {
    if (!selectedOrder) return;

    setIsCancelling(true);
    const result = await cancelSalesOrder(selectedOrder.id);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Sales Order cancelled' : 'Sales Order dibatalkan');
      refetch();
    } else {
      toast.error(result.error || 'Failed to cancel');
    }

    setIsCancelling(false);
    setIsCancelDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleDelete = async () => {
    if (!selectedOrder) return;

    setIsDeleting(true);
    const result = await deleteSalesOrder(selectedOrder.id);
    
    if (result.success) {
      toast.success(language === 'en' ? 'Sales Order deleted' : 'Sales Order dihapus');
      refetch();
    } else {
      toast.error(result.error || 'Failed to delete');
    }

    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleViewDetail = (order: SalesOrderHeader) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);
  };

  const handleViewPoDocument = async (order: SalesOrderHeader) => {
    if (!order.po_document_url) {
      toast.error(language === 'en' ? 'No document attached' : 'Tidak ada dokumen terlampir');
      return;
    }

    setIsOpeningPoDoc(true);
    try {
      // Extract path from URL or use directly
      const url = order.po_document_url;
      let path = url;
      
      // If it's a full URL, extract the path portion
      if (url.includes('/storage/v1/object/')) {
        const pathMatch = url.match(/\/storage\/v1\/object\/(?:sign|public)\/documents\/(.+?)(?:\?|$)/);
        if (pathMatch) {
          path = pathMatch[1];
        }
      }

      // Get a fresh signed URL
      const signedUrl = await getSignedUrl(path, 'documents', 3600);
      
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      } else {
        // Fallback to original URL if signing fails
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error opening document:', error);
      toast.error(language === 'en' ? 'Failed to open document' : 'Gagal membuka dokumen');
    }
    setIsOpeningPoDoc(false);
  };

  // Get display filename from URL
  const getDocumentFilename = (url: string | null): string => {
    if (!url) return '';
    try {
      const decoded = decodeURIComponent(url);
      const parts = decoded.split('/');
      const filename = parts[parts.length - 1].split('?')[0];
      // Remove UUID prefix if present (format: uuid_filename.ext)
      const underscoreIdx = filename.indexOf('_');
      if (underscoreIdx > 30) { // UUID is 36 chars, so check if underscore is after a long prefix
        return filename.substring(underscoreIdx + 1);
      }
      return filename;
    } catch {
      return 'Document';
    }
  };

  const handleExportPDF = () => {
    if (!selectedOrder || !printRef.current) return;
    
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sales Order - ${selectedOrder.sales_order_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; font-size: 12px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
            .company-name { font-size: 18px; font-weight: bold; color: #1a365d; }
            .document-title { font-size: 16px; margin-top: 10px; font-weight: 600; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .info-item label { font-size: 10px; color: #666; text-transform: uppercase; display: block; margin-bottom: 2px; }
            .info-item p { font-weight: 500; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: 600; font-size: 11px; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .summary { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px; }
            .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
            .summary-row.total { font-weight: bold; font-size: 14px; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
            .badge-draft { background: #e2e8f0; color: #475569; }
            .badge-approved { background: #dcfce7; color: #166534; }
            .badge-pending { background: #fef3c7; color: #92400e; }
            .badge-success { background: #d1fae5; color: #065f46; }
            .badge-cancelled { background: #fee2e2; color: #991b1b; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); } }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
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

      {/* Tabs: Active / Archived */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'active' | 'archived')}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <List className="w-4 h-4" />
            {language === 'en' ? 'Active' : 'Aktif'}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="w-4 h-4" />
            {language === 'en' ? 'Archived' : 'Arsip'}
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={language === 'en' ? 'All Status' : 'Semua Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All Status' : 'Semua Status'}</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">{language === 'en' ? 'Approved' : 'Disetujui'}</SelectItem>
                <SelectItem value="partially_delivered">{language === 'en' ? 'Partially Delivered' : 'Terkirim Sebagian'}</SelectItem>
                <SelectItem value="delivered">{language === 'en' ? 'Delivered' : 'Terkirim'}</SelectItem>
                <SelectItem value="cancelled">{language === 'en' ? 'Cancelled' : 'Dibatalkan'}</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  {language === 'en' ? 'Date Range' : 'Rentang Tanggal'}
                  {hasActiveFilters && <Badge variant="draft" className="text-xs px-1">{language === 'en' ? 'Active' : 'Aktif'}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'From Date' : 'Dari Tanggal'}</Label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'To Date' : 'Sampai Tanggal'}</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
                    {language === 'en' ? 'Clear Filters' : 'Hapus Filter'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
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
                    const showApprove = order.status === 'draft' && canApprove;
                    const showCancel = order.status === 'draft' || order.status === 'approved';
                    const showEdit = order.status === 'draft';
                    const showDelete = order.status === 'draft';
                    
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
                          <Badge variant={status.variant}>
                            {language === 'en' ? status.label : status.labelId}
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
                              {order.po_document_url && (
                                <DropdownMenuItem onClick={() => handleViewPoDocument(order)} disabled={isOpeningPoDoc}>
                                  <FileText className="w-4 h-4 mr-2" />
                                  {language === 'en' ? 'View Document' : 'Lihat Dokumen'}
                                </DropdownMenuItem>
                              )}
                              {showEdit && (
                                <DropdownMenuItem onClick={() => handleEdit(order)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  {t('common.edit')}
                                </DropdownMenuItem>
                              )}
                              {showApprove && (
                                <DropdownMenuItem className="text-success" onClick={() => { setSelectedOrder(order); setIsApproveDialogOpen(true); }}>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                              )}
                              {showCancel && (
                                <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedOrder(order); setIsCancelDialogOpen(true); }}>
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                              )}
                              {showDelete && (
                                <DropdownMenuItem className="text-destructive" onClick={() => { setSelectedOrder(order); setIsDeleteDialogOpen(true); }}>
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t('common.delete')}
                                </DropdownMenuItem>
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

      {/* Create/Edit Sales Order Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode 
                ? (language === 'en' ? 'Edit Sales Order' : 'Edit Sales Order')
                : (language === 'en' ? 'Create Sales Order' : 'Buat Sales Order')
              }
            </DialogTitle>
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
                <Input placeholder="e.g., CUST-PO-001" value={customerPoNumber} onChange={(e) => setCustomerPoNumber(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Sales Name' : 'Nama Sales'} *</Label>
                <Input placeholder={language === 'en' ? 'Enter sales name' : 'Nama sales'} value={salesName} onChange={(e) => setSalesName(e.target.value)} />
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
                <Input placeholder={language === 'en' ? 'Enter project name' : 'Nama proyek'} value={projectInstansi} onChange={(e) => setProjectInstansi(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Delivery Deadline' : 'Batas Pengiriman'} *</Label>
                <Input type="date" value={deliveryDeadline} onChange={(e) => setDeliveryDeadline(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Ship To Address' : 'Alamat Pengiriman'}</Label>
                <Textarea placeholder={language === 'en' ? 'Enter shipping address' : 'Alamat pengiriman'} value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Notes' : 'Catatan'}</Label>
                <Textarea placeholder={language === 'en' ? 'Enter notes' : 'Catatan'} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{language === 'en' ? 'PO Document' : 'Dokumen PO'}</Label>
              <div className="flex gap-2">
                {poDocumentUrl ? (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded flex-1 overflow-hidden">
                    <span className="text-sm text-primary truncate max-w-[300px]">
                      {(() => {
                        // Extract filename from URL (before query params)
                        const urlPath = poDocumentUrl.split('?')[0];
                        const segments = urlPath.split('/');
                        const filename = segments[segments.length - 1];
                        // Remove UUID prefix if present (format: uuid-filename.ext)
                        const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-/i;
                        return decodeURIComponent(filename.replace(uuidPattern, ''));
                      })()}
                    </span>
                  </div>
                ) : (
                  <Input value="" disabled placeholder={language === 'en' ? 'Upload PO document' : 'Upload dokumen PO'} className="bg-muted flex-1" />
                )}
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
                {poDocumentUrl && (
                  <Button variant="outline" size="icon" onClick={() => { setPoDocumentUrl(''); setPoDocumentKey(''); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileUpload} />
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
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku || '-'})</SelectItem>
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
                      <TableHead className="text-right">{language === 'en' ? 'Unit Price' : 'Harga'}</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
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
                            <Input type="number" min="0" value={item.unit_price} onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)} className="w-28 text-right" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" min="1" value={item.ordered_qty} onChange={(e) => handleItemChange(index, 'ordered_qty', parseInt(e.target.value) || 1)} className="w-20 text-center" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" min="0" value={item.discount} onChange={(e) => handleItemChange(index, 'discount', parseFloat(e.target.value) || 0)} className="w-24 text-right" />
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.subtotal)}</TableCell>
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
                    <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'en' ? 'Tax Rate (%)' : 'Tarif Pajak (%)'}</Label>
                    <Input type="number" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{language === 'en' ? 'Shipping Cost' : 'Biaya Pengiriman'}</Label>
                  <Input type="number" min="0" value={shippingCost} onChange={(e) => setShippingCost(parseFloat(e.target.value) || 0)} />
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
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); setIsEditMode(false); setEditingOrderId(null); resetForm(); }}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditMode 
                ? (language === 'en' ? 'Update Order' : 'Update Order')
                : (language === 'en' ? 'Save as Draft' : 'Simpan Draft')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Approve Sales Order' : 'Setujui Sales Order'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to approve "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin menyetujui "${selectedOrder?.sales_order_number}"?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isApproving} className="bg-success text-success-foreground hover:bg-success/90">
              {isApproving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Cancel Sales Order' : 'Batalkan Sales Order'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to cancel "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin membatalkan "${selectedOrder?.sales_order_number}"?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={isCancelling} className="bg-destructive hover:bg-destructive/90">
              {isCancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Cancel Order' : 'Batalkan Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Sales Order' : 'Hapus Sales Order'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin menghapus "${selectedOrder?.sales_order_number}"?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{language === 'en' ? 'Sales Order Details' : 'Detail Sales Order'}</DialogTitle>
              <div className="flex gap-2">
                {selectedOrder?.po_document_url && (
                  <Button variant="outline" size="sm" onClick={() => selectedOrder && handleViewPoDocument(selectedOrder)} disabled={isOpeningPoDoc}>
                    {isOpeningPoDoc ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                    {language === 'en' ? 'View Document' : 'Lihat Dokumen'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={itemsLoading}>
                  <Printer className="w-4 h-4 mr-2" />
                  {language === 'en' ? 'Print / PDF' : 'Cetak / PDF'}
                </Button>
              </div>
            </div>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'SO Number' : 'No. SO'}</p>
                  <p className="font-medium">{selectedOrder.sales_order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Date' : 'Tanggal'}</p>
                  <p className="font-medium">{formatDate(selectedOrder.order_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedOrder.customer?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Customer PO' : 'PO Customer'}</p>
                  <p className="font-medium">{selectedOrder.customer_po_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sales</p>
                  <p className="font-medium">{selectedOrder.sales_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'en' ? 'Delivery Deadline' : 'Batas Pengiriman'}</p>
                  <p className="font-medium">{formatDate(selectedOrder.delivery_deadline)}</p>
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

              <div>
                <h4 className="font-semibold mb-3">{language === 'en' ? 'Order Items' : 'Item Pesanan'}</h4>
                {itemsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>{language === 'en' ? 'Product' : 'Produk'}</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                        <TableHead>{language === 'en' ? 'Unit' : 'Satuan'}</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">{language === 'en' ? 'Price' : 'Harga'}</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrderItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                            {language === 'en' ? 'No items found' : 'Tidak ada item'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedOrderItems.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-medium">{item.product?.name}</TableCell>
                            <TableCell>{item.product?.sku || '-'}</TableCell>
                            <TableCell>{item.product?.category?.name || '-'}</TableCell>
                            <TableCell>{item.product?.unit?.name || '-'}</TableCell>
                            <TableCell className="text-center">{item.ordered_qty}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.subtotal || (item.unit_price * item.ordered_qty) - (item.discount || 0))}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

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
                    <span className="text-muted-foreground">{language === 'en' ? 'Shipping' : 'Pengiriman'}</span>
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

      {/* Hidden Print Content */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedOrder && (
            <div>
              <div className="header">
                <p className="company-name">PT. KEMIKA KARYA PRATAMA</p>
                <p style={{ fontSize: '11px', color: '#666' }}>Jl. Industri Raya No. 123, Jakarta</p>
                <p className="document-title">SALES ORDER</p>
              </div>

              <div className="info-grid">
                <div className="info-item">
                  <label>No. SO</label>
                  <p>{selectedOrder.sales_order_number}</p>
                </div>
                <div className="info-item">
                  <label>Tanggal</label>
                  <p>{formatDate(selectedOrder.order_date)}</p>
                </div>
                <div className="info-item">
                  <label>Customer</label>
                  <p>{selectedOrder.customer?.name}</p>
                </div>
                <div className="info-item">
                  <label>PO Customer</label>
                  <p>{selectedOrder.customer_po_number}</p>
                </div>
                <div className="info-item">
                  <label>Sales</label>
                  <p>{selectedOrder.sales_name}</p>
                </div>
                <div className="info-item">
                  <label>Batas Pengiriman</label>
                  <p>{formatDate(selectedOrder.delivery_deadline)}</p>
                </div>
                <div className="info-item">
                  <label>Status</label>
                  <span className={`badge badge-${statusConfig[selectedOrder.status]?.variant}`}>
                    {statusConfig[selectedOrder.status]?.labelId}
                  </span>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Nama Barang</th>
                    <th>SKU</th>
                    <th>Kategori</th>
                    <th>Satuan</th>
                    <th className="text-center" style={{ width: '60px' }}>Qty</th>
                    <th className="text-right" style={{ width: '100px' }}>Harga</th>
                    <th className="text-right" style={{ width: '100px' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderItems.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.product?.name}</td>
                      <td>{item.product?.sku || '-'}</td>
                      <td>{item.product?.category?.name || '-'}</td>
                      <td>{item.product?.unit?.name || '-'}</td>
                      <td className="text-center">{item.ordered_qty}</td>
                      <td className="text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right">{formatCurrency(item.subtotal || (item.unit_price * item.ordered_qty) - (item.discount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedOrder.notes && (
                <div style={{ marginBottom: '15px' }}>
                  <p style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Catatan</p>
                  <p style={{ fontSize: '12px' }}>{selectedOrder.notes}</p>
                </div>
              )}

              <div className="summary">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="summary-row">
                    <span>Discount</span>
                    <span>-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="summary-row">
                  <span>Tax ({selectedOrder.tax_rate}%)</span>
                  <span>{formatCurrency((selectedOrder.total_amount - selectedOrder.discount) * selectedOrder.tax_rate / 100)}</span>
                </div>
                {selectedOrder.shipping_cost > 0 && (
                  <div className="summary-row">
                    <span>Pengiriman</span>
                    <span>{formatCurrency(selectedOrder.shipping_cost)}</span>
                  </div>
                )}
                <div className="summary-row total">
                  <span>Grand Total</span>
                  <span>{formatCurrency(selectedOrder.grand_total)}</span>
                </div>
              </div>

              <div className="footer">
                <div>
                  <p style={{ fontSize: '10px', color: '#666' }}>Dibuat oleh</p>
                  <div className="signature">Staff Sales</div>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#666' }}>Disetujui oleh</p>
                  <div className="signature">Manager</div>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#666' }}>Diterima oleh</p>
                  <div className="signature">Customer</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
