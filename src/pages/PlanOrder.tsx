import React, { useState, useRef, useMemo, useEffect } from "react";
import { securePrint, printStyles } from "@/lib/printUtils";
import html2pdf from "html2pdf.js";
import DOMPurify from "dompurify";

import {
  Plus,
  Search,
  Eye,
  Edit,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Loader2,
  Upload,
  ArrowLeft,
  Trash2,
  Printer,
  Archive,
  List,
  Download,
  Package,
  FileText,
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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

import {
  usePlanOrders,
  usePlanOrderItems,
  useSettings,
  createPlanOrder,
  updatePlanOrder,
  approvePlanOrder,
  cancelPlanOrder,
  deletePlanOrder,
  logPlanOrderUpload,
  PlanOrderHeader,
  PlanOrderItem,
} from "@/hooks/usePlanOrders";

import { useSuppliers, useProducts, Product } from "@/hooks/useMasterData";
import { uploadFile, getSignedUrl } from "@/lib/storage";
import { generateUniquePlanOrderNumber } from "@/lib/transactionNumberUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrderItem {
  id: string;
  product_id: string;
  product?: Partial<Product> & { id: string; name: string };
  unit_price: number;
  planned_qty: number;
  notes: string;
}

const statusConfig: Record<
  string,
  { label: string; labelId: string; variant: "draft" | "approved" | "pending" | "success" | "cancelled" }
> = {
  draft: { label: "Draft", labelId: "Draft", variant: "draft" },
  approved: { label: "Approved", labelId: "Disetujui", variant: "approved" },
  partially_received: { label: "Partially Received", labelId: "Diterima Sebagian", variant: "pending" },
  received: { label: "Received", labelId: "Diterima", variant: "success" },
  cancelled: { label: "Cancelled", labelId: "Dibatalkan", variant: "cancelled" },
};

