import React, { useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
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
} from "lucide-react";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
import { useCustomers, useProducts } from "@/hooks/useMasterData";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const LOGO_SRC = "/logo-kemika.png";

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

  // DISABLE item discount; keep for schema compatibility
  discount: number;

  subtotal: number;
  stock_available: number;
}

function extractStoragePathFromDocumentsUrl(url: string): string | null {
  // goal: return path inside bucket "documents", e.g. "sales-orders/xxx.pdf"
  try {
    if (!url) return null;

    // if plain path already
    if (!url.startsWith("http")) {
      return url.replace(/^\/+/, "");
    }

    // signed/public: .../storage/v1/object/(sign|public)/documents/<path>?...
    const m1 = url.match(/\/storage\/v1\/object\/(?:sign|public)\/documents\/(.+?)(?:\?|$)/);
    if (m1?.[1]) return decodeURIComponent(m1[1]);

    // some supabase URLs: .../storage/v1/object/documents/<path>
    const m2 = url.match(/\/storage\/v1\/object\/documents\/(.+?)(?:\?|$)/);
    if (m2?.[1]) return decodeURIComponent(m2[1]);

    // if url contains "/documents/" anywhere
    const idx = url.indexOf("/documents/");
    if (idx >= 0) {
      const part = url.substring(idx + "/documents/".length);
      return decodeURIComponent(part.split("?")[0]);
    }

    return null;
  } catch {
    return null;
  }
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const printRef = useRef<HTMLDivElement>(null);

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

  // ONLY ONE DISCOUNT (order-level)
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(11);
  const [shippingCost, setShippingCost] = useState(0);

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  // auto-fill
  const [customerPic, setCustomerPic] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const canApprove = useMemo(() => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    if (user.role === "admin" && allowAdminApprove) return true;
    return false;
  }, [user, allowAdminApprove]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(
      value,
    );
  };

  const formatDateID = (dateStr?: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  };

  const formatDateShort = (dateStr?: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  };

  const filteredOrders = useMemo(() => {
    return salesOrders.filter((order) => {
      const matchesSearch =
        order.sales_order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer_po_number.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const d = new Date(order.order_date);
      const matchesFrom = !dateFrom || d >= new Date(dateFrom);
      const matchesTo = !dateTo || d <= new Date(dateTo);

      const activeStatuses = ["draft", "approved", "partially_delivered"];
      const archivedStatuses = ["delivered", "cancelled"];

      const matchesViewMode =
        viewMode === "active" ? activeStatuses.includes(order.status) : archivedStatuses.includes(order.status);

      return matchesSearch && matchesStatus && matchesFrom && matchesTo && matchesViewMode;
    });
  }, [salesOrders, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  const hasActiveFilters = statusFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const generateSoNumber = async () => {
    const { data } = await supabase
      .from("sales_order_headers")
      .select("sales_order_number")
      .order("created_at", { ascending: false })
      .limit(1);

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    let sequence = 1;
    if (data && data.length > 0) {
      const last = data[0].sales_order_number;
      const match = last.match(/SOR[-\/](\d{6,8})[-\/](\d+)/);
      if (match) {
        const lastYearMonth = match[1].slice(0, 6);
        const currentYearMonth = `${year}${month}`;
        if (lastYearMonth === currentYearMonth) sequence = parseInt(match[2], 10) + 1;
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
    setDiscount(0);
    setTaxRate(11);
    setShippingCost(0);
    setOrderItems([]);
    setSelectedProductId("");
    setCustomerPic("");
    setCustomerPhone("");
    setPaymentTerms("");
  };

  const handleOpenDialog = async () => {
    resetForm();
    await generateSoNumber();
    setIsEditMode(false);
    setEditingOrderId(null);
    setIsDialogOpen(true);
  };

  const handleCustomerChange = (newId: string) => {
    setCustomerId(newId);
    const c: any = customers.find((x: any) => x.id === newId);
    if (c) {
      setCustomerPic(c.pic || "");
      setCustomerPhone(c.phone || "");
      setPaymentTerms(c.terms_payment || "");
      if (!shipToAddress) setShipToAddress(c.address || "");
    }
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

    setDiscount(order.discount || 0);
    setTaxRate(order.tax_rate || 11);
    setShippingCost(order.shipping_cost || 0);

    setEditingOrderId(order.id);
    setIsEditMode(true);

    const { data } = await supabase
      .from("sales_order_items")
      .select(
        `*, product:products(id, name, sku, selling_price, purchase_price, category:categories(name), unit:units(name))`,
      )
      .eq("sales_order_id", order.id);

    if (data) {
      const items: OrderItem[] = [];
      for (const it of data as any[]) {
        const stock = await getProductStock(it.product_id);
        const qty = it.ordered_qty || 0;
        const price = it.unit_price || 0;
        items.push({
          product_id: it.product_id,
          product_name: it.product?.name || "",
          sku: it.product?.sku || "-",
          unit: it.product?.unit?.name || "-",
          category: it.product?.category?.name || "-",
          unit_price: price,
          ordered_qty: qty,
          discount: 0, // DISABLE item discount
          subtotal: qty * price,
          stock_available: stock,
        });
      }
      setOrderItems(items);
    }

    const c: any = customers.find((x: any) => x.id === order.customer_id);
    if (c) {
      setCustomerPic(c.pic || "");
      setCustomerPhone(c.phone || "");
      setPaymentTerms(c.terms_payment || "");
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
      toast.success(language === "en" ? "Document uploaded successfully" : "Dokumen berhasil diupload");
    } else {
      toast.error(language === "en" ? "Failed to upload document" : "Gagal upload dokumen");
    }
    setIsUploading(false);
  };

  const handleAddProduct = async () => {
    if (!selectedProductId) return;
    const p: any = products.find((x: any) => x.id === selectedProductId);
    if (!p) return;

    if (orderItems.some((it) => it.product_id === selectedProductId)) {
      toast.error(language === "en" ? "Product already added" : "Produk sudah ditambahkan");
      return;
    }

    const stockAvailable = await getProductStock(selectedProductId);

    const price = p.selling_price || p.purchase_price || 0;

    setOrderItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        product_name: p.name,
        sku: p.sku || "-",
        unit: p.unit?.name || "-",
        category: p.category?.name || "-",
        unit_price: price,
        ordered_qty: 1,
        discount: 0, // DISABLE item discount
        subtotal: 1 * price,
        stock_available: stockAvailable,
      },
    ]);

    setSelectedProductId("");
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: number) => {
    setOrderItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;

        const next = { ...it } as OrderItem;

        if (field === "ordered_qty") next.ordered_qty = value;
        if (field === "unit_price") next.unit_price = value;

        // DISABLE item discount; subtotal always qty*price
        next.discount = 0;
        next.subtotal = (next.ordered_qty || 0) * (next.unit_price || 0);

        return next;
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    const subtotal = orderItems.reduce((sum, it) => sum + (it.subtotal || 0), 0);

    const safeDiscount = Math.max(0, discount || 0);
    const totalAfterDiscount = Math.max(0, subtotal - safeDiscount);

    const safeTaxRate = Math.max(0, taxRate || 0);
    const taxAmount = totalAfterDiscount * (safeTaxRate / 100);

    const safeShipping = Math.max(0, shippingCost || 0);
    const grandTotal = totalAfterDiscount + taxAmount + safeShipping;

    return { subtotal, totalAfterDiscount, taxAmount, grandTotal };
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

    for (const it of orderItems) {
      if (it.ordered_qty > it.stock_available) {
        toast.warning(
          language === "en"
            ? `Warning: ${it.product_name} has insufficient stock (Available: ${it.stock_available})`
            : `Peringatan: ${it.product_name} stok tidak cukup (Tersedia: ${it.stock_available})`,
        );
      }
    }

    setIsSaving(true);

    const { subtotal, grandTotal } = calculateTotals();

    const itemsPayload = orderItems.map((it) => ({
      product_id: it.product_id,
      unit_price: it.unit_price,
      ordered_qty: it.ordered_qty,
      discount: 0, // item discount DISABLED
    }));

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
          discount: Math.max(0, discount || 0), // ONLY ONE DISCOUNT
          tax_rate: Math.max(0, taxRate || 0),
          shipping_cost: Math.max(0, shippingCost || 0),
          grand_total: grandTotal,
        },
        itemsPayload,
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
          discount: Math.max(0, discount || 0), // ONLY ONE DISCOUNT
          tax_rate: Math.max(0, taxRate || 0),
          shipping_cost: Math.max(0, shippingCost || 0),
          grand_total: grandTotal,
          created_by: null,
          approved_by: null,
          approved_at: null,
        },
        itemsPayload,
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
    } else toast.error(result.error || "Failed to approve");
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
    } else toast.error(result.error || "Failed to cancel");
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
    } else toast.error(result.error || "Failed to delete");
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

      // 1) try extract storage path
      const storagePath = extractStoragePathFromDocumentsUrl(url);

      // 2) if we can sign => open signed URL
      if (storagePath) {
        const signed = await getSignedUrl(storagePath, "documents", 3600);
        if (signed) {
          window.open(signed, "_blank");
          setIsOpeningPoDoc(false);
          return;
        }
      }

      // 3) fallback open directly (for public / already signed)
      if (url.startsWith("http")) {
        window.open(url, "_blank");
      } else {
        toast.error(language === "en" ? "Failed to open document" : "Gagal membuka dokumen");
      }
    } catch (e) {
      console.error(e);
      toast.error(language === "en" ? "Failed to open document" : "Gagal membuka dokumen");
    }
    setIsOpeningPoDoc(false);
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
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `SalesOrder_${selectedOrder.sales_order_number}.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
        pagebreak: { mode: ["css", "legacy"] as any },
      };

      await (html2pdf() as any).set(opt).from(element).save();
      toast.success(language === "en" ? "PDF downloaded successfully" : "PDF berhasil diunduh");
    } catch (e) {
      console.error(e);
      toast.error(language === "en" ? "Failed to download PDF" : "Gagal mengunduh PDF");
    }
    setIsDownloadingPdf(false);
  };

  const handlePrint = () => {
    if (!selectedOrder || !printRef.current) return;

    const html = printRef.current.innerHTML;
    const w = window.open("", "_blank");
    if (!w) return;

    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Order - ${selectedOrder.sales_order_number}</title>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18mm; color: #111; }
          @page { size: A4; margin: 12mm; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = function() { window.print(); window.onafterprint = function(){ window.close(); } }
        </script>
      </body>
      </html>
    `);
    w.document.close();
  };

  const { subtotal, taxAmount, grandTotal } = calculateTotals();

  // ===== PDF TEMPLATE (same as before, but totals now include ONLY ONE DISCOUNT) =====
  const PdfTemplate = ({ order }: { order: SalesOrderHeader }) => {
    const alloc = (order.allocation_type || "").toUpperCase();

    const safeDiscount = Math.max(0, order.discount || 0);
    const afterDisc = Math.max(0, (order.total_amount || 0) - safeDiscount);
    const tax = afterDisc * (Math.max(0, order.tax_rate || 0) / 100);

    return (
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <img src={LOGO_SRC} alt="Kemika" style={{ height: 44, objectFit: "contain" }} />
          </div>

          <div style={{ textAlign: "right" }}>
            <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 0.5 }}>SALES ORDER</h1>
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6 }}>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <div style={{ width: 92, textAlign: "left", color: "#444" }}>Sales Order No.</div>
                <div style={{ width: 10, textAlign: "center", color: "#444" }}>:</div>
                <div style={{ width: 120, textAlign: "left", fontWeight: 600 }}>
                  {order.sales_order_number?.replace("SOR", "PO") || order.sales_order_number}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <div style={{ width: 92, textAlign: "left", color: "#444" }}>SO Date</div>
                <div style={{ width: 10, textAlign: "center", color: "#444" }}>:</div>
                <div style={{ width: 120, textAlign: "left", fontWeight: 600 }}>
                  {formatDateShort(order.order_date)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 11 }}>
          <span style={{ color: "#444" }}>TIPE ALOKASI</span>
          <span style={{ color: "#444", fontWeight: 600 }}> : </span>
          <span style={{ fontWeight: 700, color: "#c1121f" }}>{alloc}</span>
        </div>

        <div style={{ borderTop: "2px solid #2a2a2a", margin: "10px 0 14px" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, fontSize: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 10, columnGap: 10 }}>
            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>SALES</div>
            <div style={{ fontWeight: 600 }}>{order.sales_name || "-"}</div>

            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>CUSTOMER</div>
            <div style={{ fontWeight: 600 }}>{order.customer?.name || "-"}</div>

            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>PIC</div>
            <div style={{ fontWeight: 600 }}>{order.customer?.pic || customerPic || "-"}</div>

            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>PHONE</div>
            <div style={{ fontWeight: 600 }}>{order.customer?.phone || customerPhone || "-"}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 10, columnGap: 10 }}>
            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>TANGGAL</div>
            <div style={{ fontWeight: 600 }}>{formatDateID(order.order_date)}</div>

            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>PO CUSTOMER</div>
            <div style={{ fontWeight: 600 }}>{order.customer_po_number || "-"}</div>

            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>BATAS PENGIRIMAN</div>
            <div style={{ fontWeight: 600 }}>{formatDateID(order.delivery_deadline)}</div>

            <div style={{ color: "#444", textTransform: "uppercase", fontSize: 10 }}>PAYMENT TERMS</div>
            <div style={{ color: "#c1121f", fontWeight: 800 }}>
              {(order.customer?.terms_payment || paymentTerms || "-").toString().toUpperCase()}
            </div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ background: "#0b6b3a", color: "#fff", padding: 8, border: "1px solid #0b6b3a", width: 40 }}>
                No
              </th>
              <th style={{ background: "#0b6b3a", color: "#fff", padding: 8, border: "1px solid #0b6b3a" }}>
                Nama Barang
              </th>
              <th style={{ background: "#0b6b3a", color: "#fff", padding: 8, border: "1px solid #0b6b3a", width: 90 }}>
                SKU
              </th>
              <th style={{ background: "#0b6b3a", color: "#fff", padding: 8, border: "1px solid #0b6b3a", width: 110 }}>
                Kategori
              </th>
              <th style={{ background: "#0b6b3a", color: "#fff", padding: 8, border: "1px solid #0b6b3a", width: 70 }}>
                Satuan
              </th>
              <th
                style={{
                  background: "#0b6b3a",
                  color: "#fff",
                  padding: 8,
                  border: "1px solid #0b6b3a",
                  width: 70,
                  textAlign: "center",
                }}
              >
                Qty
              </th>
              <th
                style={{
                  background: "#0b6b3a",
                  color: "#fff",
                  padding: 8,
                  border: "1px solid #0b6b3a",
                  width: 110,
                  textAlign: "right",
                }}
              >
                Harga
              </th>
              <th
                style={{
                  background: "#0b6b3a",
                  color: "#fff",
                  padding: 8,
                  border: "1px solid #0b6b3a",
                  width: 120,
                  textAlign: "right",
                }}
              >
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {selectedOrderItems.map((it: any, idx: number) => (
              <tr key={it.id}>
                <td style={{ border: "1px solid #cfcfcf", padding: 8 }}>{idx + 1}</td>
                <td style={{ border: "1px solid #cfcfcf", padding: 8 }}>{it.product?.name || "-"}</td>
                <td style={{ border: "1px solid #cfcfcf", padding: 8 }}>{it.product?.sku || "-"}</td>
                <td style={{ border: "1px solid #cfcfcf", padding: 8 }}>{it.product?.category?.name || "-"}</td>
                <td style={{ border: "1px solid #cfcfcf", padding: 8 }}>{it.product?.unit?.name || "-"}</td>
                <td style={{ border: "1px solid #cfcfcf", padding: 8, textAlign: "center" }}>{it.ordered_qty}</td>
                <td style={{ border: "1px solid #cfcfcf", padding: 8, textAlign: "right" }}>
                  {formatCurrency(it.unit_price)}
                </td>
                <td style={{ border: "1px solid #cfcfcf", padding: 8, textAlign: "right" }}>
                  {formatCurrency(it.subtotal ?? it.unit_price * it.ordered_qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 10, fontSize: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <div style={{ color: "#444" }}>Subtotal</div>
            <div style={{ fontWeight: 700 }}>{formatCurrency(order.total_amount || 0)}</div>
          </div>

          {safeDiscount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <div style={{ color: "#444" }}>Discount</div>
              <div style={{ fontWeight: 700 }}>-{formatCurrency(safeDiscount)}</div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
            <div style={{ color: "#444" }}>Tax ({order.tax_rate || 0}%)</div>
            <div style={{ fontWeight: 700 }}>{formatCurrency(tax)}</div>
          </div>

          <div
            style={{
              marginTop: 8,
              borderTop: "2px solid #2a2a2a",
              paddingTop: 8,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14 }}>Grand Total</div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>{formatCurrency(order.grand_total || 0)}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, border: "1px solid #2a2a2a", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ padding: 10, minHeight: 70 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#444" }}>SHIP TO ADDRESS/ALAMAT PENGIRIMAN:</div>
            <div style={{ marginTop: 8, fontSize: 11 }}>{order.ship_to_address || "-"}</div>
          </div>
          <div style={{ padding: 10, minHeight: 70, borderLeft: "1px solid #2a2a2a" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#444" }}>CATATAN :</div>
            <div style={{ marginTop: 8, fontSize: 11 }}>{order.notes || "-"}</div>
          </div>
        </div>

        <div
          style={{ marginTop: 16, border: "1px solid #2a2a2a", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          {["Pemohon,", "Finance,", "Purchasing,", "Menyetujui,"].map((role, i) => (
            <div
              key={role}
              style={{
                minHeight: 125,
                borderRight: i === 3 ? "none" : "1px solid #2a2a2a",
                padding: 10,
                fontSize: 11,
                position: "relative",
              }}
            >
              <div style={{ fontSize: 11, marginBottom: 10 }}>Date:</div>
              <div style={{ marginTop: 8 }}>{role}</div>
              <div style={{ position: "absolute", left: 10, right: 10, bottom: 12, borderTop: "1px solid #2a2a2a" }} />
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  bottom: 0,
                  textAlign: "center",
                  transform: "translateY(8px)",
                  fontSize: 11,
                }}
              >
                (……………..…........………)
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ===== END PDF TEMPLATE =====

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

      {/* Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
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
                        <TableCell>{formatDateID(order.order_date)}</TableCell>
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

      {/* Create/Edit */}
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
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={handleCustomerChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === "en" ? "Select customer" : "Pilih customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Customer PO Number" : "No. PO Customer"} *</Label>
                <Input
                  value={customerPoNumber}
                  onChange={(e) => setCustomerPoNumber(e.target.value)}
                  placeholder="e.g., PO-0001"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{language === "en" ? "Sales Name" : "Nama Sales"} *</Label>
                <Input value={salesName} onChange={(e) => setSalesName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Allocation Type" : "Tipe Alokasi"} *</Label>
                <Select value={allocationType} onValueChange={setAllocationType}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === "en" ? "Select type" : "Pilih tipe"} />
                  </SelectTrigger>
                  <SelectContent>
                    {allocationTypes.map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Project/Instansi" : "Proyek/Instansi"} *</Label>
                <Input value={projectInstansi} onChange={(e) => setProjectInstansi(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Delivery Deadline" : "Batas Pengiriman"} *</Label>
                <Input type="date" value={deliveryDeadline} onChange={(e) => setDeliveryDeadline(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === "en" ? "Ship To Address" : "Alamat Pengiriman"}</Label>
                <Textarea value={shipToAddress} onChange={(e) => setShipToAddress(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>{language === "en" ? "Notes" : "Catatan"}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{language === "en" ? "PO Document" : "Dokumen PO"}</Label>
              <div className="flex gap-2">
                <Input
                  value={poDocumentUrl ? decodeURIComponent(poDocumentUrl.split("?")[0].split("/").pop() || "") : ""}
                  disabled
                  placeholder={language === "en" ? "Upload PO document" : "Upload dokumen PO"}
                  className="bg-muted flex-1"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
                {poDocumentUrl && (
                  <Button variant="outline" size="icon" onClick={() => setPoDocumentUrl("")}>
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

            {/* Items */}
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
                      {(products as any[])
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
                      <TableHead />
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          {language === "en" ? "No products added" : "Belum ada produk ditambahkan"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((it, idx) => (
                        <TableRow key={it.product_id}>
                          <TableCell className="font-medium">{it.product_name}</TableCell>
                          <TableCell>{it.sku}</TableCell>
                          <TableCell>{it.unit}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={it.stock_available >= it.ordered_qty ? "success" : "pending"}>
                              {it.stock_available}
                            </Badge>
                            {it.stock_available < it.ordered_qty && (
                              <AlertTriangle className="w-4 h-4 text-warning inline ml-1" />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              value={it.unit_price}
                              onChange={(e) => handleItemChange(idx, "unit_price", parseFloat(e.target.value) || 0)}
                              className="w-28 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="1"
                              value={it.ordered_qty}
                              onChange={(e) => handleItemChange(idx, "ordered_qty", parseInt(e.target.value) || 1)}
                              className="w-20 text-center"
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(it.subtotal)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(idx)}>
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

            {/* Totals (ONLY ONE DISCOUNT) */}
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
                    <span className="font-medium text-destructive">-{formatCurrency(Math.max(0, discount || 0))}</span>
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

      {/* Approve */}
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

      {/* Cancel */}
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

      {/* Delete */}
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

      {/* Detail */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>{language === "en" ? "Sales Order Details" : "Detail Sales Order"}</DialogTitle>
              <div className="flex gap-2 flex-wrap justify-end">
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
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={itemsLoading}>
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
                  <p className="font-medium">{formatDateID(selectedOrder.order_date)}</p>
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

      {/* Hidden PDF/Print DOM */}
      <div className="hidden">
        <div ref={printRef}>{selectedOrder && <PdfTemplate order={selectedOrder} />}</div>
      </div>

      {/* PDF Preview */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={setIsPdfPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "PDF Preview" : "Preview PDF"}</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="bg-white text-black p-6 rounded-lg border">
              <PdfTemplate order={selectedOrder} />
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
            <Button onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              {language === "en" ? "Print" : "Cetak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
