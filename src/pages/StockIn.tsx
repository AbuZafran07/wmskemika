import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Info, CheckCircle, AlertCircle, Package, Building2, Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/storage";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface PlanOrderHeader {
  id: string;
  plan_number: string;
  supplier: { id: string; name: string; code: string } | null;
  status: string;
}

interface PlanOrderItem {
  id: string;
  product_id: string;
  planned_qty: number;
  qty_received: number;
  qty_remaining: number;
  unit_price: number;
  product: {
    id: string;
    name: string;
    sku: string | null;
    category: { name: string } | null;
    unit: { name: string } | null;
  } | null;
}

interface StockInItem {
  plan_order_item_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  category: string;
  unit: string;
  qty_ordered: number;
  qty_remaining: number;
  qty_received: number;
  batch_no: string;
  expired_date: string; // yyyy-mm-dd or ''
}

export default function StockIn() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [planOrders, setPlanOrders] = useState<PlanOrderHeader[]>([]);
  const [selectedPlanOrderId, setSelectedPlanOrderId] = useState<string>("");
  const [selectedPlanOrder, setSelectedPlanOrder] = useState<PlanOrderHeader | null>(null);
  const [items, setItems] = useState<StockInItem[]>([]);
  const [loadingPlanOrders, setLoadingPlanOrders] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [stockInNumber, setStockInNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [deliveryNoteUrl, setDeliveryNoteUrl] = useState("");
  const [deliveryNoteFileName, setDeliveryNoteFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const fetchPlanOrders = useCallback(async () => {
    setLoadingPlanOrders(true);

    const { data, error } = await supabase
      .from("plan_order_headers")
      .select(
        `
        id, plan_number, status,
        supplier:suppliers(id, name, code)
      `,
      )
      .in("status", ["approved", "partially_received"])
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(language === "en" ? "Failed to load plan orders" : "Gagal memuat plan order");
      console.error(error);
    } else {
      setPlanOrders(data || []);
    }

    setLoadingPlanOrders(false);
  }, [language]);

  useEffect(() => {
    fetchPlanOrders();
    generateStockInNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPlanOrders]);

  useEffect(() => {
    if (!selectedPlanOrderId) {
      setItems([]);
      setSelectedPlanOrder(null);
      return;
    }

    const fetchItems = async () => {
      setLoadingItems(true);

      const po = planOrders.find((p) => p.id === selectedPlanOrderId);
      setSelectedPlanOrder(po || null);

      const { data, error } = await supabase
        .from("plan_order_items")
        .select(
          `
          id, product_id, planned_qty, qty_received, qty_remaining, unit_price,
          product:products(
            id, name, sku,
            category:categories(name),
            unit:units(name)
          )
        `,
        )
        .eq("plan_order_id", selectedPlanOrderId)
        .gt("qty_remaining", 0);

      if (error) {
        toast.error(language === "en" ? "Failed to load items" : "Gagal memuat item");
        console.error(error);
      } else {
        const stockInItems: StockInItem[] = (data || []).map((item: PlanOrderItem) => ({
          plan_order_item_id: item.id,
          product_id: item.product_id,
          product_name: item.product?.name || "",
          sku: item.product?.sku || "-",
          category: item.product?.category?.name || "-",
          unit: item.product?.unit?.name || "-",
          qty_ordered: item.planned_qty,
          qty_remaining: item.qty_remaining,
          qty_received: 0,
          batch_no: "",
          expired_date: "",
        }));
        setItems(stockInItems);
      }

      setLoadingItems(false);
    };

    fetchItems();
  }, [selectedPlanOrderId, planOrders, language]);

  const generateStockInNumber = async () => {
    const { data, error } = await supabase
      .from("stock_in_headers")
      .select("stock_in_number")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.warn("generateStockInNumber error:", error);
    }

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    let sequence = 1;
    if (data && data.length > 0) {
      const lastNumber = data[0].stock_in_number as string;
      const match = lastNumber.match(/SI-(\d{6})-(\d+)/);
      if (match) {
        const lastYearMonth = match[1];
        const currentYearMonth = `${year}${month}`;
        if (lastYearMonth === currentYearMonth) {
          sequence = parseInt(match[2], 10) + 1;
        }
      }
    }

    setStockInNumber(`SI-${year}${month}-${String(sequence).padStart(3, "0")}`);
  };

  const handleItemChange = (index: number, field: keyof StockInItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return { ...item, [field]: value };
      }),
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, "documents", "delivery-notes");

    if (result) {
      setDeliveryNoteUrl(result.url);
      setDeliveryNoteFileName(result.originalName);
      toast.success(language === "en" ? "File uploaded successfully" : "File berhasil diupload");
    } else {
      toast.error(language === "en" ? "Failed to upload file" : "Gagal upload file");
    }

    setIsUploading(false);
  };

  const handleClearDeliveryNote = () => {
    setDeliveryNoteUrl("");
    setDeliveryNoteFileName("");
  };

  /**
   * Find existing inventory batch safely.
   * Avoid maybeSingle() because it throws if duplicates exist.
   * Match on (product_id, batch_no, expired_date NULL/equals).
   */
  const findExistingBatch = async (productId: string, batchNo: string, expiredDate: string | null) => {
    let q = supabase
      .from("inventory_batches")
      .select("id, qty_on_hand, expired_date")
      .eq("product_id", productId)
      .eq("batch_no", batchNo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (expiredDate) q = q.eq("expired_date", expiredDate);
    else q = q.is("expired_date", null);

    const { data, error } = await q;
    if (error) throw error;

    return data && data.length > 0 ? data[0] : null;
  };

  const handleSave = async () => {
    if (!selectedPlanOrderId) {
      toast.error(language === "en" ? "Please select a Plan Order" : "Silakan pilih Plan Order");
      return;
    }

    // REQUIRED: delivery note must be uploaded (as per your business rule)
    if (!deliveryNoteUrl) {
      toast.error(language === "en" ? "Please upload Delivery Note" : "Harap upload Surat Jalan");
      return;
    }

    const validItems = items.filter((item) => (Number(item.qty_received) || 0) > 0);
    if (validItems.length === 0) {
      toast.error(
        language === "en" ? "Please enter at least one item quantity" : "Masukkan minimal satu kuantitas item",
      );
      return;
    }

    for (const item of validItems) {
      const batch = (item.batch_no || "").trim();
      if (!batch) {
        toast.error(
          language === "en"
            ? `Please enter batch number for ${item.product_name}`
            : `Masukkan nomor batch untuk ${item.product_name}`,
        );
        return;
      }
      if ((Number(item.qty_received) || 0) > (Number(item.qty_remaining) || 0)) {
        toast.error(
          language === "en"
            ? `Quantity received cannot exceed remaining for ${item.product_name}`
            : `Kuantitas diterima tidak boleh melebihi sisa untuk ${item.product_name}`,
        );
        return;
      }
    }

    setIsSaving(true);

    try {
      // 1) Create stock in header
      const { data: headerData, error: headerError } = await supabase
        .from("stock_in_headers")
        .insert({
          stock_in_number: stockInNumber,
          plan_order_id: selectedPlanOrderId,
          received_date: receivedDate,
          notes: notes || null,
          delivery_note_url: deliveryNoteUrl,
        })
        .select("id")
        .single();

      if (headerError) throw headerError;

      // 2) Create stock in items
      const stockInItemsPayload = validItems.map((item) => ({
        stock_in_id: headerData.id,
        plan_order_item_id: item.plan_order_item_id,
        product_id: item.product_id,
        qty_received: Number(item.qty_received) || 0,
        batch_no: item.batch_no.trim(),
        expired_date: item.expired_date ? item.expired_date : null,
      }));

      const { error: itemsError } = await supabase.from("stock_in_items").insert(stockInItemsPayload);
      if (itemsError) throw itemsError;

      // 3) Update inventory_batches + stock_transactions + plan_order_items
      for (const item of validItems) {
        const qty = Number(item.qty_received) || 0;
        const batchNo = item.batch_no.trim();
        const exp = item.expired_date ? item.expired_date : null;

        const existingBatch = await findExistingBatch(item.product_id, batchNo, exp);

        if (existingBatch) {
          const { error: batchUpdateError } = await supabase
            .from("inventory_batches")
            .update({
              qty_on_hand: (Number(existingBatch.qty_on_hand) || 0) + qty,
              // keep consistent (optional)
              expired_date: exp,
            })
            .eq("id", existingBatch.id);

          if (batchUpdateError) throw batchUpdateError;
        } else {
          const { error: batchInsertError } = await supabase.from("inventory_batches").insert({
            product_id: item.product_id,
            batch_no: batchNo,
            qty_on_hand: qty,
            expired_date: exp,
          });

          if (batchInsertError) throw batchInsertError;
        }

        // stock transaction
        const { error: txError } = await supabase.from("stock_transactions").insert({
          product_id: item.product_id,
          transaction_type: "in",
          quantity: qty,
          reference_type: "stock_in",
          reference_id: headerData.id,
          reference_number: stockInNumber,
          notes: `Received from ${selectedPlanOrder?.plan_number}`,
        });

        if (txError) throw txError;

        // Update plan_order_items safely using planned_qty from DB
        const { data: poItem, error: poItemError } = await supabase
          .from("plan_order_items")
          .select("qty_received, planned_qty")
          .eq("id", item.plan_order_item_id)
          .single();

        if (poItemError) throw poItemError;

        const orderedQty = Number(poItem?.planned_qty ?? item.qty_ordered) || 0;
        const prevReceived = Number(poItem?.qty_received ?? 0) || 0;
        const newQtyReceived = prevReceived + qty;
        const newQtyRemaining = Math.max(0, orderedQty - newQtyReceived);

        const { error: poUpdateError } = await supabase
          .from("plan_order_items")
          .update({
            qty_received: newQtyReceived,
            qty_remaining: newQtyRemaining,
          })
          .eq("id", item.plan_order_item_id);

        if (poUpdateError) throw poUpdateError;
      }

      // 4) Update plan_order_headers status -> received/partially_received
      const { data: remainingItems, error: remainingError } = await supabase
        .from("plan_order_items")
        .select("id")
        .eq("plan_order_id", selectedPlanOrderId)
        .gt("qty_remaining", 0);

      if (remainingError) throw remainingError;

      const newStatus = (remainingItems?.length || 0) === 0 ? "received" : "partially_received";
      const { error: statusError } = await supabase
        .from("plan_order_headers")
        .update({ status: newStatus })
        .eq("id", selectedPlanOrderId);

      if (statusError) throw statusError;

      // 5) Audit log (best-effort)
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const itemsSummary = validItems.map((it) => ({
        product_name: it.product_name,
        qty_received: Number(it.qty_received) || 0,
        batch_no: it.batch_no,
        expired_date: it.expired_date || null,
      }));

      const { error: auditErr } = await supabase.from("audit_logs").insert({
        action: "STOCK_IN_CREATE",
        module: "stock_in",
        ref_table: "stock_in_headers",
        ref_id: headerData.id,
        ref_no: stockInNumber,
        user_id: user?.id,
        user_email: user?.email,
        new_data: {
          stock_in_number: stockInNumber,
          plan_order_number: selectedPlanOrder?.plan_number,
          plan_order_id: selectedPlanOrderId,
          supplier: selectedPlanOrder?.supplier?.name,
          received_date: receivedDate,
          delivery_note_url: deliveryNoteUrl,
          items: itemsSummary,
          total_items: validItems.length,
          total_qty_received: validItems.reduce((sum, i) => sum + (Number(i.qty_received) || 0), 0),
        },
      });

      if (auditErr) console.warn("Audit log insert failed:", auditErr);

      toast.success(language === "en" ? "Stock In saved successfully" : "Stock In berhasil disimpan");

      // Refresh list so PO becomes "archived" (disappears from dropdown when status = received)
      await fetchPlanOrders();

      // Clear UI
      setSelectedPlanOrderId("");
      setSelectedPlanOrder(null);
      setItems([]);
      setNotes("");
      setDeliveryNoteUrl("");
      setDeliveryNoteFileName("");
      setReceivedDate(new Date().toISOString().split("T")[0]);
      await generateStockInNumber();
    } catch (error: any) {
      console.error(error);

      const msg =
        error?.message ||
        error?.error_description ||
        (language === "en" ? "Failed to save Stock In" : "Gagal menyimpan Stock In");

      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

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
              {t("menu.stockIn")} ({language === "en" ? "Inbound" : "Penerimaan"})
            </h1>
            <p className="text-muted-foreground text-sm">
              {language === "en"
                ? "Receive goods from approved Plan Orders"
                : "Terima barang dari Plan Order yang disetujui"}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchPlanOrders();
            generateStockInNumber();
            setSelectedPlanOrderId("");
          }}
        >
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
              {language === "en" ? "Step 1: Select Plan Order" : "Langkah 1: Pilih Plan Order"}
            </CardTitle>
          </div>
          <CardDescription>
            {language === "en"
              ? "Stock In MUST be created from an approved Plan Order. Only Plan Orders with remaining quantities will appear below."
              : "Stock In HARUS dibuat dari Plan Order yang sudah disetujui. Hanya Plan Order dengan sisa kuantitas yang akan muncul di bawah."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Plan Order *</Label>
            <Select value={selectedPlanOrderId} onValueChange={setSelectedPlanOrderId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingPlanOrders
                      ? "Loading..."
                      : language === "en"
                        ? "-- Select Plan Order --"
                        : "-- Silakan pilih Plan Order --"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {planOrders.map((po) => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.plan_number} - {po.supplier?.name}
                    <Badge variant={po.status === "approved" ? "approved" : "pending"} className="ml-2">
                      {po.status}
                    </Badge>
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
            <CardTitle className="text-base">{language === "en" ? "Inbound Header" : "Header Penerimaan"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>{language === "en" ? "Stock In Number" : "No. Stock In"} *</Label>
              <Input value={stockInNumber} disabled className="bg-muted font-mono" />
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Received Date" : "Tanggal Terima"} *</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Plan Order No." : "No. Plan Order"}</Label>
              <Input value={selectedPlanOrder?.plan_number || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input value={selectedPlanOrder?.supplier?.name || ""} disabled className="bg-muted" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label>{language === "en" ? "Delivery Note" : "Surat Jalan"} *</Label>
              <div className="flex gap-2">
                <Input
                  value={deliveryNoteFileName || ""}
                  disabled
                  placeholder={language === "en" ? "Upload delivery note" : "Upload surat jalan"}
                  className="bg-muted truncate"
                  title={deliveryNoteFileName || undefined}
                />
                <Button
                  variant="outline"
                  onClick={() => document.getElementById("delivery-note-input")?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
                {deliveryNoteUrl && (
                  <Button variant="outline" size="icon" onClick={handleClearDeliveryNote}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <input
                  id="delivery-note-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {deliveryNoteUrl ? (
                <p className="text-xs text-muted-foreground">
                  {language === "en" ? "Delivery note uploaded." : "Surat jalan sudah terupload."}
                </p>
              ) : (
                <p className="text-xs text-destructive">
                  {language === "en" ? "Delivery note is required." : "Surat jalan wajib diupload."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{language === "en" ? "Notes" : "Catatan"}</Label>
              <Textarea
                placeholder={language === "en" ? "Enter notes..." : "Masukkan catatan..."}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
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
            <CardTitle className="text-base">{language === "en" ? "Items to Receive" : "Item yang Diterima"}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingItems ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === "en" ? "PRODUCT" : "PRODUK"}</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>{language === "en" ? "CATEGORY" : "KATEGORI"}</TableHead>
                  <TableHead>{language === "en" ? "UNIT" : "SATUAN"}</TableHead>
                  <TableHead className="text-center">{language === "en" ? "QTY ORDERED" : "QTY PESAN"}</TableHead>
                  <TableHead className="text-center">{language === "en" ? "QTY REMAINING" : "QTY SISA"}</TableHead>
                  <TableHead className="text-center">{language === "en" ? "QTY RECEIVED" : "QTY TERIMA"} *</TableHead>
                  <TableHead>{language === "en" ? "BATCH NO" : "NO BATCH"} *</TableHead>
                  <TableHead>{language === "en" ? "EXPIRED DATE" : "TGL KADALUARSA"}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {!selectedPlanOrderId ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Package className="w-12 h-12 opacity-30" />
                        <p className="font-medium">
                          {language === "en" ? "Please select a Plan Order" : "Silakan pilih Plan Order"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {language === "en" ? "No items with remaining quantity" : "Tidak ada item dengan sisa kuantitas"}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
                    <TableRow key={item.plan_order_item_id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-center">{item.qty_ordered}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="pending">{item.qty_remaining}</Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={item.qty_remaining}
                          value={item.qty_received || ""}
                          onChange={(e) => handleItemChange(index, "qty_received", parseInt(e.target.value, 10) || 0)}
                          className="w-24 mx-auto text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="e.g., BTH001"
                          value={item.batch_no}
                          onChange={(e) => handleItemChange(index, "batch_no", e.target.value)}
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={item.expired_date}
                          onChange={(e) => handleItemChange(index, "expired_date", e.target.value)}
                          className="w-36"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-info/30 bg-info/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-info">{language === "en" ? "Partial Receiving" : "Penerimaan Sebagian"}</p>
              <p className="text-sm text-muted-foreground">
                {language === "en"
                  ? "Enter the quantity you're receiving now. You can receive the remaining quantity in a future Stock In."
                  : "Masukkan jumlah yang Anda terima sekarang. Anda dapat menerima sisa jumlah di Stock In berikutnya."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-success">{language === "en" ? "Full Receiving" : "Penerimaan Penuh"}</p>
              <p className="text-sm text-muted-foreground">
                {language === "en"
                  ? "When all items are fully received, the Plan Order will automatically be marked as RECEIVED."
                  : "Ketika semua item diterima penuh, Plan Order akan otomatis ditandai sebagai DITERIMA."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <AlertCircle className="w-4 h-4 mr-2" />
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={!selectedPlanOrderId || isSaving || isUploading}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <CheckCircle className="w-4 h-4 mr-2" />
          {language === "en" ? "Save Stock In" : "Simpan Stock In"}
        </Button>
      </div>
    </div>
  );
}