export default function PlanOrder() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { planOrders, loading, refetch } = usePlanOrders();
  const { suppliers } = useSuppliers();
  const { products } = useProducts();
  const { allowAdminApprove } = useSettings();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<PlanOrderHeader | null>(null);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const { items: selectedOrderItems, loading: itemsLoading } = usePlanOrderItems(selectedOrder?.id || null);

  // Form state
  const [planNumber, setPlanNumber] = useState("");
  const [planDate, setPlanDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [poDocumentUrl, setPoDocumentUrl] = useState("");
  const [poDocumentKey, setPoDocumentKey] = useState("");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("11");
  const [shippingCost, setShippingCost] = useState("0");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isOpeningPoDoc, setIsOpeningPoDoc] = useState(false);
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);

  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);

  // Stock In history
  const [stockInHistory, setStockInHistory] = useState<any[]>([]);
  const [stockInHistoryLoading, setStockInHistoryLoading] = useState(false);

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

  const safeNumber = (v: any) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
  };

  // Permissions approve
  const canApprove = useMemo(() => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    if (user.role === "admin" && allowAdminApprove) return true;
    return false;
  }, [user, allowAdminApprove]);

  // Filter list
  const filteredOrders = useMemo(() => {
    return planOrders.filter((order) => {
      const matchesSearch =
        order.plan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const orderDate = new Date(order.plan_date);
      const matchesDateFrom = !dateFrom || orderDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || orderDate <= new Date(dateTo);

      const activeStatuses = ["draft", "approved", "partially_received"];
      const archivedStatuses = ["received", "cancelled"];
      const matchesViewMode =
        viewMode === "active" ? activeStatuses.includes(order.status) : archivedStatuses.includes(order.status);

      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [planOrders, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = statusFilter !== "all" || dateFrom || dateTo;

  const calculateTotals = () => {
    const subtotal = orderItems.reduce(
      (sum, item) => sum + safeNumber(item.unit_price) * safeNumber(item.planned_qty),
      0,
    );
    const discountValue = safeNumber(discount);
    const afterDiscount = subtotal - discountValue;
    const taxValue = (afterDiscount * safeNumber(taxRate)) / 100;
    const shippingValue = safeNumber(shippingCost);
    const grandTotal = afterDiscount + taxValue + shippingValue;
    return { subtotal, discountValue, afterDiscount, taxValue, shippingValue, grandTotal };
  };

  // --- NEW: Print/Preview/Download handlers (SalesOrder-like) ---
  const handlePrint = () => {
    if (!selectedOrder || !printRef.current) return;
    securePrint({
      title: `Plan Order - ${selectedOrder.plan_number}`,
      styles: printStyles.planOrder,
      content: printRef.current.innerHTML,
    });
  };

  const handlePreviewPDF = () => {
    if (!selectedOrder || !printRef.current) return;
    setIsPdfPreviewOpen(true);
  };

  const handleDownloadPDF = async () => {
    if (!selectedOrder || !printRef.current) return;
    setIsDownloadingPdf(true);
    try {
      const opt: any = {
        margin: [10, 10, 10, 10],
        filename: `PlanOrder_${selectedOrder.plan_number}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };

      // Use sanitized HTML to reduce broken rendering
      const temp = document.createElement("div");
      temp.innerHTML = DOMPurify.sanitize(printRef.current.innerHTML);

      await (html2pdf() as any).set(opt).from(temp).save();
    } catch (e) {
      console.error(e);
      toast.error(language === "en" ? "Failed to download PDF" : "Gagal mengunduh PDF");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleViewPoDocument = async (order: PlanOrderHeader) => {
    setIsOpeningPoDoc(true);
    try {
      const { data, error } = await supabase
        .from("attachments")
        .select("file_key, url")
        .eq("ref_table", "plan_order_headers")
        .eq("ref_id", order.id)
        .order("uploaded_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const fileKey = data?.[0]?.file_key;
      const fallbackUrl = data?.[0]?.url || order.po_document_url || "";

      const freshUrl = fileKey ? await getSignedUrl(fileKey, "documents") : null;
      const urlToOpen = freshUrl || fallbackUrl;

      if (!urlToOpen) {
        toast.error(language === "en" ? "Document not found" : "Dokumen tidak ditemukan");
        return;
      }

      setDocumentViewerUrl(urlToOpen);
      setIsDocumentViewerOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to open document" : "Gagal membuka dokumen");
    } finally {
      setIsOpeningPoDoc(false);
    }
  };

  const generatePlanNumber = async () => {
    setIsGeneratingNumber(true);
    const number = await generateUniquePlanOrderNumber();
    setPlanNumber(number);
    setIsGeneratingNumber(false);
  };

  const resetForm = () => {
    setPlanNumber("");
    setPlanDate(new Date().toISOString().split("T")[0]);
    setSupplierId("");
    setExpectedDelivery("");
    setNotes("");
    setPoDocumentUrl("");
    setPoDocumentKey("");
    setDiscount("0");
    setTaxRate("11");
    setShippingCost("0");
    setOrderItems([]);
  };

  const handleAddItem = () => {
    setOrderItems((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        product_id: "",
        unit_price: 0,
        planned_qty: 1,
        notes: "",
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: string | number) => {
    setOrderItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (field === "product_id") {
          const product = products.find((p) => p.id === value);
          return {
            ...item,
            product_id: value as string,
            product,
            unit_price: product?.purchase_price || 0,
          };
        }

        return { ...item, [field]: value } as any;
      }),
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, "documents", "plan-orders");

    if (result) {
      setPoDocumentUrl(result.url);
      setPoDocumentKey(result.path);
      toast.success(language === "en" ? "Document uploaded successfully" : "Dokumen berhasil diupload");
    } else {
      toast.error(language === "en" ? "Failed to upload document" : "Gagal upload dokumen");
    }
    setIsUploading(false);
  };

  const handleSubmit = async () => {
    if (!planNumber || !supplierId || orderItems.length === 0) {
      toast.error(language === "en" ? "Please fill all required fields" : "Harap isi semua field wajib");
      return;
    }

    if (orderItems.some((item) => !item.product_id || safeNumber(item.planned_qty) <= 0)) {
      toast.error(language === "en" ? "Please complete all line items" : "Harap lengkapi semua item");
      return;
    }

    if (!poDocumentUrl) {
      toast.error(language === "en" ? "Please upload PO document" : "Harap upload dokumen PO");
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
        status: "draft",
        total_amount: subtotal,
        discount: discountValue,
        tax_rate: safeNumber(taxRate),
        shipping_cost: safeNumber(shippingCost),
        grand_total: grandTotal,
        created_by: user?.id || null,
        approved_by: null,
        approved_at: null,
      },
      orderItems.map((item) => ({
        product_id: item.product_id,
        unit_price: safeNumber(item.unit_price),
        planned_qty: safeNumber(item.planned_qty),
        notes: item.notes,
      })),
      poDocumentKey
        ? {
            file_key: poDocumentKey,
            url: poDocumentUrl,
            mime_type: undefined,
            file_size: undefined,
          }
        : undefined,
    );

    if (result.success) {
      toast.success(language === "en" ? "Plan Order created successfully" : "Plan Order berhasil dibuat");
      setIsFormOpen(false);
      resetForm();
      refetch();
    } else {
      toast.error(result.error || "Failed to create plan order");
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
    const result = await approvePlanOrder(selectedOrder.id);

    if (result.success) {
      toast.success(language === "en" ? "Plan Order approved" : "Plan Order disetujui");
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
    const result = await cancelPlanOrder(selectedOrder.id);

    if (result.success) {
      toast.success(language === "en" ? "Plan Order cancelled" : "Plan Order dibatalkan");
      refetch();
    } else {
      toast.error(result.error || "Failed to cancel");
    }

    setIsCancelling(false);
    setIsCancelDialogOpen(false);
    setSelectedOrder(null);
  };

  const fetchOrderItemsForEdit = async (orderId: string) => {
    const { data, error } = await supabase
      .from("plan_order_items")
      .select(`*, product:products(id, name, sku, purchase_price)`)
      .eq("plan_order_id", orderId);

    if (!error && data) {
      setOrderItems(
        data.map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          product: item.product,
          unit_price: item.unit_price,
          planned_qty: item.planned_qty,
          notes: item.notes || "",
        })),
      );
    }
  };

  const handleEdit = (order: PlanOrderHeader) => {
    setPlanNumber(order.plan_number);
    setPlanDate(order.plan_date);
    setSupplierId(order.supplier_id);
    setExpectedDelivery(order.expected_delivery_date || "");
    setNotes(order.notes || "");
    setPoDocumentUrl(order.po_document_url || "");
    setPoDocumentKey("");
    setDiscount(order.discount?.toString() || "0");
    setTaxRate(order.tax_rate?.toString() || "11");
    setShippingCost(order.shipping_cost?.toString() || "0");
    setEditingOrderId(order.id);
    setIsEditMode(true);
    setIsFormOpen(true);

    fetchOrderItemsForEdit(order.id);
  };

  const handleUpdate = async () => {
    if (!editingOrderId || !planNumber || !supplierId || orderItems.length === 0) {
      toast.error(language === "en" ? "Please fill all required fields" : "Harap isi semua field wajib");
      return;
    }

    if (orderItems.some((item) => !item.product_id || safeNumber(item.planned_qty) <= 0)) {
      toast.error(language === "en" ? "Please complete all line items" : "Harap lengkapi semua item");
      return;
    }

    setIsSaving(true);
    const { subtotal, discountValue, grandTotal } = calculateTotals();

    const result = await updatePlanOrder(
      editingOrderId,
      {
        plan_number: planNumber,
        plan_date: planDate,
        supplier_id: supplierId,
        expected_delivery_date: expectedDelivery || null,
        notes: notes || null,
        po_document_url: poDocumentUrl,
        total_amount: subtotal,
        discount: discountValue,
        tax_rate: safeNumber(taxRate),
        shipping_cost: safeNumber(shippingCost),
        grand_total: grandTotal,
      },
      orderItems.map((item) => ({
        product_id: item.product_id,
        unit_price: safeNumber(item.unit_price),
        planned_qty: safeNumber(item.planned_qty),
        notes: item.notes,
      })),
    );

    if (result.success) {
      if (poDocumentKey && poDocumentUrl) {
        await logPlanOrderUpload(editingOrderId, planNumber, {
          file_key: poDocumentKey,
          url: poDocumentUrl,
        });
      }

      toast.success(language === "en" ? "Plan Order updated successfully" : "Plan Order berhasil diupdate");
      setIsFormOpen(false);
      setIsEditMode(false);
      setEditingOrderId(null);
      resetForm();
      refetch();
    } else {
      toast.error(result.error || "Failed to update");
    }

    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedOrder) return;

    setIsDeleting(true);
    const result = await deletePlanOrder(selectedOrder.id);

    if (result.success) {
      toast.success(language === "en" ? "Plan Order deleted" : "Plan Order dihapus");
      refetch();
    } else {
      toast.error(result.error || "Failed to delete");
    }

    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleViewDetail = async (order: PlanOrderHeader) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);

    setStockInHistoryLoading(true);
    try {
      const { data: stockIns, error } = await supabase
        .from("stock_in_headers")
        .select(
          `
          id,
          stock_in_number,
          received_date,
          notes,
          created_at,
          stock_in_items (
            id,
            qty_received,
            batch_no,
            expired_date,
            product:products (name, sku)
          )
        `,
        )
        .eq("plan_order_id", order.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setStockInHistory(stockIns || []);
    } catch (err) {
      console.error("Failed to fetch stock in history:", err);
      setStockInHistory([]);
    } finally {
      setStockInHistoryLoading(false);
    }
  };

  // ========= FORM VIEW =========
  const { subtotal, discountValue, taxValue, shippingValue, grandTotal } = calculateTotals();

  if (isFormOpen) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsFormOpen(false);
              setIsEditMode(false);
              setEditingOrderId(null);
              resetForm();
            }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-display">
              {isEditMode
                ? language === "en"
                  ? "Edit Plan Order"
                  : "Edit Plan Order"
                : language === "en"
                  ? "Create Plan Order"
                  : "Buat Plan Order"}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode
                ? language === "en"
                  ? "Update existing plan order"
                  : "Ubah plan order yang ada"
                : language === "en"
                  ? "Create new inbound plan"
                  : "Buat rencana pembelian baru"}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === "en" ? "Order Information" : "Informasi Order"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{language === "en" ? "Plan Number" : "Nomor Plan"} *</Label>
                    <Input
                      placeholder={isGeneratingNumber ? "Generating..." : "e.g., PO/20260108.01"}
                      value={planNumber}
                      disabled={!isEditMode}
                      className={!isEditMode ? "bg-muted font-mono" : ""}
                      onChange={(e) => setPlanNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === "en" ? "Plan Date" : "Tanggal Plan"} *</Label>
                    <Input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Supplier *</Label>
                    <Select value={supplierId} onValueChange={setSupplierId}>
                      <SelectTrigger>
                        <SelectValue placeholder={language === "en" ? "Select supplier" : "Pilih supplier"} />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>
                            {sup.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{language === "en" ? "Expected Delivery" : "Estimasi Pengiriman"}</Label>
                    <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{language === "en" ? "PO Document" : "Dokumen PO"} *</Label>
                  <div className="flex items-center gap-4">
                    {poDocumentUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded overflow-hidden">
                        <span className="text-sm truncate max-w-[250px] text-primary">
                          {(() => {
                            const urlPath = poDocumentUrl.split("?")[0];
                            const segments = urlPath.split("/");
                            const filename = segments[segments.length - 1];
                            const timestampPattern = /^\d{13}-/;
                            return decodeURIComponent(filename.replace(timestampPattern, ""));
                          })()}
                        </span>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => {
                            setPoDocumentUrl("");
                            setPoDocumentKey("");
                          }}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        {language === "en" ? "Upload Document" : "Upload Dokumen"}
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
                  <Label>{language === "en" ? "Notes" : "Catatan"}</Label>
                  <Textarea
                    placeholder={language === "en" ? "Additional notes..." : "Catatan tambahan..."}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{language === "en" ? "Order Items" : "Item Order"}</CardTitle>
                <Button size="sm" onClick={handleAddItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  {language === "en" ? "Add Item" : "Tambah Item"}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">{language === "en" ? "Product" : "Produk"}</TableHead>
                      <TableHead className="text-right">{language === "en" ? "Unit Price" : "Harga"}</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {language === "en" ? "No items added yet" : "Belum ada item"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Select
                              value={item.product_id}
                              onValueChange={(value) => handleItemChange(item.id, "product_id", value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={language === "en" ? "Select product" : "Pilih produk"} />
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
                              onChange={(e) => handleItemChange(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              className="w-20 text-center mx-auto"
                              value={item.planned_qty}
                              min={1}
                              onChange={(e) => handleItemChange(item.id, "planned_qty", parseInt(e.target.value) || 1)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(safeNumber(item.unit_price) * safeNumber(item.planned_qty))}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(item.id)}>
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

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === "en" ? "Order Summary" : "Ringkasan Order"}</CardTitle>
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
                      min={0}
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
                      min={0}
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
                    <Label className="text-sm">{language === "en" ? "Shipping" : "Ongkir"}</Label>
                    <Input
                      type="number"
                      className="w-32 text-right"
                      value={shippingCost}
                      min={0}
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
                  ? language === "en"
                    ? "Update Order"
                    : "Update Order"
                  : language === "en"
                    ? "Save as Draft"
                    : "Simpan Draft"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsFormOpen(false);
                  setIsEditMode(false);
                  setEditingOrderId(null);
                  resetForm();
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========= LIST VIEW =========
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t("menu.planOrder")}</h1>
          <p className="text-muted-foreground">
            {t("menu.planOrderSub")} - {language === "en" ? "Manage procurement plans" : "Kelola rencana pembelian"}
          </p>
        </div>
        <Button
          onClick={() => {
            generatePlanNumber();
            setIsFormOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          {language === "en" ? "Create Plan Order" : "Buat Plan Order"}
        </Button>
      </div>

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

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={
                  language === "en"
                    ? "Search by PO number or supplier..."
                    : "Cari berdasarkan nomor PO atau supplier..."
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
                <SelectItem value="partially_received">
                  {language === "en" ? "Partially Received" : "Diterima Sebagian"}
                </SelectItem>
                <SelectItem value="received">{language === "en" ? "Received" : "Diterima"}</SelectItem>
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

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "en" ? "Plan Number" : "Nomor Plan"}</TableHead>
                  <TableHead>{language === "en" ? "Date" : "Tanggal"}</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>{language === "en" ? "Expected Delivery" : "Estimasi Pengiriman"}</TableHead>
                  <TableHead className="text-right">{language === "en" ? "Total Amount" : "Total"}</TableHead>
                  <TableHead className="text-center">{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {language === "en" ? "No plan orders found" : "Tidak ada plan order ditemukan"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const status = statusConfig[order.status];
                    const showApprove = order.status === "draft" && canApprove;
                    const showCancel = order.status === "draft" || order.status === "approved";
                    const showEdit = order.status === "draft";
                    const showDelete = order.status === "draft";

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.plan_number}</TableCell>
                        <TableCell>{formatDate(order.plan_date)}</TableCell>
                        <TableCell>{order.supplier?.name}</TableCell>
                        <TableCell>
                          {order.expected_delivery_date ? formatDate(order.expected_delivery_date) : "-"}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(order.grand_total)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={status?.variant || "draft"}>
                            {language === "en" ? status?.label : status?.labelId}
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
                                {language === "en" ? "View Details" : "Lihat Detail"}
                              </DropdownMenuItem>

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

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "en" ? "Approve Plan Order" : "Setujui Plan Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to approve "${selectedOrder?.plan_number}"?`
                : `Apakah Anda yakin ingin menyetujui "${selectedOrder?.plan_number}"?`}
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
            <AlertDialogTitle>{language === "en" ? "Cancel Plan Order" : "Batalkan Plan Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to cancel "${selectedOrder?.plan_number}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin membatalkan "${selectedOrder?.plan_number}"? Tindakan ini tidak dapat dibatalkan.`}
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
            <AlertDialogTitle>{language === "en" ? "Delete Plan Order" : "Hapus Plan Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to delete "${selectedOrder?.plan_number}"? This will archive the order.`
                : `Apakah Anda yakin ingin menghapus "${selectedOrder?.plan_number}"? Order akan diarsipkan.`}
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

      {/* View Detail Dialog (UPDATED: 4 buttons like SalesOrder) */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <DialogTitle>{language === "en" ? "Plan Order Details" : "Detail Plan Order"}</DialogTitle>

              <div className="flex flex-wrap gap-2 justify-end">
                {/* View Document */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedOrder && handleViewPoDocument(selectedOrder)}
                  disabled={itemsLoading || isOpeningPoDoc || !selectedOrder?.po_document_url}
                  className="gap-2"
                  title={
                    !selectedOrder?.po_document_url
                      ? language === "en"
                        ? "No document"
                        : "Dokumen tidak ada"
                      : undefined
                  }
                >
                  {isOpeningPoDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {language === "en" ? "View Document" : "Lihat Dokumen"}
                </Button>

                {/* Preview */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviewPDF}
                  disabled={itemsLoading}
                  className="gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </Button>

                {/* Download */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPDF}
                  disabled={itemsLoading || isDownloadingPdf}
                  className="gap-2"
                >
                  {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {language === "en" ? "Download" : "Unduh"}
                </Button>

                {/* Print */}
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={itemsLoading} className="gap-2">
                  <Printer className="w-4 h-4" />
                  {language === "en" ? "Print" : "Cetak"}
                </Button>
              </div>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Plan Number" : "Nomor Plan"}</p>
                  <p className="font-medium">{selectedOrder.plan_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Date" : "Tanggal"}</p>
                  <p className="font-medium">{formatDate(selectedOrder.plan_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{selectedOrder.supplier?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === "en" ? "Expected Delivery" : "Estimasi Pengiriman"}
                  </p>
                  <p className="font-medium">
                    {selectedOrder.expected_delivery_date ? formatDate(selectedOrder.expected_delivery_date) : "-"}
                  </p>
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

              {selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Notes" : "Catatan"}</p>
                  <p className="text-sm">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <h4 className="font-semibold mb-3">{language === "en" ? "Order Items" : "Item Order"}</h4>
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
                        <TableHead className="text-right">{language === "en" ? "Unit Price" : "Harga"}</TableHead>
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
                        selectedOrderItems.map((item: any, index: number) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-medium">{item.product?.name}</TableCell>
                            <TableCell>{item.product?.sku || "-"}</TableCell>
                            <TableCell>{item.product?.category?.name || "-"}</TableCell>
                            <TableCell>{item.product?.unit?.name || "-"}</TableCell>
                            <TableCell className="text-center">{item.planned_qty}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(
                                item.subtotal || safeNumber(item.unit_price) * safeNumber(item.planned_qty),
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
                {safeNumber(selectedOrder.discount) > 0 && (
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
                {safeNumber(selectedOrder.shipping_cost) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === "en" ? "Shipping" : "Ongkir"}</span>
                    <span>{formatCurrency(selectedOrder.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Grand Total</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.grand_total)}</span>
                </div>
              </div>

              {/* Stock In History */}
              {selectedOrder.status !== "draft" && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    {language === "en" ? "Stock In History" : "Riwayat Stock In"}
                  </h4>
                  {stockInHistoryLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : stockInHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {language === "en" ? "No stock in records yet" : "Belum ada riwayat stock in"}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {stockInHistory.map((si: any) => (
                        <Card key={si.id} className="border">
                          <CardHeader className="py-3 px-4">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-semibold text-sm">{si.stock_in_number}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(si.received_date)}</p>
                              </div>
                              <Badge variant="success">
                                {si.stock_in_items?.reduce(
                                  (sum: number, item: any) => sum + (item.qty_received || 0),
                                  0,
                                )}{" "}
                                {language === "en" ? "items received" : "item diterima"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="py-2 px-4">
                            <div className="text-xs space-y-1">
                              {si.stock_in_items?.map((item: any, idx: number) => (
                                <div key={item.id || idx} className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    {item.product?.name || "-"} (Batch: {item.batch_no || "-"})
                                  </span>
                                  <span className="font-medium">{item.qty_received}</span>
                                </div>
                              ))}
                            </div>
                            {si.notes && (
                              <p className="text-xs text-muted-foreground mt-2 italic">
                                {language === "en" ? "Notes" : "Catatan"}: {si.notes}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              {language === "en" ? "Close" : "Tutup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={isPdfPreviewOpen} onOpenChange={setIsPdfPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>{language === "en" ? "PDF Preview" : "Preview PDF"}</DialogTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={isDownloadingPdf}>
                  {isDownloadingPdf ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {language === "en" ? "Download" : "Unduh"}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" />
                  {language === "en" ? "Print" : "Cetak"}
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="bg-white rounded border p-4">
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(printRef.current?.innerHTML || ""),
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Content (SalesOrder-like Template) */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedOrder && (
            <div style={{ fontFamily: "Inter, Arial, sans-serif", fontSize: "12px", color: "#111" }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "14px",
                  borderBottom: "2px solid #16a34a",
                  paddingBottom: "12px",
                }}
              >
                <div>
                  <img src="/logo-kemika.png" alt="Kemika" style={{ height: "42px", objectFit: "contain" }} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: "16px", color: "#16a34a", margin: 0 }}>PLAN ORDER</div>
                  <div style={{ fontSize: "12px", marginTop: "4px" }}>
                    <div>
                      <span style={{ color: "#6b7280" }}>No:</span> <b>{selectedOrder.plan_number}</b>
                    </div>
                    <div>
                      <span style={{ color: "#6b7280" }}>{language === "en" ? "Date" : "Tanggal"}:</span>{" "}
                      <b>{formatDate(selectedOrder.plan_date)}</b>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
                  <div style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>Supplier</div>
                  <div style={{ fontWeight: 700, marginTop: "4px" }}>{selectedOrder.supplier?.name || "-"}</div>
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>
                      {language === "en" ? "Expected Delivery" : "Estimasi Pengiriman"}
                    </div>
                    <div style={{ fontWeight: 600, marginTop: "4px" }}>
                      {selectedOrder.expected_delivery_date ? formatDate(selectedOrder.expected_delivery_date) : "-"}
                    </div>
                  </div>
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
                  <div style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>
                    {language === "en" ? "Status" : "Status"}
                  </div>
                  <div style={{ fontWeight: 700, marginTop: "4px" }}>
                    {language === "en"
                      ? statusConfig[selectedOrder.status]?.label
                      : statusConfig[selectedOrder.status]?.labelId}
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>
                      {language === "en" ? "Notes" : "Catatan"}
                    </div>
                    <div style={{ marginTop: "4px" }}>{selectedOrder.notes || "-"}</div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
                <thead>
                  <tr>
                    <th
                      style={{ background: "#16a34a", color: "#fff", padding: "8px", textAlign: "left", width: "40px" }}
                    >
                      #
                    </th>
                    <th style={{ background: "#16a34a", color: "#fff", padding: "8px", textAlign: "left" }}>
                      {language === "en" ? "Product" : "Nama Barang"}
                    </th>
                    <th
                      style={{ background: "#16a34a", color: "#fff", padding: "8px", textAlign: "left", width: "90px" }}
                    >
                      SKU
                    </th>
                    <th
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        padding: "8px",
                        textAlign: "left",
                        width: "110px",
                      }}
                    >
                      {language === "en" ? "Category" : "Kategori"}
                    </th>
                    <th
                      style={{ background: "#16a34a", color: "#fff", padding: "8px", textAlign: "left", width: "80px" }}
                    >
                      {language === "en" ? "Unit" : "Satuan"}
                    </th>
                    <th
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        padding: "8px",
                        textAlign: "center",
                        width: "60px",
                      }}
                    >
                      Qty
                    </th>
                    <th
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        padding: "8px",
                        textAlign: "right",
                        width: "110px",
                      }}
                    >
                      {language === "en" ? "Price" : "Harga"}
                    </th>
                    <th
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        padding: "8px",
                        textAlign: "right",
                        width: "120px",
                      }}
                    >
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderItems.map((item: any, idx: number) => {
                    const qty = safeNumber(item.planned_qty);
                    const price = safeNumber(item.unit_price);
                    const lineSubtotal = safeNumber(item.subtotal) || price * qty;
                    return (
                      <tr key={item.id}>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px" }}>{idx + 1}</td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px" }}>{item.product?.name || "-"}</td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px" }}>{item.product?.sku || "-"}</td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px" }}>
                          {item.product?.category?.name || "-"}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px" }}>
                          {item.product?.unit?.name || "-"}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px", textAlign: "center" }}>{qty}</td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px", textAlign: "right" }}>
                          {formatCurrency(price)}
                        </td>
                        <td style={{ border: "1px solid #e5e7eb", padding: "8px", textAlign: "right" }}>
                          {formatCurrency(lineSubtotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals */}
              {(() => {
                const subtotalPrint = safeNumber(selectedOrder.total_amount);
                const discountPrint = safeNumber(selectedOrder.discount);
                const afterDiscount = subtotalPrint - discountPrint;
                const taxPrint = (afterDiscount * safeNumber(selectedOrder.tax_rate)) / 100;
                const shipPrint = safeNumber(selectedOrder.shipping_cost);
                const grandPrint = safeNumber(selectedOrder.grand_total);

                return (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}>
                    <div style={{ width: "340px", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ color: "#6b7280" }}>Subtotal</span>
                        <b>{formatCurrency(subtotalPrint)}</b>
                      </div>

                      {discountPrint > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ color: "#6b7280" }}>Discount</span>
                          <b>-{formatCurrency(discountPrint)}</b>
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ color: "#6b7280" }}>Tax ({safeNumber(selectedOrder.tax_rate)}%)</span>
                        <b>{formatCurrency(taxPrint)}</b>
                      </div>

                      {shipPrint > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ color: "#6b7280" }}>{language === "en" ? "Shipping" : "Ongkir"}</span>
                          <b>{formatCurrency(shipPrint)}</b>
                        </div>
                      )}

                      <div
                        style={{
                          borderTop: "1px solid #e5e7eb",
                          marginTop: "10px",
                          paddingTop: "10px",
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "14px",
                        }}
                      >
                        <span style={{ fontWeight: 800 }}>Grand Total</span>
                        <span style={{ fontWeight: 900, color: "#16a34a" }}>{formatCurrency(grandPrint)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Signatures */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "10px" }}>
                {[
                  language === "en" ? "Created By" : "Dibuat oleh",
                  language === "en" ? "Approved By" : "Disetujui oleh",
                  language === "en" ? "Received By" : "Diterima oleh",
                ].map((title) => (
                  <div
                    key={title}
                    style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px", height: "90px" }}
                  >
                    <div style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase" }}>{title}</div>
                    <div style={{ height: "50px" }} />
                    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "6px", fontSize: "11px", color: "#111" }}>
                      ______________________
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer timestamp */}
              <div style={{ marginTop: "10px", fontSize: "10px", color: "#6b7280", textAlign: "right" }}>
                Printed: {new Date().toLocaleString("id-ID")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document Viewer Dialog */}
      <Dialog open={isDocumentViewerOpen} onOpenChange={setIsDocumentViewerOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0">
          <DialogHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle>{language === "en" ? "View Document" : "Lihat Dokumen"}</DialogTitle>
              <div className="flex gap-2">
                {documentViewerUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (documentViewerUrl) {
                        const link = document.createElement("a");
                        link.href = documentViewerUrl;
                        link.download = "document";
                        link.target = "_blank";
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {language === "en" ? "Download" : "Unduh"}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          <div className="w-full h-[75vh] border-t">
            {documentViewerUrl ? (
              <iframe src={documentViewerUrl} className="w-full h-full" title="Document Viewer" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                {language === "en" ? "No document to display" : "Tidak ada dokumen untuk ditampilkan"}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
