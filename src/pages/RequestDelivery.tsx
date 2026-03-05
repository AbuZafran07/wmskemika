import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Package, Calendar, User, Building2, Truck, RefreshCw, Search, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import DeliveryCardDetail from "@/components/delivery/DeliveryCardDetail";

// Board columns definition
const BOARD_COLUMNS = [
  { id: "new_order", label: "New Orders", color: "bg-blue-600" },
  { id: "checking", label: "Checking...", color: "bg-yellow-600" },
  { id: "on_hold_delivery", label: "On Hold Delivery Order", color: "bg-orange-600" },
  { id: "approval_delivery", label: "Approval Delivery Order", color: "bg-purple-600" },
  { id: "pengiriman_senin", label: "Pengiriman Senin", color: "bg-emerald-600" },
  { id: "pengiriman_selasa", label: "Pengiriman Selasa", color: "bg-emerald-600" },
  { id: "pengiriman_rabu", label: "Pengiriman Rabu", color: "bg-emerald-600" },
  { id: "pengiriman_kamis", label: "Pengiriman Kamis", color: "bg-emerald-600" },
  { id: "pengiriman_jumat", label: "Pengiriman Jumat", color: "bg-emerald-600" },
  { id: "delivered", label: "Delivered", color: "bg-green-700" },
  { id: "delivered_sample", label: "Delivered Sample", color: "bg-teal-700" },
] as const;

type BoardStatus = typeof BOARD_COLUMNS[number]["id"];

interface DeliveryCard {
  id: string;
  sales_order_id: string;
  board_status: BoardStatus;
  notes: string | null;
  delivery_date_target: string | null;
  created_at: string;
  updated_at: string;
  sales_order_number: string;
  customer_name: string;
  customer_code: string;
  customer_po_number: string;
  allocation_type: string;
  project_instansi: string;
  sales_name: string;
  delivery_deadline: string;
  order_date: string;
  so_status: string;
  grand_total: number;
  ship_to_address: string | null;
  so_notes: string | null;
  items: { product_name: string; ordered_qty: number; qty_delivered: number }[];
}

