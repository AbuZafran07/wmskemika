import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Plus,
  Search,
  Eye,
  Edit,
  MoreHorizontal,
  Printer,
  Trash2,
  Loader2,
  Upload,
  X,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Archive,
  List,
  FileText,
  Download,
  PenLine,
} from "lucide-react";
import html2pdf from "html2pdf.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
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
} from "@/hooks/useSalesOrders";
import { useSettings } from "@/hooks/usePlanOrders";
import { useCustomers, useProducts, Product } from "@/hooks/useMasterData";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const statusConfig: Record<
  string,
  { label: string; labelId: string; variant: "draft" | "approved" | "pending" | "success" | "cancelled" }
> = {
  draft: { label: "Draft", labelId: "Draft", variant: "draft" },
  approved: { label: "Approved", labelId: "Disetujui", variant: "approved" },
  partially_delivered: { label: "Partially Delivered", labelId: "Terkirim Sebagian", variant: "pending" },
  delivered: { label: "Delivered", labelId: "Terkirim", variant: "success" },
  cancelled: { label: "Cancelled", labelId: "Dibatalkan", variant: "cancelled" },
};

const allocationTypes = ["Selling", "Sample", "Stock", "Project"];

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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
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
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const pdfPreviewRef = useRef<HTMLDivElement>(null);

  // Fetch items for detail view
  const { items: selectedOrderItems, loading: itemsLoading } = useSalesOrderItems(selectedOrder?.id || null);

  // Form state
  const [soNumber, setSoNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);
  const [customerId, setCustomerId] = useState("");
  const [customerPoNumber, setCustomerPoNumber] = useState("");
  const [salesName, setSalesName] = useState("");
  const [allocationType, setAllocationType] = useState("");
  const [projectInstansi, setProjectInstansi] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [shipToAddress, setShipToAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [poDocumentUrl, setPoDocumentUrl] = useState("");
  const [poDocumentKey, setPoDocumentKey] = useState("");
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(11);
  const [shippingCost, setShippingCost] = useState(0);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  // Auto-fill fields from customer
  const [customerPic, setCustomerPic] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  // Validation touched state
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Check if user can approve orders
  const canApprove = useMemo(() => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    if (user.role === "admin" && allowAdminApprove) return true;
    return false;
  }, [user, allowAdminApprove]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Filter logic
  const filteredOrders = useMemo(() => {
    return salesOrders.filter((order) => {
      const matchesSearch =
        order.sales_order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_po_number.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const orderDate = new Date(order.order_date);
      const matchesDateFrom = !dateFrom || orderDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || orderDate <= new Date(dateTo);

      const activeStatuses = ["draft", "approved", "partially_delivered"];
      const archivedStatuses = ["delivered", "cancelled"];
      const matchesViewMode =
        viewMode === "active" ? activeStatuses.includes(order.status) : archivedStatuses.includes(order.status);

      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [salesOrders, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = statusFilter !== "all" || dateFrom || dateTo;

  const generateSoNumber = async () => {
    const { data } = await supabase
      .from("sales_order_headers")
      .select("sales_order_number")
      .order("created_at", { ascending: false })
      .limit(1);

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    let sequence = 1;
    if (data && data.length > 0) {
      const lastNumber = data[0].sales_order_number;
      // Matches formats like: SOR-YYYYMM-XXX or SOR/YYYYMMDD/XXX
      const match = lastNumber.match(/SOR[-\/](\d{6,8})[-\/](\d+)/);
      if (match) {
        const lastYearMonth = match[1].slice(0, 6);
        const currentYearMonth = `${year}${month}`;
        if (lastYearMonth === currentYearMonth) {
          sequence = parseInt(match[2], 10) + 1;
        }
      }
    }

    setSoNumber(`SOR-${year}${month}-${String(sequence).padStart(4, "0")}`);
  };

  const resetForm = () => {
    setSoNumber("");
    setOrderDate(new Date().toISOString().split("T")[0]);
    setCustomerId("");
    setCustomerPoNumber("");
    setSalesName("");
    setAllocationType("");
    setProjectInstansi("");
    setDeliveryDeadline("");
    setShipToAddress("");
    setNotes("");
    setPoDocumentUrl("");
    setPoDocumentKey("");
    setDiscount(0);
    setTaxRate(11);
    setShippingCost(0);
    setOrderItems([]);
    setSelectedProductId("");
    setCustomerPic("");
    setCustomerPhone("");
    setPaymentTerms("");
    setTouched({});
  };

  // Auto-fill customer data when customer is selected
  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    setTouched((prev) => ({ ...prev, customerId: true }));

    const customer = customers.find((c) => c.id === newCustomerId);
    if (customer) {
      setCustomerPic(customer.pic || "");
      setCustomerPhone(customer.phone || "");
      setPaymentTerms(customer.terms_payment || "");
      // Auto-fill shipping address from customer address (editable)
      if (!shipToAddress) {
        setShipToAddress(customer.address || "");
      }
    }
  };

  // Validation helpers
  const getFieldError = (field: string, value: string | number) => {
    if (!touched[field]) return null;
    if (!value || (typeof value === "string" && !value.trim())) {
      return language === "en" ? "This field is required" : "Field ini wajib diisi";
    }
    return null;
  };

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleOpenDialog = async () => {
    resetForm();
    setOrderDate(new Date().toISOString().split("T")[0]);
    setIsEditMode(false);
    setEditingOrderId(null);
    await generateSoNumber();
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
    setShipToAddress(order.ship_to_address || "");
    setNotes(order.notes || "");
    setPoDocumentUrl(order.po_document_url || "");
    setPoDocumentKey("");
    setDiscount(order.discount || 0);
    setTaxRate(order.tax_rate || 11);
    setShippingCost(order.shipping_cost || 0);
    setEditingOrderId(order.id);
    setIsEditMode(true);

    // Fetch items
    const { data } = await supabase
      .from("sales_order_items")
      .select(`*, product:products(id, name, sku, selling_price, category:categories(name), unit:units(name))`)
      .eq("sales_order_id", order.id);

    if (data) {
      const items: OrderItem[] = [];
      for (const item of data) {
        const stock = await getProductStock(item.product_id);
        items.push({
          product_id: item.product_id,
          product_name: item.product?.name || "",
          sku: item.product?.sku || "-",
          unit: item.product?.unit?.name || "-",
          category: item.product?.category?.name || "-",
          unit_price: item.unit_price,
          ordered_qty: item.ordered_qty,
          discount: item.discount || 0,
          subtotal: item.ordered_qty * item.unit_price - (item.discount || 0),
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
    const result = await uploadFile(file, "documents", "sales-orders");

    if (result) {
      setPoDocumentUrl(result.url);
      setPoDocumentKey(result.path);
      toast.success(language === "en" ? "Document uploaded successfully" : "Dokumen berhasil diupload");
    } else {
      toast.error(language === "en" ? "Failed to upload document" : "Gagal upload dokumen");
    }
    setIsUploading(false);
  };

  const handleAddProduct = async () => {
    if (!selectedProductId) return;

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    if (orderItems.some((item) => item.product_id === selectedProductId)) {
      toast.error(language === "en" ? "Product already added" : "Produk sudah ditambahkan");
      return;
    }

    const stockAvailable = await getProductStock(selectedProductId);

    const newItem: OrderItem = {
      product_id: product.id,
      product_name: product.name,
      sku: product.sku || "-",
      unit: product.unit?.name || "-",
      category: product.category?.name || "-",
      unit_price: product.selling_price || product.purchase_price,
      ordered_qty: 1,
      discount: 0,
      subtotal: product.selling_price || product.purchase_price,
      stock_available: stockAvailable,
    };

    setOrderItems((prev) => [...prev, newItem]);
    setSelectedProductId("");
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        const qty = field === "ordered_qty" ? value : item.ordered_qty;
        const price = field === "unit_price" ? value : item.unit_price;
        const disc = field === "discount" ? value : item.discount;
        updated.subtotal = qty * price - disc;
        return updated;
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
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
      toast.error(language === "en" ? "Please fill all required fields" : "Harap isi semua field wajib");
      return;
    }

    if (orderItems.length === 0) {
      toast.error(language === "en" ? "Please add at least one product" : "Tambahkan minimal satu produk");
      return;
    }

    // Warn about low stock
    for (const item of orderItems) {
      if (item.ordered_qty > item.stock_available) {
        toast.warning(
          language === "en"
            ? `Warning: ${item.product_name} has insufficient stock (Available: ${item.stock_available})`
            : `Peringatan: ${item.product_name} stok tidak cukup (Tersedia: ${item.stock_available})`,
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
        orderItems.map((item) => ({
          product_id: item.product_id,
          unit_price: item.unit_price,
          ordered_qty: item.ordered_qty,
          discount: item.discount,
        })),
      );

      if (result.success) {
        toast.success(language === "en" ? "Sales Order updated successfully" : "Sales Order berhasil diupdate");
        setIsDialogOpen(false);
        setIsEditMode(false);
        setEditingOrderId(null);
        resetForm();
        refetch();
      } else {
        toast.error(result.error || "Failed to update");
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
          status: "draft",
          total_amount: subtotal,
          discount: discount,
          tax_rate: taxRate,
          shipping_cost: shippingCost,
          grand_total: grandTotal,
          created_by: null,
          approved_by: null,
          approved_at: null,
        },
        orderItems.map((item) => ({
          product_id: item.product_id,
          unit_price: item.unit_price,
          ordered_qty: item.ordered_qty,
          discount: item.discount,
        })),
      );

      if (result.success) {
        toast.success(language === "en" ? "Sales Order created successfully" : "Sales Order berhasil dibuat");
        setIsDialogOpen(false);
        resetForm();
        refetch();
      } else {
        toast.error(result.error || "Failed to create Sales Order");
      }
    }

    setIsSaving(false);
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;

    if (!canApprove) {
      toast.error(
        language === "en"
          ? "You do not have permission to approve orders"
          : "Anda tidak memiliki izin untuk menyetujui order",
      );
      return;
    }

    setIsApproving(true);
    const result = await approveSalesOrder(selectedOrder.id);

    if (result.success) {
      toast.success(language === "en" ? "Sales Order approved" : "Sales Order disetujui");
      refetch();
    } else {
      toast.error(result.error || "Failed to approve");
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
      toast.success(language === "en" ? "Sales Order cancelled" : "Sales Order dibatalkan");
      refetch();
    } else {
      toast.error(result.error || "Failed to cancel");
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
      toast.success(language === "en" ? "Sales Order deleted" : "Sales Order dihapus");
      refetch();
    } else {
      toast.error(result.error || "Failed to delete");
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
      toast.error(language === "en" ? "No document attached" : "Tidak ada dokumen terlampir");
      return;
    }

    setIsOpeningPoDoc(true);
    try {
      const url = order.po_document_url;
      let path = url;

      // Try multiple patterns to extract the file path
      // Pattern 1: /storage/v1/object/sign/documents/path or /storage/v1/object/public/documents/path
      if (url.includes("/storage/v1/object/")) {
        const pathMatch = url.match(/\/storage\/v1\/object\/(?:sign|public)\/documents\/(.+?)(?:\?|$)/);
        if (pathMatch) {
          path = decodeURIComponent(pathMatch[1]);
        }
      }
      // Pattern 2: Direct path without URL prefix (e.g., sales-orders/timestamp-filename.pdf)
      else if (!url.startsWith("http")) {
        path = url;
      }
      // Pattern 3: Full supabase URL pattern
      else if (url.includes(".supabase.co/storage/")) {
        const pathMatch = url.match(/\/storage\/v1\/object\/(?:sign|public)\/documents\/(.+?)(?:\?|$)/);
        if (pathMatch) {
          path = decodeURIComponent(pathMatch[1]);
        }
      }

      // Get a fresh signed URL
      const signedUrl = await getSignedUrl(path, "documents", 3600);

      if (signedUrl) {
        window.open(signedUrl, "_blank");
      } else {
        // If signing fails but we have a URL, try opening it directly
        if (url.startsWith("http")) {
          window.open(url, "_blank");
        } else {
          toast.error(language === "en" ? "Failed to open document" : "Gagal membuka dokumen");
        }
      }
    } catch (error) {
      console.error("Error opening document:", error);
      toast.error(language === "en" ? "Failed to open document" : "Gagal membuka dokumen");
    }
    setIsOpeningPoDoc(false);
  };

  // Get display filename from URL
  const getDocumentFilename = (url: string | null): string => {
    if (!url) return "";
    try {
      const decoded = decodeURIComponent(url);
      const parts = decoded.split("/");
      const filename = parts[parts.length - 1].split("?")[0];
      // Remove UUID prefix if present (format: uuid_filename.ext)
      const underscoreIdx = filename.indexOf("_");
      if (underscoreIdx > 30) {
        // UUID is 36 chars, so check if underscore is after a long prefix
        return filename.substring(underscoreIdx + 1);
      }
      return filename;
    } catch {
      return "Document";
    }
  };

  const handlePreviewPDF = () => {
    if (!selectedOrder) return;
    setIsPdfPreviewOpen(true);
  };

  const handleDownloadPDF = async () => {
    if (!selectedOrder || !printRef.current) return;

    setIsDownloadingPdf(true);
    try {
      const element = printRef.current;
      const opt = {
        margin: [15, 15, 15, 15] as [number, number, number, number],
        filename: `SalesOrder_${selectedOrder.sales_order_number}.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
      };

      await html2pdf().set(opt).from(element).save();
      toast.success(language === "en" ? "PDF downloaded successfully" : "PDF berhasil diunduh");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error(language === "en" ? "Failed to download PDF" : "Gagal mengunduh PDF");
    }
    setIsDownloadingPdf(false);
  };

  const handleExportPDF = () => {
    if (!selectedOrder || !printRef.current) return;

    const printContent = printRef.current;
    const printWindow = window.open("", "_blank");

    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sales Order - ${selectedOrder.sales_order_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 30px; color: #333; font-size: 11px; }
            .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a365d; padding-bottom: 15px; margin-bottom: 20px; }
            .company-logo { font-size: 24px; font-weight: bold; color: #1a365d; }
            .document-title { font-size: 18px; font-weight: bold; text-align: right; }
            .info-section { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px; }
            .info-box { }
            .info-box label { font-size: 9px; color: #666; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 3px; }
            .info-box p { font-weight: 500; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10px; }
            th { background: #1a365d; color: white; font-weight: 600; text-transform: uppercase; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .summary-section { display: flex; justify-content: flex-end; margin-top: 20px; }
            .summary-box { width: 280px; }
            .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 11px; }
            .summary-row.total { font-weight: bold; font-size: 13px; border-top: 2px solid #333; margin-top: 5px; padding-top: 8px; }
            .address-section { margin: 20px 0; padding: 10px; background: #f8f9fa; border-radius: 4px; }
            .address-section label { font-size: 9px; color: #666; text-transform: uppercase; font-weight: bold; }
            .notes-section { margin: 15px 0; padding: 10px; border: 1px dashed #ccc; border-radius: 4px; }
            .notes-section label { font-size: 9px; color: #666; text-transform: uppercase; font-weight: bold; }
            .signature-section { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 60px; text-align: center; }
            .signature-box { }
            .signature-box .date-line { font-size: 10px; color: #666; margin-bottom: 50px; }
            .signature-box .role { font-size: 10px; margin-bottom: 60px; }
            .signature-box .line { border-bottom: 1px solid #333; margin: 0 10px; padding-top: 5px; font-size: 10px; }
            .signature-box .approved-info { color: #059669; font-weight: bold; }
            .digital-signature { margin-top: 30px; padding: 15px; border: 2px solid #059669; border-radius: 8px; background: #f0fdf4; }
            .digital-signature h4 { color: #059669; margin-bottom: 10px; font-size: 12px; }
            .digital-signature p { font-size: 10px; margin: 3px 0; }
            @media print { 
              body { padding: 20px; } 
              @page { margin: 15mm; }
            }
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
          <h1 className="text-2xl font-bold font-display">{t("menu.salesOrder")}</h1>
          <p className="text-muted-foreground">
            {t("menu.salesOrderSub")} - {language === "en" ? "Manage customer orders" : "Kelola pesanan customer"}
          </p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="w-4 h-4 mr-2" />
          {language === "en" ? "Create Sales Order" : "Buat Sales Order"}
        </Button>
      </div>

      {/* Tabs: Active / Archived */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "active" | "archived")}>
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <List className="w-4 h-4" />
            {language === "en" ? "Active" : "Aktif"}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="w-4 h-4" />
            {language === "en" ? "Archived" : "Arsip"}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={
                  language === "en"
                    ? "Search by SO number, customer, or PO..."
                    : "Cari berdasarkan No. SO, customer, atau PO..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={language === "en" ? "All Status" : "Semua Status"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "en" ? "All Status" : "Semua Status"}</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="approved">{language === "en" ? "Approved" : "Disetujui"}</SelectItem>
                <SelectItem value="partially_delivered">
                  {language === "en" ? "Partially Delivered" : "Terkirim Sebagian"}
                </SelectItem>
                <SelectItem value="delivered">{language === "en" ? "Delivered" : "Terkirim"}</SelectItem>
                <SelectItem value="cancelled">{language === "en" ? "Cancelled" : "Dibatalkan"}</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  {language === "en" ? "Date Range" : "Rentang Tanggal"}
                  {hasActiveFilters && (
                    <Badge variant="draft" className="text-xs px-1">
                      {language === "en" ? "Active" : "Aktif"}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{language === "en" ? "From Date" : "Dari Tanggal"}</Label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "To Date" : "Sampai Tanggal"}</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" onClick={clearFilters} className="w-full">
                    {language === "en" ? "Clear Filters" : "Hapus Filter"}
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
                  <TableHead>{language === "en" ? "SO Number" : "No. SO"}</TableHead>
                  <TableHead>{language === "en" ? "Date" : "Tanggal"}</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>{language === "en" ? "Customer PO" : "PO Customer"}</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>{language === "en" ? "Allocation" : "Alokasi"}</TableHead>
                  <TableHead className="text-right">{language === "en" ? "Amount" : "Jumlah"}</TableHead>
                  <TableHead className="text-center">{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {language === "en" ? "No sales orders found" : "Tidak ada sales order ditemukan"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const status = statusConfig[order.status] || statusConfig.draft;
                    const showApprove = order.status === "draft" && canApprove;
                    const showCancel = order.status === "draft" || order.status === "approved";
                    const showEdit = order.status === "draft";
                    const showDelete = order.status === "draft";

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
                          <Badge variant={status.variant}>{language === "en" ? status.label : status.labelId}</Badge>
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
                                {language === "en" ? "View Details" : "Lihat Detail"}
                              </DropdownMenuItem>
                              {order.po_document_url && (
                                <DropdownMenuItem onClick={() => handleViewPoDocument(order)} disabled={isOpeningPoDoc}>
                                  <FileText className="w-4 h-4 mr-2" />
                                  {language === "en" ? "View Document" : "Lihat Dokumen"}
                                </DropdownMenuItem>
                              )}
                              {showEdit && (
                                <DropdownMenuItem onClick={() => handleEdit(order)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  {t("common.edit")}
                                </DropdownMenuItem>
                              )}
                              {showApprove && (
                                <DropdownMenuItem
                                  className="text-success"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsApproveDialogOpen(true);
                                  }}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                              )}
                              {showCancel && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsCancelDialogOpen(true);
                                  }}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Cancel
                                </DropdownMenuItem>
                              )}
                              {showDelete && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedOrder(order);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t("common.delete")}
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
                ? language === "en"
                  ? "Edit Sales Order"
                  : "Edit Sales Order"
                : language === "en"
                  ? "Create Sales Order"
                  : "Buat Sales Order"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Header Info */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{language === "en" ? "SO Number" : "No. SO"} *</Label>
                <Input value={soNumber} disabled={!isEditMode} className={!isEditMode ? "bg-muted font-mono" : ""} />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Order Date" : "Tanggal Order"} *</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Customer *
                  {getFieldError("customerId", customerId) && (
                    <span className="text-destructive text-xs">({getFieldError("customerId", customerId)})</span>
                  )}
                </Label>
                <Select value={customerId} onValueChange={handleCustomerChange}>
                  <SelectTrigger className={getFieldError("customerId", customerId) ? "border-destructive" : ""}>
                    <SelectValue placeholder={language === "en" ? "Select customer" : "Pilih customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  {language === "en" ? "Customer PO Number" : "No. PO Customer"} *
                  {getFieldError("customerPoNumber", customerPoNumber) && (
                    <span className="text-destructive text-xs">
                      ({getFieldError("customerPoNumber", customerPoNumber)})
                    </span>
                  )}
                </Label>
                <Input
                  placeholder="e.g., CUST-PO-001"
                  value={customerPoNumber}
                  onChange={(e) => setCustomerPoNumber(e.target.value)}
                  onBlur={() => markTouched("customerPoNumber")}
                  className={getFieldError("customerPoNumber", customerPoNumber) ? "border-destructive" : ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  {language === "en" ? "Sales Name" : "Nama Sales"} *
                  {getFieldError("salesName", salesName) && (
                    <span className="text-destructive text-xs">({getFieldError("salesName", salesName)})</span>
                  )}
                </Label>
                <Input
                  placeholder={language === "en" ? "Enter sales name" : "Nama sales"}
                  value={salesName}
                  onChange={(e) => setSalesName(e.target.value)}
                  onBlur={() => markTouched("salesName")}
                  className={getFieldError("salesName", salesName) ? "border-destructive" : ""}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  {language === "en" ? "Allocation Type" : "Tipe Alokasi"} *
                  {getFieldError("allocationType", allocationType) && (
                    <span className="text-destructive text-xs">
                      ({getFieldError("allocationType", allocationType)})
                    </span>
                  )}
                </Label>
                <Select
                  value={allocationType}
                  onValueChange={(v) => {
                    setAllocationType(v);
                    markTouched("allocationType");
                  }}
                >
                  <SelectTrigger
                    className={getFieldError("allocationType", allocationType) ? "border-destructive" : ""}
                  >
                    <SelectValue placeholder={language === "en" ? "Select type" : "Pilih tipe"} />
                  </SelectTrigger>
                  <SelectContent>
                    {allocationTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  {language === "en" ? "Project/Instansi" : "Proyek/Instansi"} *
                  {getFieldError("projectInstansi", projectInstansi) && (
                    <span className="text-destructive text-xs">
                      ({getFieldError("projectInstansi", projectInstansi)})
                    </span>
                  )}
                </Label>
                <Input
                  placeholder={language === "en" ? "Enter project name" : "Nama proyek"}
                  value={projectInstansi}
                  onChange={(e) => setProjectInstansi(e.target.value)}
                  onBlur={() => markTouched("projectInstansi")}
                  className={getFieldError("projectInstansi", projectInstansi) ? "border-destructive" : ""}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  {language === "en" ? "Delivery Deadline" : "Batas Pengiriman"} *
                  {getFieldError("deliveryDeadline", deliveryDeadline) && (
                    <span className="text-destructive text-xs">
                      ({getFieldError("deliveryDeadline", deliveryDeadline)})
                    </span>
                  )}
                </Label>
                <Input
                  type="date"
                  value={deliveryDeadline}
                  onChange={(e) => setDeliveryDeadline(e.target.value)}
                  onBlur={() => markTouched("deliveryDeadline")}
                  className={getFieldError("deliveryDeadline", deliveryDeadline) ? "border-destructive" : ""}
                />
              </div>
            </div>

            {/* Auto-filled customer info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>PIC</Label>
                <Input
                  value={customerPic}
                  onChange={(e) => setCustomerPic(e.target.value)}
                  placeholder={language === "en" ? "Auto-filled from customer" : "Otomatis dari customer"}
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Phone" : "Telepon"}</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={language === "en" ? "Auto-filled from customer" : "Otomatis dari customer"}
                  className="bg-muted/50"
                />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Payment Terms" : "Termin Pembayaran"}</Label>
                <Input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder={language === "en" ? "Auto-filled from customer" : "Otomatis dari customer"}
                  className="bg-muted/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === "en" ? "Ship To Address" : "Alamat Pengiriman"}</Label>
                <Textarea
                  placeholder={language === "en" ? "Enter shipping address" : "Alamat pengiriman"}
                  value={shipToAddress}
                  onChange={(e) => setShipToAddress(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Notes" : "Catatan"}</Label>
                <Textarea
                  placeholder={language === "en" ? "Enter notes" : "Catatan"}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{language === "en" ? "PO Document" : "Dokumen PO"}</Label>
              <div className="flex gap-2">
                {poDocumentUrl ? (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded flex-1 overflow-hidden">
                    <span className="text-sm text-primary truncate max-w-[300px]">
                      {(() => {
                        // Extract filename from URL (before query params)
                        const urlPath = poDocumentUrl.split("?")[0];
                        const segments = urlPath.split("/");
                        const filename = segments[segments.length - 1];
                        // Remove UUID prefix if present (format: uuid-filename.ext)
                        const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-/i;
                        return decodeURIComponent(filename.replace(uuidPattern, ""));
                      })()}
                    </span>
                  </div>
                ) : (
                  <Input
                    value=""
                    disabled
                    placeholder={language === "en" ? "Upload PO document" : "Upload dokumen PO"}
                    className="bg-muted flex-1"
                  />
                )}
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
                {poDocumentUrl && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setPoDocumentUrl("");
                      setPoDocumentKey("");
                    }}
                  >
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
                <CardTitle className="text-base">{language === "en" ? "Order Items" : "Item Pesanan"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue
                        placeholder={language === "en" ? "Select product to add" : "Pilih produk untuk ditambahkan"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((p) => p.is_active)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.sku || "-"})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddProduct} disabled={!selectedProductId}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("common.add")}
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === "en" ? "Product" : "Produk"}</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>{language === "en" ? "Unit" : "Satuan"}</TableHead>
                      <TableHead className="text-center">{language === "en" ? "Stock" : "Stok"}</TableHead>
                      <TableHead className="text-right">{language === "en" ? "Unit Price" : "Harga"}</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          {language === "en" ? "No products added" : "Belum ada produk ditambahkan"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((item, index) => (
                        <TableRow key={item.product_id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.sku}</TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={item.stock_available >= item.ordered_qty ? "success" : "pending"}>
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
                              onChange={(e) => handleItemChange(index, "unit_price", parseFloat(e.target.value) || 0)}
                              className="w-28 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.ordered_qty}
                              onChange={(e) => handleItemChange(index, "ordered_qty", parseInt(e.target.value) || 1)}
                              className="w-20 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={item.discount}
                              onChange={(e) => handleItemChange(index, "discount", parseFloat(e.target.value) || 0)}
                              className="w-24 text-right"
                            />
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
                    <Label>{language === "en" ? "Discount" : "Diskon"}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "Tax Rate (%)" : "Tarif Pajak (%)"}</Label>
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
                  <Label>{language === "en" ? "Shipping Cost" : "Biaya Pengiriman"}</Label>
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
                    <span className="text-muted-foreground">{language === "en" ? "Discount" : "Diskon"}</span>
                    <span className="font-medium text-destructive">-{formatCurrency(discount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {language === "en" ? "Tax" : "Pajak"} ({taxRate}%)
                    </span>
                    <span className="font-medium">{formatCurrency(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{language === "en" ? "Shipping" : "Pengiriman"}</span>
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
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setIsEditMode(false);
                setEditingOrderId(null);
                resetForm();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditMode
                ? language === "en"
                  ? "Update Order"
                  : "Update Order"
                : language === "en"
                  ? "Save as Draft"
                  : "Simpan Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "en" ? "Approve Sales Order" : "Setujui Sales Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to approve "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin menyetujui "${selectedOrder?.sales_order_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={isApproving}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
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
            <AlertDialogTitle>{language === "en" ? "Cancel Sales Order" : "Batalkan Sales Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to cancel "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin membatalkan "${selectedOrder?.sales_order_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isCancelling}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isCancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === "en" ? "Cancel Order" : "Batalkan Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "en" ? "Delete Sales Order" : "Hapus Sales Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to delete "${selectedOrder?.sales_order_number}"?`
                : `Apakah Anda yakin ingin menghapus "${selectedOrder?.sales_order_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{language === "en" ? "Sales Order Details" : "Detail Sales Order"}</DialogTitle>
              <div className="flex gap-2">
                {selectedOrder?.po_document_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedOrder && handleViewPoDocument(selectedOrder)}
                    disabled={isOpeningPoDoc}
                  >
                    {isOpeningPoDoc ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 mr-2" />
                    )}
                    {language === "en" ? "View Document" : "Lihat Dokumen"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handlePreviewPDF} disabled={itemsLoading}>
                  <Eye className="w-4 h-4 mr-2" />
                  {language === "en" ? "Preview" : "Preview"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  disabled={itemsLoading || isDownloadingPdf}
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {language === "en" ? "Download" : "Unduh"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={itemsLoading}>
                  <Printer className="w-4 h-4 mr-2" />
                  {language === "en" ? "Print" : "Cetak"}
                </Button>
              </div>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "SO Number" : "No. SO"}</p>
                  <p className="font-medium">{selectedOrder.sales_order_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Date" : "Tanggal"}</p>
                  <p className="font-medium">{formatDate(selectedOrder.order_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedOrder.customer?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Customer PO" : "PO Customer"}</p>
                  <p className="font-medium">{selectedOrder.customer_po_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sales</p>
                  <p className="font-medium">{selectedOrder.sales_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === "en" ? "Delivery Deadline" : "Batas Pengiriman"}
                  </p>
                  <p className="font-medium">{formatDate(selectedOrder.delivery_deadline)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                  <Badge variant={statusConfig[selectedOrder.status]?.variant || "draft"}>
                    {language === "en"
                      ? statusConfig[selectedOrder.status]?.label
                      : statusConfig[selectedOrder.status]?.labelId}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Grand Total</p>
                  <p className="font-medium text-primary">{formatCurrency(selectedOrder.grand_total)}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">{language === "en" ? "Order Items" : "Item Pesanan"}</h4>
                {itemsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>{language === "en" ? "Product" : "Produk"}</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>{language === "en" ? "Category" : "Kategori"}</TableHead>
                        <TableHead>{language === "en" ? "Unit" : "Satuan"}</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">{language === "en" ? "Price" : "Harga"}</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrderItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                            {language === "en" ? "No items found" : "Tidak ada item"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedOrderItems.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-medium">{item.product?.name}</TableCell>
                            <TableCell>{item.product?.sku || "-"}</TableCell>
                            <TableCell>{item.product?.category?.name || "-"}</TableCell>
                            <TableCell>{item.product?.unit?.name || "-"}</TableCell>
                            <TableCell className="text-center">{item.ordered_qty}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(
                                item.subtotal || item.unit_price * item.ordered_qty - (item.discount || 0),
                              )}
                            </TableCell>
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
                  <span>
                    {formatCurrency(
                      ((selectedOrder.total_amount - selectedOrder.discount) * selectedOrder.tax_rate) / 100,
                    )}
                  </span>
                </div>
                {selectedOrder.shipping_cost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === "en" ? "Shipping" : "Pengiriman"}</span>
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
              {language === "en" ? "Close" : "Tutup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Content - Kemika Format */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedOrder && (
            <div>
              {/* Header */}
              <div className="pdf-header">
                <div>
                  <div className="company-logo">Kemika</div>
                </div>
                <div className="document-title">SALES ORDER</div>
              </div>

              {/* Info Section - Row 1 */}
              <div className="info-section">
                <div className="info-box">
                  <label>Sales Order No.</label>
                  <p>{selectedOrder.sales_order_number}</p>
                </div>
                <div className="info-box">
                  <label>Tipe Alokasi</label>
                  <p>{selectedOrder.allocation_type.toUpperCase()}</p>
                </div>
                <div className="info-box">
                  <label>SO Date</label>
                  <p>{formatDate(selectedOrder.order_date)}</p>
                </div>
                <div className="info-box">
                  <label>Tanggal</label>
                  <p>{formatDate(selectedOrder.order_date)}</p>
                </div>
              </div>

              {/* Info Section - Row 2 */}
              <div className="info-section">
                <div className="info-box">
                  <label>Sales</label>
                  <p>{selectedOrder.sales_name}</p>
                </div>
                <div className="info-box">
                  <label>Customer</label>
                  <p>{selectedOrder.customer?.name}</p>
                </div>
                <div className="info-box">
                  <label>PO Customer</label>
                  <p>{selectedOrder.customer_po_number}</p>
                </div>
                <div className="info-box">
                  <label>Batas Pengiriman</label>
                  <p>{formatDate(selectedOrder.delivery_deadline)}</p>
                </div>
              </div>

              {/* Info Section - Row 3 */}
              <div className="info-section">
                <div className="info-box">
                  <label>PIC</label>
                  <p>{selectedOrder.customer?.pic || "-"}</p>
                </div>
                <div className="info-box">
                  <label>Phone</label>
                  <p>{selectedOrder.customer?.phone || "-"}</p>
                </div>
                <div className="info-box">
                  <label>Payment Terms</label>
                  <p>{selectedOrder.customer?.terms_payment || "-"}</p>
                </div>
                <div className="info-box">
                  <label>Proyek/Instansi</label>
                  <p>{selectedOrder.project_instansi}</p>
                </div>
              </div>

              {/* Items Table */}
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "30px" }}>#</th>
                    <th>Nama Barang</th>
                    <th style={{ width: "80px" }}>SKU</th>
                    <th style={{ width: "100px" }}>Kategori</th>
                    <th style={{ width: "60px" }}>Satuan</th>
                    <th className="text-center" style={{ width: "50px" }}>
                      Qty
                    </th>
                    <th className="text-right" style={{ width: "100px" }}>
                      Harga
                    </th>
                    <th className="text-right" style={{ width: "100px" }}>
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderItems.map((item, index) => (
                    <tr key={item.id}>
                      <td className="text-center">{index + 1}</td>
                      <td>{item.product?.name}</td>
                      <td>{item.product?.sku || "-"}</td>
                      <td>{item.product?.category?.name || "-"}</td>
                      <td>{item.product?.unit?.name || "-"}</td>
                      <td className="text-center">{item.ordered_qty}</td>
                      <td className="text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right">
                        {formatCurrency(item.subtotal || item.unit_price * item.ordered_qty - (item.discount || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div className="summary-section">
                <div className="summary-box">
                  <div className="summary-row">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedOrder.total_amount)}</span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="summary-row">
                      <span>Discount:</span>
                      <span>-{formatCurrency(selectedOrder.discount)}</span>
                    </div>
                  )}
                  <div className="summary-row">
                    <span>Tax ({selectedOrder.tax_rate}%):</span>
                    <span>
                      {formatCurrency(
                        ((selectedOrder.total_amount - selectedOrder.discount) * selectedOrder.tax_rate) / 100,
                      )}
                    </span>
                  </div>
                  {selectedOrder.shipping_cost > 0 && (
                    <div className="summary-row">
                      <span>Pengiriman:</span>
                      <span>{formatCurrency(selectedOrder.shipping_cost)}</span>
                    </div>
                  )}
                  <div className="summary-row total">
                    <span>Grand Total:</span>
                    <span>{formatCurrency(selectedOrder.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* Ship To Address */}
              {selectedOrder.ship_to_address && (
                <div className="address-section">
                  <label>SHIP TO ADDRESS/ALAMAT PENGIRIMAN:</label>
                  <p style={{ marginTop: "5px" }}>{selectedOrder.ship_to_address}</p>
                </div>
              )}

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="notes-section">
                  <label>CATATAN:</label>
                  <p style={{ marginTop: "5px" }}>{selectedOrder.notes}</p>
                </div>
              )}

              {/* Digital Signature for Approved Orders */}
              {selectedOrder.status !== "draft" && selectedOrder.approved_at && (
                <div className="digital-signature">
                  <h4>✓ DIGITAL SIGNATURE / TANDA TANGAN DIGITAL</h4>
                  <p>
                    <strong>{language === "en" ? "Approved By" : "Disetujui Oleh"}:</strong>{" "}
                    {selectedOrder.approved_by || "System"}
                  </p>
                  <p>
                    <strong>{language === "en" ? "Approval Date" : "Tanggal Persetujuan"}:</strong>{" "}
                    {formatDate(selectedOrder.approved_at)}
                  </p>
                  <p>
                    <strong>Status:</strong> {selectedOrder.status.toUpperCase()}
                  </p>
                  <p style={{ fontSize: "8px", marginTop: "8px", color: "#666" }}>
                    {language === "en"
                      ? "This document has been digitally approved and is valid without physical signature."
                      : "Dokumen ini telah disetujui secara digital dan sah tanpa tanda tangan fisik."}
                  </p>
                </div>
              )}

              {/* Signature Section */}
              <div className="signature-section">
                <div className="signature-box">
                  <div className="date-line">Date:</div>
                  <div className="role">Pemohon,</div>
                  <div className="line">(……………..…........………)</div>
                </div>
                <div className="signature-box">
                  <div className="date-line">Date:</div>
                  <div className="role">Finance,</div>
                  <div className="line">(……………..…........………)</div>
                </div>
                <div className="signature-box">
                  <div className="date-line">Date:</div>
                  <div className="role">Purchasing,</div>
                  <div className="line">(……………..…........………)</div>
                </div>
                <div className="signature-box">
                  <div className="date-line">
                    Date:{selectedOrder.approved_at ? ` ${formatDate(selectedOrder.approved_at)}` : ""}
                  </div>
                  <div className="role">Menyetujui,</div>
                  {selectedOrder.approved_by ? (
                    <div className="line approved-info">({selectedOrder.approved_by})</div>
                  ) : (
                    <div className="line">(……………..…........………)</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PDF Preview Dialog */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={setIsPdfPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "PDF Preview" : "Preview PDF"}</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div
              className="bg-white text-black p-8 rounded-lg border"
              style={{ fontFamily: "Arial, sans-serif", fontSize: "11px" }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  borderBottom: "2px solid #1a365d",
                  paddingBottom: "15px",
                  marginBottom: "20px",
                }}
              >
                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#1a365d" }}>Kemika</div>
                <div style={{ fontSize: "18px", fontWeight: "bold" }}>SALES ORDER</div>
              </div>

              {/* Info Section - Row 1 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "15px",
                  marginBottom: "15px",
                  padding: "10px",
                  background: "#f8f9fa",
                  borderRadius: "4px",
                }}
              >
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    Sales Order No.
                  </div>
                  <div style={{ fontWeight: "500" }}>{selectedOrder.sales_order_number}</div>
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    Tipe Alokasi
                  </div>
                  <div style={{ fontWeight: "500" }}>{selectedOrder.allocation_type.toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    SO Date
                  </div>
                  <div style={{ fontWeight: "500" }}>{formatDate(selectedOrder.order_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    Batas Pengiriman
                  </div>
                  <div style={{ fontWeight: "500" }}>{formatDate(selectedOrder.delivery_deadline)}</div>
                </div>
              </div>

              {/* Info Section - Row 2 */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "15px",
                  marginBottom: "15px",
                  padding: "10px",
                  background: "#f8f9fa",
                  borderRadius: "4px",
                }}
              >
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    Sales
                  </div>
                  <div style={{ fontWeight: "500" }}>{selectedOrder.sales_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    Customer
                  </div>
                  <div style={{ fontWeight: "500" }}>{selectedOrder.customer?.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    PO Customer
                  </div>
                  <div style={{ fontWeight: "500" }}>{selectedOrder.customer_po_number}</div>
                </div>
                <div>
                  <div style={{ fontSize: "9px", color: "#666", textTransform: "uppercase", fontWeight: "bold" }}>
                    Proyek/Instansi
                  </div>
                  <div style={{ fontWeight: "500" }}>{selectedOrder.project_instansi}</div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "15px 0" }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        background: "#1a365d",
                        color: "white",
                        fontSize: "10px",
                        width: "30px",
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        background: "#1a365d",
                        color: "white",
                        fontSize: "10px",
                        textAlign: "left",
                      }}
                    >
                      Nama Barang
                    </th>
                    <th
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        background: "#1a365d",
                        color: "white",
                        fontSize: "10px",
                        width: "80px",
                      }}
                    >
                      SKU
                    </th>
                    <th
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        background: "#1a365d",
                        color: "white",
                        fontSize: "10px",
                        width: "60px",
                        textAlign: "center",
                      }}
                    >
                      Qty
                    </th>
                    <th
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        background: "#1a365d",
                        color: "white",
                        fontSize: "10px",
                        width: "100px",
                        textAlign: "right",
                      }}
                    >
                      Harga
                    </th>
                    <th
                      style={{
                        border: "1px solid #ddd",
                        padding: "8px",
                        background: "#1a365d",
                        color: "white",
                        fontSize: "10px",
                        width: "100px",
                        textAlign: "right",
                      }}
                    >
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderItems.map((item, index) => (
                    <tr key={item.id}>
                      <td style={{ border: "1px solid #ddd", padding: "8px", textAlign: "center", fontSize: "10px" }}>
                        {index + 1}
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "8px", fontSize: "10px" }}>
                        {item.product?.name}
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "8px", fontSize: "10px" }}>
                        {item.product?.sku || "-"}
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "8px", textAlign: "center", fontSize: "10px" }}>
                        {item.ordered_qty}
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "8px", textAlign: "right", fontSize: "10px" }}>
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td style={{ border: "1px solid #ddd", padding: "8px", textAlign: "right", fontSize: "10px" }}>
                        {formatCurrency(item.subtotal || item.unit_price * item.ordered_qty - (item.discount || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                <div style={{ width: "280px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "11px" }}>
                    <span>Subtotal:</span>
                    <span>{formatCurrency(selectedOrder.total_amount)}</span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div
                      style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "11px" }}
                    >
                      <span>Discount:</span>
                      <span>-{formatCurrency(selectedOrder.discount)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "11px" }}>
                    <span>Tax ({selectedOrder.tax_rate}%):</span>
                    <span>
                      {formatCurrency(
                        ((selectedOrder.total_amount - selectedOrder.discount) * selectedOrder.tax_rate) / 100,
                      )}
                    </span>
                  </div>
                  {selectedOrder.shipping_cost > 0 && (
                    <div
                      style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "11px" }}
                    >
                      <span>Pengiriman:</span>
                      <span>{formatCurrency(selectedOrder.shipping_cost)}</span>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      fontSize: "13px",
                      fontWeight: "bold",
                      borderTop: "2px solid #333",
                      marginTop: "5px",
                    }}
                  >
                    <span>Grand Total:</span>
                    <span>{formatCurrency(selectedOrder.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* Digital Signature for Approved Orders */}
              {selectedOrder.status !== "draft" && selectedOrder.approved_at && (
                <div
                  style={{
                    marginTop: "30px",
                    padding: "15px",
                    border: "2px solid #059669",
                    borderRadius: "8px",
                    background: "#f0fdf4",
                  }}
                >
                  <h4
                    style={{
                      color: "#059669",
                      marginBottom: "10px",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <PenLine className="w-4 h-4" />
                    {language === "en" ? "DIGITAL SIGNATURE" : "TANDA TANGAN DIGITAL"}
                  </h4>
                  <p style={{ fontSize: "10px", margin: "3px 0" }}>
                    <strong>{language === "en" ? "Approved By" : "Disetujui Oleh"}:</strong>{" "}
                    {selectedOrder.approved_by || "System"}
                  </p>
                  <p style={{ fontSize: "10px", margin: "3px 0" }}>
                    <strong>{language === "en" ? "Approval Date" : "Tanggal Persetujuan"}:</strong>{" "}
                    {formatDate(selectedOrder.approved_at)}
                  </p>
                  <p style={{ fontSize: "10px", margin: "3px 0" }}>
                    <strong>Status:</strong> {selectedOrder.status.toUpperCase()}
                  </p>
                  <p style={{ fontSize: "8px", marginTop: "8px", color: "#666" }}>
                    {language === "en"
                      ? "This document has been digitally approved and is valid without physical signature."
                      : "Dokumen ini telah disetujui secara digital dan sah tanpa tanda tangan fisik."}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsPdfPreviewOpen(false)}>
              {language === "en" ? "Close" : "Tutup"}
            </Button>
            <Button variant="outline" onClick={handleDownloadPDF} disabled={isDownloadingPdf}>
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {language === "en" ? "Download PDF" : "Unduh PDF"}
            </Button>
            <Button onClick={handleExportPDF}>
              <Printer className="w-4 h-4 mr-2" />
              {language === "en" ? "Print" : "Cetak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
