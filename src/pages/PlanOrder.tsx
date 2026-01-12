import React, { useState, useRef, useMemo } from "react";
import { securePrint, printStyles } from "@/lib/printUtils";
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
  Package,// PlanOrder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";

import html2pdf from "html2pdf.js";
import DOMPurify from "dompurify";

import { securePrint, printStyles } from "@/lib/printUtils";
import { usePermissions } from "@/hooks/usePermissions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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

/**
 * ✅ Requested additions:
 * - PDF/Print layout like Sales Order: Preview / Download / Print / View Document
 * - Delivery To is LOCKED (warehouse address)
 * - Supplier name/contact/phone/payment terms pulled from supplier master data
 * - Add Reference No (manual input) -> saved to plan_order_headers.reference_no (nullable)
 * - Footnote style like template (shipping rules + NPWP) and remove PT Kemika footer
 * - Signature conditional:
 *    - If NOT approved => show empty signature boxes
 *    - If approved => hide empty boxes and show approver signature block automatically
 */

interface OrderItemUI {
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

// LOCKED Delivery To (Warehouse)
const DELIVERY_TO = {
  name: "WAREHOUSE KEMIKA",
  address: "Jl. HOS Cokroaminoto No. 32 G\nLarangan Utara, Kota Tangerang 15154",
  pic: "Bapak Sunarso",
  phone: "+62 856-1007-4714",
  currency: "IDR",
};

// Helper
function safeNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  return Number.isFinite(v) ? v : fallback;
}
function clampNumber(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
function formatDateID(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}
function formatDateTimeID(d: Date) {
  const date = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export default function PlanOrder() {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const { planOrders, loading, refetch } = usePlanOrders();
  const { suppliers } = useSuppliers();
  const { products } = useProducts();
  const { allowAdminApprove } = useSettings();

  // RBAC Permissions
  const { canCreate, canEdit, canDelete, canCancel, canApproveOrder } = usePermissions();
  const canApprove = canApproveOrder("plan_order");

  // List filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");

  // Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<PlanOrderHeader | null>(null);
  const { items: selectedOrderItems, loading: itemsLoading } = usePlanOrderItems(selectedOrder?.id || null);

  // Edit / Form states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [planNumber, setPlanNumber] = useState("");
  const [planDate, setPlanDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [referenceNo, setReferenceNo] = useState(""); // ✅ manual input for printout & saving
  const [notes, setNotes] = useState("");
  const [poDocumentUrl, setPoDocumentUrl] = useState("");
  const [poDocumentKey, setPoDocumentKey] = useState("");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("11");
  const [shippingCost, setShippingCost] = useState("0");
  const [orderItems, setOrderItems] = useState<OrderItemUI[]>([]);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);

  // Document viewer
  const [isOpeningPoDoc, setIsOpeningPoDoc] = useState(false);
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null);
  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);

  // PDF preview & download (like Sales Order)
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Stock In history
  const [stockInHistory, setStockInHistory] = useState<any[]>([]);
  const [stockInHistoryLoading, setStockInHistoryLoading] = useState(false);

  // Approver signature (auto)
  const [approvedSignatureUrl, setApprovedSignatureUrl] = useState("");
  const [approvedName, setApprovedName] = useState("");
  const [approvedAtText, setApprovedAtText] = useState("");

  // Selected supplier (for payment terms + contact)
  const selectedSupplier = useMemo(() => {
    return suppliers.find((s: any) => s.id === supplierId) || null;
  }, [suppliers, supplierId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(
      safeNumber(value, 0)
    );
  };

  const calculateTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + safeNumber(item.unit_price, 0) * safeNumber(item.planned_qty, 0), 0);
    const discountValue = clampNumber(safeNumber(discount, 0), 0, subtotal);
    const afterDiscount = subtotal - discountValue;
    const taxValue = afterDiscount * (clampNumber(safeNumber(taxRate, 0), 0, 100) / 100);
    const shippingValue = clampNumber(safeNumber(shippingCost, 0), 0, 1_000_000_000_000);
    const grandTotal = afterDiscount + taxValue + shippingValue;
    return { subtotal, discountValue, taxValue, shippingValue, grandTotal };
  };

  const { subtotal, discountValue, taxValue, shippingValue, grandTotal } = calculateTotals();

  // Filter list
  const filteredOrders = useMemo(() => {
    return planOrders.filter((order) => {
      const matchesSearch =
        order.plan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.supplier?.name || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const od = new Date(order.plan_date);
      const matchesDateFrom = !dateFrom || od >= new Date(dateFrom);
      const matchesDateTo = !dateTo || od <= new Date(dateTo);

      const activeStatuses = ["draft", "approved", "partially_received"];
      const archivedStatuses = ["received", "cancelled"];
      const matchesViewMode =
        viewMode === "active" ? activeStatuses.includes(order.status) : archivedStatuses.includes(order.status);

      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesViewMode;
    });
  }, [planOrders, searchQuery, statusFilter, dateFrom, dateTo, viewMode]);

  const hasActiveFilters = statusFilter !== "all" || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  // ===== Signature auto fetch when selectedOrder changes =====
  useEffect(() => {
    const run = async () => {
      if (!selectedOrder) return;

      const isApproved = selectedOrder.status === "approved";
      const approverId = (selectedOrder as any)?.approved_by;
      const approvedAt = (selectedOrder as any)?.approved_at;

      if (!isApproved || !approverId) {
        setApprovedSignatureUrl("");
        setApprovedName("");
        setApprovedAtText("");
        return;
      }

      setApprovedAtText(approvedAt ? formatDateID(approvedAt) : "");

      try {
        // Assumption: signatures stored in profiles table (full_name, signature_url)
        const { data, error } = await supabase
          .from("profiles")
          .select("full_name, signature_url")
          .eq("id", approverId)
          .single();

        if (error) throw error;

        setApprovedName((data as any)?.full_name || "");
        setApprovedSignatureUrl((data as any)?.signature_url || "");
      } catch (e) {
        console.error("Failed to fetch approver signature", e);
        setApprovedName("");
        setApprovedSignatureUrl("");
      }
    };

    run();
  }, [selectedOrder?.id, selectedOrder?.status, (selectedOrder as any)?.approved_by]);

  // ===== View Document (signed url) =====
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

      const fileKey = (data as any)?.[0]?.file_key as string | undefined;
      const fallbackUrl = (data as any)?.[0]?.url || order.po_document_url || "";

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

  // ===== PDF Actions =====
  const handlePrintPDF = () => {
    if (!selectedOrder || !printRef.current) return;
    securePrint({
      title: `Plan Order - ${selectedOrder.plan_number}`,
      styles: printStyles.planOrder,
      content: printRef.current.innerHTML,
    });
  };

  const handleDownloadPDF = async () => {
    if (!selectedOrder || !printRef.current) return;
    setIsDownloadingPdf(true);
    try {
      const element = printRef.current;

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `PlanOrder_${selectedOrder.plan_number}.pdf`,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
      };

      await html2pdf().set(opt).from(element).save();
      toast.success(language === "en" ? "PDF downloaded successfully" : "PDF berhasil diunduh");
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to download PDF" : "Gagal mengunduh PDF");
    }
    setIsDownloadingPdf(false);
  };

  // ===== Generate Plan Number =====
  const generatePlanNumber = async () => {
    setIsGeneratingNumber(true);
    const number = await generateUniquePlanOrderNumber();
    setPlanNumber(number);
    setIsGeneratingNumber(false);
  };

  // ===== Reset Form =====
  const resetForm = () => {
    setPlanNumber("");
    setPlanDate(new Date().toISOString().split("T")[0]);
    setSupplierId("");
    setExpectedDelivery("");
    setReferenceNo("");
    setNotes("");
    setPoDocumentUrl("");
    setPoDocumentKey("");
    setDiscount("0");
    setTaxRate("11");
    setShippingCost("0");
    setOrderItems([]);
  };

  // ===== Line Items =====
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

  const handleItemChange = (id: string, field: keyof OrderItemUI, value: string | number) => {
    setOrderItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        if (field === "product_id") {
          const product = products.find((p: any) => p.id === value);
          return {
            ...item,
            product_id: value as string,
            product,
            unit_price: safeNumber((product as any)?.purchase_price, 0),
          };
        }

        return { ...item, [field]: value };
      })
    );
  };

  // ===== File Upload =====
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadFile(file, "documents", "plan-orders");
      if (result) {
        setPoDocumentUrl(result.url);
        setPoDocumentKey(result.path);
        toast.success(language === "en" ? "Document uploaded successfully" : "Dokumen berhasil diupload");
      } else {
        toast.error(language === "en" ? "Failed to upload document" : "Gagal upload dokumen");
      }
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to upload document" : "Gagal upload dokumen");
    }
    setIsUploading(false);
  };

  // ===== Submit (Create) =====
  const handleSubmit = async () => {
    if (!planNumber || !supplierId || orderItems.length === 0) {
      toast.error(language === "en" ? "Please fill all required fields" : "Harap isi semua field wajib");
      return;
    }
    if (orderItems.some((item) => !item.product_id || safeNumber(item.planned_qty, 0) <= 0)) {
      toast.error(language === "en" ? "Please complete all line items" : "Harap lengkapi semua item");
      return;
    }
    if (!poDocumentUrl) {
      toast.error(language === "en" ? "Please upload PO document" : "Harap upload dokumen PO");
      return;
    }

    setIsSaving(true);

    const totals = calculateTotals();

    try {
      const result = await createPlanOrder(
        {
          plan_number: planNumber,
          plan_date: planDate,
          supplier_id: supplierId,
          expected_delivery_date: expectedDelivery || null,

          // ✅ NEW FIELD (nullable)
          reference_no: referenceNo || null,

          notes: notes || null,
          po_document_url: poDocumentUrl,
          status: "draft",
          total_amount: totals.subtotal,
          discount: totals.discountValue,
          tax_rate: clampNumber(safeNumber(taxRate, 0), 0, 100),
          shipping_cost: clampNumber(safeNumber(shippingCost, 0), 0, 1_000_000_000_000),
          grand_total: totals.grandTotal,
          created_by: user?.id || null,
          approved_by: null,
          approved_at: null,
        } as any,
        orderItems.map((item) => ({
          product_id: item.product_id,
          unit_price: safeNumber(item.unit_price, 0),
          planned_qty: safeNumber(item.planned_qty, 0),
          notes: item.notes || null,
        })) as any,
        poDocumentKey
          ? ({
              file_key: poDocumentKey,
              url: poDocumentUrl,
              mime_type: undefined,
              file_size: undefined,
            } as any)
          : undefined
      );

      if (result.success) {
        toast.success(language === "en" ? "Plan Order created successfully" : "Plan Order berhasil dibuat");
        setIsFormOpen(false);
        setIsEditMode(false);
        setEditingOrderId(null);
        resetForm();
        refetch();
      } else {
        toast.error(result.error || "Failed to create plan order");
      }
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to create plan order" : "Gagal membuat plan order");
    }

    setIsSaving(false);
  };

  // ===== Update =====
  const fetchOrderItemsForEdit = async (orderId: string) => {
    const { data, error } = await supabase
      .from("plan_order_items")
      .select(`*, product:products(id, name, sku, purchase_price, category:categories(name), unit:units(name))`)
      .eq("plan_order_id", orderId);

    if (!error && data) {
      setOrderItems(
        (data as any[]).map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          product: item.product,
          unit_price: safeNumber(item.unit_price, 0),
          planned_qty: safeNumber(item.planned_qty, 1),
          notes: item.notes || "",
        }))
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
    setDiscount(String(order.discount ?? 0));
    setTaxRate(String(order.tax_rate ?? 11));
    setShippingCost(String(order.shipping_cost ?? 0));

    // ✅ reference_no (fallback-safe)
    setReferenceNo(String((order as any)?.reference_no || ""));

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
    if (orderItems.some((item) => !item.product_id || safeNumber(item.planned_qty, 0) <= 0)) {
      toast.error(language === "en" ? "Please complete all line items" : "Harap lengkapi semua item");
      return;
    }

    setIsSaving(true);
    const totals = calculateTotals();

    try {
      const result = await updatePlanOrder(
        editingOrderId,
        {
          plan_number: planNumber,
          plan_date: planDate,
          supplier_id: supplierId,
          expected_delivery_date: expectedDelivery || null,

          // ✅ NEW FIELD
          reference_no: referenceNo || null,

          notes: notes || null,
          po_document_url: poDocumentUrl,
          total_amount: totals.subtotal,
          discount: totals.discountValue,
          tax_rate: clampNumber(safeNumber(taxRate, 0), 0, 100),
          shipping_cost: clampNumber(safeNumber(shippingCost, 0), 0, 1_000_000_000_000),
          grand_total: totals.grandTotal,
        } as any,
        orderItems.map((item) => ({
          product_id: item.product_id,
          unit_price: safeNumber(item.unit_price, 0),
          planned_qty: safeNumber(item.planned_qty, 0),
          notes: item.notes || null,
        })) as any
      );

      if (result.success) {
        if (poDocumentKey && poDocumentUrl) {
          await logPlanOrderUpload(editingOrderId, planNumber, { file_key: poDocumentKey, url: poDocumentUrl } as any);
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
    } catch (err) {
      console.error(err);
      toast.error(language === "en" ? "Failed to update plan order" : "Gagal update plan order");
    }

    setIsSaving(false);
  };

  // ===== Approve / Cancel / Delete =====
  const handleApprove = async () => {
    if (!selectedOrder) return;

    if (!canApprove) {
      toast.error(language === "en" ? "You do not have permission to approve orders" : "Anda tidak memiliki izin untuk menyetujui order");
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

  // ===== Detail View =====
  const handleViewDetail = async (order: PlanOrderHeader) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);

    // Fetch stock in history for this plan order
    setStockInHistoryLoading(true);
    try {
      const { data: stockIns, error } = await supabase
        .from("stock_in_headers")
        .select(`
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
        `)
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

  // =========================
  // FORM VIEW (Create/Edit)
  // =========================
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
              {isEditMode ? (language === "en" ? "Edit Plan Order" : "Edit Plan Order") : language === "en" ? "Create Plan Order" : "Buat Plan Order"}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode ? (language === "en" ? "Update existing plan order" : "Ubah plan order yang ada") : language === "en" ? "Create new procurement plan" : "Buat rencana pembelian baru"}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Form */}
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
                        {suppliers.map((sup: any) => (
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

                {/* ✅ NEW: Reference No + Payment term from supplier */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reference No</Label>
                    <Input
                      placeholder="e.g. EP-01KB4FX2Z06CD27PF1DD8Y9XVC"
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Term</Label>
                    <Input
                      value={(selectedSupplier?.terms_payment || "-").toString()}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                {/* PO Document */}
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
                        <Button variant="ghost" size="iconSm" onClick={() => { setPoDocumentUrl(""); setPoDocumentKey(""); }}>
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
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

            {/* Line Items */}
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
                      <TableHead>SKU</TableHead>
                      <TableHead>{language === "en" ? "Unit" : "Satuan"}</TableHead>
                      <TableHead className="text-right">{language === "en" ? "Unit Price" : "Harga"}</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {orderItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {language === "en" ? "No items added yet" : "Belum ada item"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderItems.map((item) => {
                        const p = products.find((x: any) => x.id === item.product_id) as any;
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Select value={item.product_id} onValueChange={(value) => handleItemChange(item.id, "product_id", value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder={language === "en" ? "Select product" : "Pilih produk"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((pp: any) => (
                                    <SelectItem key={pp.id} value={pp.id}>
                                      {pp.name} {pp.sku && `(${pp.sku})`}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>

                            <TableCell>{p?.sku || "-"}</TableCell>
                            <TableCell>{p?.unit?.name || "-"}</TableCell>

                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-32 text-right ml-auto"
                                value={item.unit_price}
                                onChange={(e) => handleItemChange(item.id, "unit_price", safeNumber(e.target.value, 0))}
                              />
                            </TableCell>

                            <TableCell className="text-center">
                              <Input
                                type="number"
                                className="w-20 text-center mx-auto"
                                value={item.planned_qty}
                                min={1}
                                onChange={(e) => handleItemChange(item.id, "planned_qty", safeNumber(e.target.value, 1))}
                              />
                            </TableCell>

                            <TableCell className="text-right">{formatCurrency(safeNumber(item.unit_price, 0) * safeNumber(item.planned_qty, 0))}</TableCell>

                            <TableCell>
                              <Button variant="ghost" size="iconSm" onClick={() => handleRemoveItem(item.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
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
                    <Input type="number" className="w-32 text-right" value={discount} min={0} onChange={(e) => setDiscount(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Tax (%)</Label>
                    <Input type="number" className="w-32 text-right" value={taxRate} min={0} onChange={(e) => setTaxRate(e.target.value)} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax Amount</span>
                    <span>{formatCurrency(taxValue)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">{language === "en" ? "Shipping" : "Ongkir"}</Label>
                    <Input type="number" className="w-32 text-right" value={shippingCost} min={0} onChange={(e) => setShippingCost(e.target.value)} />
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
                {isEditMode ? (language === "en" ? "Update Order" : "Update Order") : language === "en" ? "Save as Draft" : "Simpan Draft"}
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

  // =========================
  // LIST VIEW
  // =========================
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t("menu.planOrder")}</h1>
          <p className="text-muted-foreground">
            {t("menu.planOrderSub")} - {language === "en" ? "Manage procurement plans" : "Kelola rencana pembelian"}
          </p>
        </div>

        {canCreate("plan_order") && (
          <Button
            onClick={() => {
              generatePlanNumber();
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            {language === "en" ? "Create Plan Order" : "Buat Plan Order"}
          </Button>
        )}
      </div>

      {/* Tabs */}
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
                placeholder={language === "en" ? "Search by PO number or supplier..." : "Cari berdasarkan nomor PO atau supplier..."}
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
                <SelectItem value="partially_received">{language === "en" ? "Partially Received" : "Diterima Sebagian"}</SelectItem>
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

      {/* Table */}
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
                    const status = statusConfig[order.status] || statusConfig.draft;

                    // RBAC + status based
                    const showApprove = order.status === "draft" && canApprove;
                    const showEdit = order.status === "draft" && canEdit("plan_order");
                    const showDelete = order.status === "draft" && canDelete("plan_order");
                    const showCancel = (order.status === "draft" || order.status === "approved") && canCancel("plan_order");

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.plan_number}</TableCell>
                        <TableCell>{formatDateID(order.plan_date)}</TableCell>
                        <TableCell>{order.supplier?.name || "-"}</TableCell>
                        <TableCell>{order.expected_delivery_date ? formatDateID(order.expected_delivery_date) : "-"}</TableCell>
                        <TableCell className="text-right">{formatCurrency(safeNumber(order.grand_total, 0))}</TableCell>
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
            <AlertDialogTitle>{language === "en" ? "Cancel Plan Order" : "Batalkan Plan Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "en"
                ? `Are you sure you want to cancel "${selectedOrder?.plan_number}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin membatalkan "${selectedOrder?.plan_number}"? Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={isCancelling} className="bg-destructive hover:bg-destructive/90">
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
                ? `Are you sure you want to delete "${selectedOrder?.plan_number}"?`
                : `Apakah Anda yakin ingin menghapus "${selectedOrder?.plan_number}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
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
              <DialogTitle>{language === "en" ? "Plan Order Details" : "Detail Plan Order"}</DialogTitle>

              <div className="flex gap-2">
                {selectedOrder?.po_document_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedOrder && handleViewPoDocument(selectedOrder)}
                    disabled={isOpeningPoDoc}
                  >
                    {isOpeningPoDoc ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                    {language === "en" ? "View Document" : "Lihat Dokumen"}
                  </Button>
                )}

                <Button variant="outline" size="sm" onClick={() => setIsPdfPreviewOpen(true)} disabled={itemsLoading}>
                  <Eye className="w-4 h-4 mr-2" />
                  {language === "en" ? "Preview" : "Preview"}
                </Button>

                <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={itemsLoading || isDownloadingPdf}>
                  {isDownloadingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  {language === "en" ? "Download" : "Unduh"}
                </Button>

                <Button variant="outline" size="sm" onClick={handlePrintPDF} disabled={itemsLoading}>
                  <Printer className="w-4 h-4 mr-2" />
                  {language === "en" ? "Print" : "Cetak"}
                </Button>
              </div>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Header Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Plan Number" : "Nomor Plan"}</p>
                  <p className="font-medium">{selectedOrder.plan_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Date" : "Tanggal"}</p>
                  <p className="font-medium">{formatDateID(selectedOrder.plan_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{selectedOrder.supplier?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Expected Delivery" : "Estimasi Pengiriman"}</p>
                  <p className="font-medium">{selectedOrder.expected_delivery_date ? formatDateID(selectedOrder.expected_delivery_date) : "-"}</p>
                </div>

                {/* ✅ Reference No (from DB if exists) */}
                <div>
                  <p className="text-sm text-muted-foreground">Reference No</p>
                  <p className="font-medium">{String((selectedOrder as any)?.reference_no || "-")}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                  <Badge variant={statusConfig[selectedOrder.status]?.variant || "draft"}>
                    {language === "en" ? statusConfig[selectedOrder.status]?.label : statusConfig[selectedOrder.status]?.labelId}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Grand Total</p>
                  <p className="font-medium text-primary">{formatCurrency(safeNumber(selectedOrder.grand_total, 0))}</p>
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
                            <TableCell className="font-medium">{item.product?.name || "-"}</TableCell>
                            <TableCell>{item.product?.sku || "-"}</TableCell>
                            <TableCell>{item.product?.category?.name || "-"}</TableCell>
                            <TableCell>{item.product?.unit?.name || "-"}</TableCell>
                            <TableCell className="text-center">{safeNumber(item.planned_qty, 0)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(safeNumber(item.unit_price, 0))}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(safeNumber(item.subtotal, safeNumber(item.unit_price, 0) * safeNumber(item.planned_qty, 0)))}
                            </TableCell>
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
                  <span>{formatCurrency(safeNumber(selectedOrder.total_amount, 0))}</span>
                </div>
                {safeNumber(selectedOrder.discount, 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span>-{formatCurrency(safeNumber(selectedOrder.discount, 0))}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({safeNumber(selectedOrder.tax_rate, 0)}%)</span>
                  <span>
                    {formatCurrency(
                      (safeNumber(selectedOrder.total_amount, 0) - safeNumber(selectedOrder.discount, 0)) *
                        (safeNumber(selectedOrder.tax_rate, 0) / 100)
                    )}
                  </span>
                </div>
                {safeNumber(selectedOrder.shipping_cost, 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === "en" ? "Shipping" : "Ongkir"}</span>
                    <span>{formatCurrency(safeNumber(selectedOrder.shipping_cost, 0))}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Grand Total</span>
                  <span className="text-primary">{formatCurrency(safeNumber(selectedOrder.grand_total, 0))}</span>
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
                                <p className="text-xs text-muted-foreground">{formatDateID(si.received_date)}</p>
                              </div>
                              <Badge variant="success">
                                {si.stock_in_items?.reduce((sum: number, item: any) => sum + (safeNumber(item.qty_received, 0)), 0)}{" "}
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
                                  <span className="font-medium">{safeNumber(item.qty_received, 0)}</span>
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

      {/* =========================
          HIDDEN PRINT CONTENT
          "Contoh printout PDF" = this exact layout (copy template style)
         ========================= */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedOrder && (
            <div style={{ fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#111" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <img src="/logo-kemika.png" alt="Kemika" style={{ height: "42px", objectFit: "contain" }} />
                </div>

                <div style={{ textAlign: "right", minWidth: "320px" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, letterSpacing: 0.5 }}>PURCHASE ORDER</div>
                  <div style={{ height: "6px" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "120px 10px 1fr", gap: "6px" }}>
                    <div style={{ textAlign: "left" }}>PO Number</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{selectedOrder.plan_number}</div>

                    <div style={{ textAlign: "left" }}>PO Date</div>
                    <div>:</div>
                    <div style={{ fontWeight: 700 }}>{formatDateID(selectedOrder.plan_date)}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "10px", borderTop: "2px solid #111" }} />

              {/* Supplier + Delivery To blocks */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0px", marginTop: "10px" }}>
                {/* Supplier */}
                <div style={{ border: "1px solid #111", padding: "10px", minHeight: "120px" }}>
                  <div style={{ fontWeight: 700, fontSize: "11px", marginBottom: "8px" }}>SUPPLIER:</div>
                  <div style={{ fontWeight: 700, fontSize: "12px" }}>{selectedOrder.supplier?.name || "-"}</div>
                  <div style={{ marginTop: "6px", whiteSpace: "pre-line" }}>
                    {(selectedOrder.supplier as any)?.address || "-"}
                  </div>
                  <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "90px 10px 1fr", rowGap: "6px" }}>
                    <div>UP</div><div>:</div><div style={{ fontWeight: 700 }}>{(selectedOrder.supplier as any)?.pic || "-"}</div>
                    <div>TELP</div><div>:</div><div style={{ fontWeight: 700 }}>{(selectedOrder.supplier as any)?.phone || "-"}</div>
                    <div>PAY TERM</div><div>:</div><div style={{ fontWeight: 700, color: "#b91c1c" }}>{String((selectedOrder.supplier as any)?.terms_payment || "-").toUpperCase()}</div>
                  </div>
                </div>

                {/* Delivery To (LOCKED) */}
                <div style={{ border: "1px solid #111", borderLeft: "0px", padding: "10px", minHeight: "120px" }}>
                  <div style={{ fontWeight: 700, fontSize: "11px", marginBottom: "8px" }}>DELIVERY TO:</div>
                  <div style={{ fontWeight: 700, fontSize: "12px" }}>{DELIVERY_TO.name}</div>
                  <div style={{ marginTop: "6px", whiteSpace: "pre-line" }}>{DELIVERY_TO.address}</div>
                  <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "90px 10px 1fr", rowGap: "6px" }}>
                    <div>ATTN</div><div>:</div><div style={{ fontWeight: 700 }}>{DELIVERY_TO.pic}</div>
                    <div>TELP</div><div>:</div><div style={{ fontWeight: 700 }}>{DELIVERY_TO.phone}</div>
                    <div>CURRENCY</div><div>:</div><div style={{ fontWeight: 700 }}>{DELIVERY_TO.currency}</div>
                  </div>
                </div>
              </div>

              {/* Reference / Delivery date row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0px" }}>
                <div style={{ border: "1px solid #111", borderTop: "0px", padding: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 10px 1fr", rowGap: "6px" }}>
                    <div>REFERENCE NO</div><div>:</div><div style={{ fontWeight: 700 }}>{String((selectedOrder as any)?.reference_no || "-")}</div>
                    <div>DELIVERY DATE</div><div>:</div><div style={{ fontWeight: 700 }}>{selectedOrder.expected_delivery_date ? formatDateID(selectedOrder.expected_delivery_date) : "-"}</div>
                  </div>
                </div>
                <div style={{ border: "1px solid #111", borderLeft: "0px", borderTop: "0px", padding: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 10px 1fr", rowGap: "6px" }}>
                    <div>STATUS</div><div>:</div><div style={{ fontWeight: 700 }}>{String(selectedOrder.status || "-").toUpperCase()}</div>
                    <div>PRINT</div><div>:</div><div style={{ fontWeight: 700 }}>{formatDateTimeID(new Date())}</div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ marginTop: "12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "2px solid #111" }}>
                  <thead>
                    <tr style={{ background: "#0b6b3a", color: "white" }}>
                      {["No", "Code", "Product Name", "Qty", "UOM", "Price @", "Disc%", "Amount"].map((h) => (
                        <th
                          key={h}
                          style={{
                            border: "1px solid #111",
                            padding: "8px",
                            fontSize: "11px",
                            textAlign: h === "Qty" ? "center" : h === "Price @" || h === "Amount" || h === "Disc%" ? "right" : "left",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {(selectedOrderItems || []).map((it: any, idx: number) => {
                      const qty = safeNumber(it.planned_qty, 0);
                      const price = safeNumber(it.unit_price, 0);
                      const amount = qty * price; // line amount (no line discount rule here)
                      return (
                        <tr key={it.id || idx}>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "center" }}>{idx + 1}</td>
                          <td style={{ border: "1px solid #111", padding: "8px" }}>{it.product?.sku || "-"}</td>
                          <td style={{ border: "1px solid #111", padding: "8px" }}>{it.product?.name || "-"}</td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "center" }}>{qty}</td>
                          <td style={{ border: "1px solid #111", padding: "8px" }}>{it.product?.unit?.name || "-"}</td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>{formatCurrency(price)}</td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>0%</td>
                          <td style={{ border: "1px solid #111", padding: "8px", textAlign: "right" }}>{formatCurrency(amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notes + Totals */}
              <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 300px", gap: "10px" }}>
                {/* Notes box */}
                <div style={{ border: "1px solid #111", padding: "10px", minHeight: "140px" }}>
                  <div style={{ fontWeight: 700, marginBottom: "6px" }}>NOTE:</div>
                  <div style={{ whiteSpace: "pre-line" }}>{selectedOrder.notes || "-"}</div>
                </div>

                {/* Totals box */}
                <div style={{ border: "1px solid #111", padding: "10px" }}>
                  {(() => {
                    const grossSubtotal = (selectedOrderItems || []).reduce((sum: number, it: any) => {
                      const qty = safeNumber(it.planned_qty, 0);
                      const price = safeNumber(it.unit_price, 0);
                      return sum + qty * price;
                    }, 0);

                    const headerDiscount = safeNumber(selectedOrder.discount, 0);
                    const netSubtotal = grossSubtotal - headerDiscount;
                    const taxRateLocal = safeNumber(selectedOrder.tax_rate, 0);
                    const tax = netSubtotal * (taxRateLocal / 100);
                    const ship = safeNumber(selectedOrder.shipping_cost, 0);
                    const gt = safeNumber(selectedOrder.grand_total, netSubtotal + tax + ship);

                    return (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Subtotal</span>
                          <b>{formatCurrency(grossSubtotal)}</b>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Discount</span>
                          <b>-{formatCurrency(headerDiscount)}</b>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Tax ({taxRateLocal}%)</span>
                          <b>{formatCurrency(tax)}</b>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span>Shipping</span>
                          <b>{formatCurrency(ship)}</b>
                        </div>

                        <div style={{ borderTop: "2px solid #111", marginTop: "8px", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "13px", fontWeight: 700 }}>Grand Total</span>
                          <span style={{ fontSize: "13px", fontWeight: 700 }}>{formatCurrency(gt)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Signature section: conditional */}
              <div style={{ marginTop: "14px" }}>
                {selectedOrder.status === "approved" ? (
                  // ✅ Approved: show automatic signature block, hide empty boxes
                  <div style={{ border: "1px solid #111", padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: "8px" }}>APPROVED BY:</div>
                        <div style={{ fontWeight: 700 }}>{approvedName || "Approver"}</div>
                        <div style={{ marginTop: "6px", fontSize: "10px" }}>Approved at: {approvedAtText || "-"}</div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        {approvedSignatureUrl ? (
                          <img
                            src={approvedSignatureUrl}
                            alt="Signature"
                            style={{ height: "70px", objectFit: "contain", border: "1px solid #ddd", padding: "6px" }}
                          />
                        ) : (
                          <div style={{ height: "70px", width: "200px", border: "1px dashed #999", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#666" }}>
                            Signature not set
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  // ✅ Not approved: show empty signature boxes
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0px" }}>
                    {[
                      { role: "Purchasing" },
                      { role: "Finance" },
                      { role: "Approve" },
                    ].map((box, i) => (
                      <div key={i} style={{ border: "1px solid #111", padding: "10px", minHeight: "120px" }}>
                        <div style={{ fontSize: "10px", marginBottom: "12px" }}>Date:</div>
                        <div style={{ fontSize: "10px", marginBottom: "70px" }}>{box.role}</div>
                        <div style={{ borderBottom: "1px solid #111", height: "1px" }} />
                        <div style={{ fontSize: "10px", marginTop: "6px", textAlign: "center" }}>(.................................)</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footnote area (template style) */}
              <div style={{ marginTop: "10px", border: "1px solid #111", padding: "10px", fontSize: "10px" }}>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>KETENTUAN PENGIRIMAN / SHIPPING NOTES:</div>
                <ol style={{ margin: 0, paddingLeft: "16px" }}>
                  <li>Barang yang diterima wajib sesuai PO (jenis, qty, batch/expired jika berlaku).</li>
                  <li>Wajib melampirkan Surat Jalan / Delivery Note saat pengiriman.</li>
                  <li>Jika terdapat perbedaan, mohon konfirmasi ke Purchasing sebelum bongkar.</li>
                  <li>Penagihan mohon cantumkan nomor PO dan Reference No.</li>
                </ol>

                <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>NPWP:</span> 02.345.678.9-012.000
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontWeight: 700 }}>Delivery To:</span> {DELIVERY_TO.name} (LOCKED)
                  </div>
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

          <div className="bg-white p-4 rounded border">
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(printRef.current?.innerHTML || "") }} />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsPdfPreviewOpen(false)}>
              {language === "en" ? "Close" : "Tutup"}
            </Button>

            <Button variant="outline" onClick={handleDownloadPDF} disabled={isDownloadingPdf}>
              {isDownloadingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {language === "en" ? "Download PDF" : "Unduh PDF"}
            </Button>

            <Button
              onClick={() => {
                if (!printRef.current || !selectedOrder) return;
                securePrint({
                  title: `Plan Order - ${selectedOrder.plan_number}`,
                  styles: printStyles.planOrder,
                  content: printRef.current.innerHTML,
                });
              }}
            >
              <Printer className="w-4 h-4 mr-2" />
              {language === "en" ? "Print" : "Cetak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                      const link = document.createElement("a");
                      link.href = documentViewerUrl;
                      link.download = "document";
                      link.target = "_blank";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
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

} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
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

  // RBAC Permissions
  const { canCreate, canEdit, canDelete, canCancel, canApproveOrder } = usePermissions();

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

  // Fetch items for selected order in detail view
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);

  // Stock In history for the selected order
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

  // Use RBAC hook for approve permission
  const canApprove = canApproveOrder("plan_order");

  // Check if order can be cancelled
  const canCancelOrder = (order: PlanOrderHeader, items: PlanOrderItem[]) => {
    if (order.status === "draft") return true;
    if (order.status === "approved") {
      const totalReceived = items.reduce((sum, item) => sum + (item.qty_received || 0), 0);
      return totalReceived === 0;
    }
    return false;
  };

  // Filter logic with status, date range, and view mode (active/archived)
  const filteredOrders = useMemo(() => {
    return planOrders.filter((order) => {
      const matchesSearch =
        order.plan_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || order.status === statusFilter;

      const orderDate = new Date(order.plan_date);
      const matchesDateFrom = !dateFrom || orderDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || orderDate <= new Date(dateTo);

      // View mode filter: active vs archived
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

  const handleExportPDF = () => {
    if (!selectedOrder || !printRef.current) return;

    securePrint({
      title: `Plan Order - ${selectedOrder.plan_number}`,
      styles: printStyles.planOrder,
      content: printRef.current.innerHTML,
    });
  };

  const calculateTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.unit_price * item.planned_qty, 0);
    const discountValue = parseFloat(discount) || 0;
    const afterDiscount = subtotal - discountValue;
    const taxValue = (afterDiscount * (parseFloat(taxRate) || 0)) / 100;
    const shippingValue = parseFloat(shippingCost) || 0;
    const grandTotal = afterDiscount + taxValue + shippingValue;

    return { subtotal, discountValue, taxValue, shippingValue, grandTotal };
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
        setIsOpeningPoDoc(false);
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

        return { ...item, [field]: value };
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

    if (orderItems.some((item) => !item.product_id || item.planned_qty <= 0)) {
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
        tax_rate: parseFloat(taxRate) || 0,
        shipping_cost: parseFloat(shippingCost) || 0,
        grand_total: grandTotal,
        created_by: user?.id || null,
        approved_by: null,
        approved_at: null,
      },
      orderItems.map((item) => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        planned_qty: item.planned_qty,
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

  const handleViewDetail = async (order: PlanOrderHeader) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);

    // Fetch stock in history for this plan order
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

  const fetchOrderItemsForEdit = async (orderId: string) => {
    const { data, error } = await supabase
      .from("plan_order_items")
      .select(`*, product:products(id, name, sku, purchase_price)`)
      .eq("plan_order_id", orderId);

    if (!error && data) {
      setOrderItems(
        data.map((item) => ({
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

  const handleUpdate = async () => {
    if (!editingOrderId || !planNumber || !supplierId || orderItems.length === 0) {
      toast.error(language === "en" ? "Please fill all required fields" : "Harap isi semua field wajib");
      return;
    }

    if (orderItems.some((item) => !item.product_id || item.planned_qty <= 0)) {
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
        tax_rate: parseFloat(taxRate) || 0,
        shipping_cost: parseFloat(shippingCost) || 0,
        grand_total: grandTotal,
      },
      orderItems.map((item) => ({
        product_id: item.product_id,
        unit_price: item.unit_price,
        planned_qty: item.planned_qty,
        notes: item.notes,
      })),
    );

    if (result.success) {
      // Log attachment if new one was uploaded
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

  const { subtotal, discountValue, taxValue, shippingValue, grandTotal } = calculateTotals();

  // Form View
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
          {/* Main Form */}
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
                            // Extract filename from URL (before query params)
                            const urlPath = poDocumentUrl.split("?")[0];
                            const segments = urlPath.split("/");
                            const filename = segments[segments.length - 1];
                            // Remove timestamp prefix if present (format: timestamp-filename.ext)
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

            {/* Line Items */}
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
                            {formatCurrency(item.unit_price * item.planned_qty)}
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

          {/* Summary */}
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

  // List View
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t("menu.planOrder")}</h1>
          <p className="text-muted-foreground">
            {t("menu.planOrderSub")} - {language === "en" ? "Manage procurement plans" : "Kelola rencana pembelian"}
          </p>
        </div>
        {canCreate("plan_order") && (
          <Button
            onClick={() => {
              generatePlanNumber();
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            {language === "en" ? "Create Plan Order" : "Buat Plan Order"}
          </Button>
        )}
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
                    ? "Search by PO number or supplier..."
                    : "Cari berdasarkan nomor PO atau supplier..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>

            {/* Status Filter */}
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

            {/* Date Range Filter */}
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
                    // RBAC: Check permissions AND status
                    const showApprove = order.status === "draft" && canApprove;
                    const showCancel =
                      (order.status === "draft" || order.status === "approved") && canCancel("plan_order");
                    const showEdit = order.status === "draft" && canEdit("plan_order");
                    const showDelete = order.status === "draft" && canDelete("plan_order");

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

      {/* View Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{language === "en" ? "Plan Order Details" : "Detail Plan Order"}</DialogTitle>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={itemsLoading}>
                <Printer className="w-4 h-4 mr-2" />
                {language === "en" ? "Print / PDF" : "Cetak / PDF"}
              </Button>
            </div>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Header Info */}
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
                {selectedOrder.po_document_url && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">{language === "en" ? "PO Document" : "Dokumen PO"}</p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => handleViewPoDocument(selectedOrder)}
                      disabled={isOpeningPoDoc}
                    >
                      {isOpeningPoDoc ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {language === "en" ? "Opening..." : "Membuka..."}
                        </>
                      ) : (
                        <>{language === "en" ? "View Document" : "Lihat Dokumen"}</>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {selectedOrder.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{language === "en" ? "Notes" : "Catatan"}</p>
                  <p className="text-sm">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Order Items with SKU, Category, Unit */}
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
                        selectedOrderItems.map((item, index) => (
                          <TableRow key={item.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-medium">{item.product?.name}</TableCell>
                            <TableCell>{item.product?.sku || "-"}</TableCell>
                            <TableCell>{item.product?.category?.name || "-"}</TableCell>
                            <TableCell>{item.product?.unit?.name || "-"}</TableCell>
                            <TableCell className="text-center">{item.planned_qty}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.subtotal || item.unit_price * item.planned_qty)}
                            </TableCell>
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
                  <span>
                    {formatCurrency(
                      ((selectedOrder.total_amount - selectedOrder.discount) * selectedOrder.tax_rate) / 100,
                    )}
                  </span>
                </div>
                {selectedOrder.shipping_cost > 0 && (
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

      {/* Hidden Print Content */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedOrder && (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "20px",
                  borderBottom: "2px solid #16a34a",
                  paddingBottom: "15px",
                }}
              >
                <div>
                  <img src="/logo-kemika.png" alt="Kemika" style={{ height: "42px", objectFit: "contain" }} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontWeight: "bold", fontSize: "16px", color: "#16a34a", margin: 0 }}>PLAN ORDER</p>
                  <p style={{ fontSize: "12px", margin: "4px 0 0 0" }}>{selectedOrder.plan_number}</p>
                </div>
              </div>

              <div className="info-grid">
                <div className="info-item">
                  <label>Nomor Plan</label>
                  <p>{selectedOrder.plan_number}</p>
                </div>
                <div className="info-item">
                  <label>Tanggal</label>
                  <p>{formatDate(selectedOrder.plan_date)}</p>
                </div>
                <div className="info-item">
                  <label>Supplier</label>
                  <p>{selectedOrder.supplier?.name}</p>
                </div>
                <div className="info-item">
                  <label>Estimasi Pengiriman</label>
                  <p>{selectedOrder.expected_delivery_date ? formatDate(selectedOrder.expected_delivery_date) : "-"}</p>
                </div>
                <div className="info-item">
                  <label>Status</label>
                  <span className={`badge badge-${statusConfig[selectedOrder.status]?.variant}`}>
                    {statusConfig[selectedOrder.status]?.labelId}
                  </span>
                </div>
              </div>

              {selectedOrder.notes && (
                <div style={{ marginBottom: "15px" }}>
                  <p style={{ fontSize: "10px", color: "#666", textTransform: "uppercase" }}>Catatan</p>
                  <p style={{ fontSize: "12px" }}>{selectedOrder.notes}</p>
                </div>
              )}

              <table>
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>#</th>
                    <th>Nama Barang</th>
                    <th>SKU</th>
                    <th>Kategori</th>
                    <th>Satuan</th>
                    <th className="text-center" style={{ width: "60px" }}>
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
                      <td>{index + 1}</td>
                      <td>{item.product?.name}</td>
                      <td>{item.product?.sku || "-"}</td>
                      <td>{item.product?.category?.name || "-"}</td>
                      <td>{item.product?.unit?.name || "-"}</td>
                      <td className="text-center">{item.planned_qty}</td>
                      <td className="text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right">
                        {formatCurrency(item.subtotal || item.unit_price * item.planned_qty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

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
                  <span>
                    {formatCurrency(
                      ((selectedOrder.total_amount - selectedOrder.discount) * selectedOrder.tax_rate) / 100,
                    )}
                  </span>
                </div>
                {selectedOrder.shipping_cost > 0 && (
                  <div className="summary-row">
                    <span>Ongkir</span>
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
                  <p style={{ fontSize: "10px", color: "#666" }}>Dibuat oleh</p>
                  <div className="signature">Staff Purchasing</div>
                </div>
                <div>
                  <p style={{ fontSize: "10px", color: "#666" }}>Disetujui oleh</p>
                  <div className="signature">Manager</div>
                </div>
                <div>
                  <p style={{ fontSize: "10px", color: "#666" }}>Diterima oleh</p>
                  <div className="signature">Supplier</div>
                </div>
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