export default function RequestDelivery() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [cards, setCards] = useState<DeliveryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailCard, setDetailCard] = useState<DeliveryCard | null>(null);
  const [moveDialogCard, setMoveDialogCard] = useState<DeliveryCard | null>(null);
  const [moveTarget, setMoveTarget] = useState<BoardStatus>("new_order");
  const [availableSOs, setAvailableSOs] = useState<any[]>([]);
  const [selectedSOId, setSelectedSOId] = useState<string>("");
  const [addNotes, setAddNotes] = useState("");
  const [soSearchQuery, setSoSearchQuery] = useState("");
  const [cardLabelsMap, setCardLabelsMap] = useState<Record<string, { name: string; color: string }[]>>({});
  
  const [draggedCard, setDraggedCard] = useState<DeliveryCard | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const canManage = user?.role && ['super_admin', 'admin', 'sales', 'warehouse'].includes(user.role);

  const fetchCards = useCallback(async () => {
    try {
      const { data: requests, error } = await supabase
        .from("delivery_requests")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      if (!requests || requests.length === 0) {
        setCards([]);
        setLoading(false);
        return;
      }

      const soIds = requests.map(r => r.sales_order_id);
      
      const { data: soHeaders } = await supabase
        .from("sales_order_headers")
        .select("*, customers!inner(name, code)")
        .in("id", soIds);

      const { data: soItems } = await supabase
        .from("sales_order_items")
        .select("*, products!inner(name)")
        .in("sales_order_id", soIds);

      const mappedCards: DeliveryCard[] = requests.map(req => {
        const so = soHeaders?.find(h => h.id === req.sales_order_id);
        const items = soItems?.filter(i => i.sales_order_id === req.sales_order_id) || [];
        
        return {
          id: req.id,
          sales_order_id: req.sales_order_id,
          board_status: req.board_status as BoardStatus,
          notes: req.notes,
          delivery_date_target: req.delivery_date_target,
          created_at: req.created_at,
          updated_at: req.updated_at,
          sales_order_number: so?.sales_order_number || "-",
          customer_name: (so?.customers as any)?.name || "-",
          customer_code: (so?.customers as any)?.code || "-",
          customer_po_number: so?.customer_po_number || "-",
          allocation_type: so?.allocation_type || "-",
          project_instansi: so?.project_instansi || "-",
          sales_name: so?.sales_name || "-",
          delivery_deadline: so?.delivery_deadline || "",
          order_date: so?.order_date || "",
          so_status: so?.status || "",
          grand_total: so?.grand_total || 0,
          ship_to_address: so?.ship_to_address,
          so_notes: so?.notes,
          items: items.map(i => ({
            product_name: (i.products as any)?.name || "-",
            ordered_qty: i.ordered_qty,
            qty_delivered: i.qty_delivered || 0,
          })),
        };
      });

      setCards(mappedCards);
    } catch (err: any) {
      console.error("Error fetching delivery cards:", err);
      toast.error("Gagal memuat data Kanban");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCardLabels = useCallback(async () => {
    const { data: cardLabels } = await supabase
      .from("delivery_card_labels")
      .select("delivery_request_id, label_id");
    const { data: labels } = await supabase
      .from("delivery_labels")
      .select("id, name, color");
    if (!cardLabels || !labels) return;
    const labelsById = Object.fromEntries(labels.map(l => [l.id, l]));
    const map: Record<string, { name: string; color: string }[]> = {};
    cardLabels.forEach(cl => {
      const label = labelsById[cl.label_id];
      if (!label) return;
      if (!map[cl.delivery_request_id]) map[cl.delivery_request_id] = [];
      map[cl.delivery_request_id].push({ name: label.name, color: label.color });
    });
    setCardLabelsMap(map);
  }, []);

  useEffect(() => {
    fetchCards();
    fetchCardLabels();
  }, [fetchCards, fetchCardLabels]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("delivery_requests_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, () => {
        fetchCards();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_card_labels" }, () => {
        fetchCardLabels();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCards, fetchCardLabels]);

  const PENGIRIMAN_COLUMNS = ["pengiriman_senin", "pengiriman_selasa", "pengiriman_rabu", "pengiriman_kamis", "pengiriman_jumat"];

  // Move card to new column
  const moveCard = async (cardId: string, newStatus: BoardStatus) => {
    if (!user) return;

    // Find the card being moved
    const cardToMove = cards.find(c => c.id === cardId);
    if (!cardToMove) return;

    // === VALIDATION: approval_delivery → pengiriman_* ===
    if (cardToMove.board_status === "approval_delivery" && PENGIRIMAN_COLUMNS.includes(newStatus)) {
      // Only sales & super_admin can move
      if (!['super_admin', 'sales'].includes(user.role || '')) {
        toast.error("Hanya Sales atau Super Admin yang dapat memindahkan card ke Pengiriman Hari");
        return;
      }

      // Check if "Verifikasi Administrasi Finance" is checked
      const { data: checklists } = await supabase
        .from("delivery_checklists")
        .select("*")
        .eq("delivery_request_id", cardId)
        .eq("label", "Verifikasi Administrasi Finance");

      const financeChecked = checklists && checklists.length > 0 && checklists[0].is_checked;
      if (!financeChecked) {
        toast.error("Checklist 'Verifikasi Administrasi Finance' harus dicentang oleh Finance terlebih dahulu");
        return;
      }
    }

    try {
      const { error } = await supabase
        .from("delivery_requests")
        .update({ 
          board_status: newStatus, 
          moved_by: user.id, 
          moved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", cardId);
      if (error) throw error;

      // Auto-create upload checklists when moving to pengiriman columns
      if (PENGIRIMAN_COLUMNS.includes(newStatus) && cardToMove.board_status === "approval_delivery") {
        const checklistLabels = ["Upload Foto Pengiriman", "Upload Dokumen Delivery Order"];
        for (const label of checklistLabels) {
          await supabase.from("delivery_checklists").insert({
            delivery_request_id: cardId,
            label,
          });
        }

        await supabase.from("delivery_comments").insert({
          delivery_request_id: cardId,
          user_id: user.id,
          message: `📦 Card dipindahkan ke ${BOARD_COLUMNS.find(c => c.id === newStatus)?.label}. Checklist pengiriman otomatis ditambahkan.`,
          type: "activity",
        });
      }

      toast.success(`Card dipindahkan ke ${BOARD_COLUMNS.find(c => c.id === newStatus)?.label}`);
      fetchCards();
    } catch (err: any) {
      toast.error("Gagal memindahkan card: " + err.message);
    }
  };

  // Add SO to board
  const handleAddToBoard = async () => {
    if (!selectedSOId || !user) return;
    try {
      const { data, error } = await supabase
        .from("delivery_requests")
        .insert({
          sales_order_id: selectedSOId,
          board_status: "new_order",
          notes: addNotes || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      
      // Auto-create checklist item "Proses Sales Order"
      if (data?.id) {
        await supabase.from("delivery_checklists").insert({
          delivery_request_id: data.id,
          label: "Proses Sales Order",
        });
      }

      toast.success("Sales Order berhasil ditambahkan ke board");
      setAddDialogOpen(false);
      setSelectedSOId("");
      setAddNotes("");
      setSoSearchQuery("");
      fetchCards();
    } catch (err: any) {
      if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
        toast.error("Sales Order ini sudah ada di board");
      } else {
        toast.error("Gagal menambahkan: " + err.message);
      }
    }
  };

  // Fetch available SOs
  const fetchAvailableSOs = async () => {
    const { data: existingIds } = await supabase
      .from("delivery_requests")
      .select("sales_order_id");
    
    const usedIds = existingIds?.map(e => e.sales_order_id) || [];

    const { data } = await supabase
      .from("sales_order_headers")
      .select("id, sales_order_number, customer_id, customers!inner(name), project_instansi, allocation_type, sales_name, customer_po_number")
      .eq("is_deleted", false)
      .in("status", ["approved", "partial"])
      .order("created_at", { ascending: false })
      .limit(200);

    const filtered = data?.filter(so => !usedIds.includes(so.id)) || [];
    setAvailableSOs(filtered);
  };

  const filteredSOs = availableSOs.filter(so => {
    if (!soSearchQuery.trim()) return true;
    const q = soSearchQuery.toLowerCase();
    return (
      so.sales_order_number?.toLowerCase().includes(q) ||
      (so.customers as any)?.name?.toLowerCase().includes(q) ||
      so.project_instansi?.toLowerCase().includes(q) ||
      so.sales_name?.toLowerCase().includes(q) ||
      so.customer_po_number?.toLowerCase().includes(q)
    );
  });

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, card: DeliveryCard) => {
    if (!canManage) return;
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => { setDragOverColumn(null); };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (draggedCard && draggedCard.board_status !== columnId) {
      moveCard(draggedCard.id, columnId as BoardStatus);
    }
    setDraggedCard(null);
  };

  const handleDragEnd = () => { setDraggedCard(null); setDragOverColumn(null); };

  const getColumnCards = (columnId: string) => cards.filter(c => c.board_status === columnId);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-500/20 text-green-300 border-green-500/30";
      case "partial": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
      case "delivered": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Request & Delivery Order</h1>
            <p className="text-xs text-muted-foreground">Kanban Board Jadwal Pengiriman</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchCards}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => { setAddDialogOpen(true); fetchAvailableSOs(); }}>
              <Plus className="h-4 w-4 mr-1" /> Tambah SO
            </Button>
          )}
        </div>
      </div>

      {/* Board */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-4 h-full min-w-max">
          {BOARD_COLUMNS.map((column) => {
            const columnCards = getColumnCards(column.id);
            return (
              <div
                key={column.id}
                className={cn(
                  "flex flex-col w-[280px] flex-shrink-0 rounded-xl bg-muted/30 border border-border/50 transition-colors",
                  dragOverColumn === column.id && "border-primary/50 bg-primary/5"
                )}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className={cn("px-3 py-2.5 rounded-t-xl flex items-center justify-between", column.color)}>
                  <span className="text-white text-xs font-bold truncate">{column.label}</span>
                  <Badge variant="secondary" className="bg-white/20 text-white text-[10px] h-5 min-w-[20px] flex items-center justify-center">
                    {columnCards.length}
                  </Badge>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ maxHeight: "calc(100vh - 11rem)" }}>
                  {columnCards.map((card) => (
                    <Card
                      key={card.id}
                      draggable={canManage}
                      onDragStart={(e) => handleDragStart(e, card)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "p-3 cursor-pointer hover:shadow-md transition-all border-border/60 bg-card",
                        draggedCard?.id === card.id && "opacity-40 scale-95",
                        canManage && "cursor-grab active:cursor-grabbing"
                      )}
                      onClick={() => setDetailCard(card)}
                    >
                      {/* SO Number & Status */}
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="text-[11px] font-bold text-primary truncate">{card.sales_order_number}</span>
                        <Badge className={cn("text-[9px] px-1.5 py-0 h-4 flex-shrink-0", getStatusBadgeColor(card.so_status))}>
                          {card.so_status}
                        </Badge>
                      </div>
                      {/* Created date */}
                      <p className="text-[9px] text-muted-foreground mb-2">
                        Dibuat: {format(new Date(card.created_at), "dd MMM yy, HH:mm")}
                      </p>

                      {/* Labels */}
                      {cardLabelsMap[card.id]?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {cardLabelsMap[card.id].map((label, idx) => (
                            <span key={idx} className="text-[9px] text-white px-1.5 py-0.5 rounded-sm font-medium" style={{ backgroundColor: label.color }}>
                              {label.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Customer */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-[11px] text-foreground truncate font-medium">{card.customer_name}</span>
                      </div>

                      {/* Customer PO Number */}
                      <p className="text-[10px] text-muted-foreground truncate mb-1">
                        PO: <span className="font-medium text-foreground/80">{card.customer_po_number}</span>
                      </p>

                      {/* Project */}
                      <p className="text-[10px] text-muted-foreground truncate mb-2">
                        {card.project_instansi} • {card.allocation_type}
                      </p>

                      {/* Items preview */}
                      <div className="space-y-0.5 mb-2">
                        {card.items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <Package className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-[10px] text-muted-foreground truncate">
                              {item.product_name} × {item.ordered_qty}
                            </span>
                          </div>
                        ))}
                        {card.items.length > 2 && (
                          <span className="text-[9px] text-muted-foreground/70">+{card.items.length - 2} produk lainnya</span>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <div className="flex flex-col">
                            <span className="text-[8px] text-muted-foreground/70 leading-tight">Deadline Pengiriman</span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {card.delivery_deadline ? format(new Date(card.delivery_deadline), "dd MMM yy") : "-"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground truncate max-w-[70px]">{card.sales_name}</span>
                        </div>
                      </div>

                      {/* Notes */}
                      {card.notes && (
                        <p className="text-[9px] text-muted-foreground/80 mt-1.5 italic truncate">📝 {card.notes}</p>
                      )}
                    </Card>
                  ))}

                  {columnCards.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground/50">
                      <p className="text-xs">Tidak ada card</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add SO Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) { setSoSearchQuery(""); setSelectedSOId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Sales Order ke Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Pilih Sales Order (Approved)</label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari no. SO, customer, project, sales..."
                  value={soSearchQuery}
                  onChange={(e) => setSoSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-md max-h-[240px] overflow-y-auto">
                {filteredSOs.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {soSearchQuery ? "Tidak ditemukan SO yang cocok" : "Tidak ada SO yang tersedia"}
                  </div>
                ) : (
                  filteredSOs.map((so) => (
                    <div
                      key={so.id}
                      className={cn(
                        "px-3 py-2 cursor-pointer border-b last:border-b-0 transition-colors hover:bg-accent/50",
                        selectedSOId === so.id && "bg-primary/10 border-l-2 border-l-primary"
                      )}
                      onClick={() => setSelectedSOId(so.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{so.sales_order_number}</span>
                        {so.customer_po_number && (
                          <span className="text-[10px] text-muted-foreground">PO: {so.customer_po_number}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(so.customers as any)?.name} • {so.project_instansi}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        Sales: {so.sales_name} • {so.allocation_type}
                      </p>
                    </div>
                  ))
                )}
              </div>
              {selectedSOId && (
                <p className="text-xs text-primary mt-1 font-medium">
                  ✓ Dipilih: {availableSOs.find(s => s.id === selectedSOId)?.sales_order_number}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Catatan (opsional)</label>
              <Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Catatan tambahan..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Batal</Button>
            <Button onClick={handleAddToBoard} disabled={!selectedSOId}>Tambahkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Card Dialog */}
      <DeliveryCardDetail
        card={detailCard as any}
        onClose={() => { setDetailCard(null); fetchCards(); }}
        onMoveRequest={(card) => {
          setMoveDialogCard(card as any);
          setMoveTarget(card.board_status as BoardStatus);
        }}
        canManage={!!canManage}
      />

      {/* Move Dialog */}
      <Dialog open={!!moveDialogCard} onOpenChange={() => setMoveDialogCard(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pindahkan Card</DialogTitle>
          </DialogHeader>
          {moveDialogCard && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pindahkan <strong>{moveDialogCard.sales_order_number}</strong> ke:
              </p>
              <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v as BoardStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARD_COLUMNS.map((col) => (
                    <SelectItem key={col.id} value={col.id} disabled={col.id === moveDialogCard.board_status}>
                      {col.label} {col.id === moveDialogCard.board_status ? "(saat ini)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogCard(null)}>Batal</Button>
            <Button
              onClick={() => {
                if (moveDialogCard && moveTarget !== moveDialogCard.board_status) {
                  moveCard(moveDialogCard.id, moveTarget);
                }
                setMoveDialogCard(null);
              }}
              disabled={moveTarget === moveDialogCard?.board_status}
            >
              Pindahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
