import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Bell, Truck, Clock, CheckSquare, Package, AlertTriangle, FileText, ShoppingCart, Clipboard } from "lucide-react";

interface TickerItem {
  id: string;
  message: string;
  type: "system" | "move" | "checklist" | "info" | "warning" | "approval";
  timestamp: Date;
}

const TYPE_ICONS: Record<TickerItem["type"], React.ReactNode> = {
  system: <Clock className="h-3.5 w-3.5" />,
  move: <Truck className="h-3.5 w-3.5" />,
  checklist: <CheckSquare className="h-3.5 w-3.5" />,
  info: <Bell className="h-3.5 w-3.5" />,
  warning: <AlertTriangle className="h-3.5 w-3.5" />,
  approval: <FileText className="h-3.5 w-3.5" />,
};

const TYPE_COLORS: Record<TickerItem["type"], string> = {
  system: "text-amber-300",
  move: "text-sky-300",
  checklist: "text-emerald-300",
  info: "text-blue-300",
  warning: "text-red-300",
  approval: "text-purple-300",
};

const COLUMN_LABELS: Record<string, string> = {
  new_order: "New Orders",
  checking: "Checking...",
  on_hold_delivery: "On Hold Delivery Order",
  approval_delivery: "Approval Delivery Order",
  pengiriman_senin: "Pengiriman Senin",
  pengiriman_selasa: "Pengiriman Selasa",
  pengiriman_rabu: "Pengiriman Rabu",
  pengiriman_kamis: "Pengiriman Kamis",
  pengiriman_jumat: "Pengiriman Jumat",
  delivered: "Delivered",
  delivered_sample: "Delivered Sample",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Menunggu Approval",
  pending: "Menunggu Approval",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  revision_requested: "Minta Revisi",
  completed: "Selesai",
  partial: "Partial",
};

export default function DeliveryMarqueeTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const tickerRef = useRef<HTMLDivElement>(null);
  const prevCardsRef = useRef<Record<string, string>>({});

  const addTickerItem = useCallback((message: string, type: TickerItem["type"] = "info") => {
    const newItem: TickerItem = {
      id: crypto.randomUUID(),
      message,
      type,
      timestamp: new Date(),
    };
    setItems(prev => {
      const updated = [newItem, ...prev].slice(0, 50);
      return updated;
    });
  }, []);

  // Add initial welcome message
  useEffect(() => {
    const now = new Date();
    const wibTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const hour = wibTime.getHours();
    const min = wibTime.getMinutes();
    
    addTickerItem(
      `📡 Board aktif — ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')} WIB — Notifikasi real-time aktif`,
      "info"
    );

    if (hour >= 15) {
      addTickerItem(
        "⏰ Sudah lewat jam 15:00 WIB — Card di Approval Delivery otomatis dipindahkan ke On Hold",
        "warning"
      );
    } else if (hour >= 10) {
      addTickerItem(
        "✅ Jam kerja aktif — Card On Hold sudah dipindahkan kembali ke Approval Delivery",
        "system"
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load initial pending approval counts
  useEffect(() => {
    const loadPendingCounts = async () => {
      const pendingStatuses = ['submitted', 'pending', 'revision_requested'];
      
      const [poRes, soRes, adjRes] = await Promise.all([
        supabase.from("plan_order_headers").select("id", { count: "exact", head: true })
          .in("status", pendingStatuses).eq("is_deleted", false),
        supabase.from("sales_order_headers").select("id", { count: "exact", head: true })
          .in("status", pendingStatuses).eq("is_deleted", false),
        supabase.from("stock_adjustments").select("id", { count: "exact", head: true })
          .in("status", pendingStatuses).eq("is_deleted", false),
      ]);

      const poCount = poRes.count || 0;
      const soCount = soRes.count || 0;
      const adjCount = adjRes.count || 0;
      const total = poCount + soCount + adjCount;

      if (total > 0) {
        const parts: string[] = [];
        if (poCount > 0) parts.push(`${poCount} Plan Order`);
        if (soCount > 0) parts.push(`${soCount} Sales Order`);
        if (adjCount > 0) parts.push(`${adjCount} Stock Adjustment`);
        addTickerItem(
          `📋 Pending Approval: ${parts.join(", ")} menunggu persetujuan`,
          "approval"
        );
      }
    };
    loadPendingCounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen to realtime changes on delivery_requests + approval tables
  useEffect(() => {
    const buildInitialState = async () => {
      const { data } = await supabase
        .from("delivery_requests")
        .select("id, board_status, sales_order_id");
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(d => { map[d.id] = d.board_status; });
        prevCardsRef.current = map;
      }
    };
    buildInitialState();

    const channel = supabase
      .channel("delivery_ticker_realtime")
      // Delivery requests
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "delivery_requests",
      }, async (payload) => {
        const newRow = payload.new as any;
        const oldStatus = prevCardsRef.current[newRow.id];
        const newStatus = newRow.board_status;

        if (oldStatus && oldStatus !== newStatus) {
          const { data: soData } = await supabase
            .from("sales_order_headers")
            .select("sales_order_number")
            .eq("id", newRow.sales_order_id)
            .single();
          
          const soNum = soData?.sales_order_number || "—";
          const fromLabel = COLUMN_LABELS[oldStatus] || oldStatus;
          const toLabel = COLUMN_LABELS[newStatus] || newStatus;

          const isSystemMove = 
            (oldStatus === "approval_delivery" && newStatus === "on_hold_delivery") ||
            (oldStatus === "on_hold_delivery" && newStatus === "approval_delivery");

          if (isSystemMove) {
            addTickerItem(`⏰ ${soNum} otomatis dipindahkan: ${fromLabel} → ${toLabel}`, "system");
          } else {
            addTickerItem(`🚚 ${soNum} dipindahkan: ${fromLabel} → ${toLabel}`, "move");
          }
        }
        prevCardsRef.current[newRow.id] = newStatus;
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "delivery_requests",
      }, async (payload) => {
        const newRow = payload.new as any;
        const { data: soData } = await supabase
          .from("sales_order_headers")
          .select("sales_order_number")
          .eq("id", newRow.sales_order_id)
          .single();
        
        const soNum = soData?.sales_order_number || "—";
        addTickerItem(`📦 Card baru ditambahkan: ${soNum}`, "info");
        prevCardsRef.current[newRow.id] = newRow.board_status;
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "delivery_requests",
      }, (payload) => {
        const oldRow = payload.old as any;
        addTickerItem(`🗑️ Card dihapus dari board`, "warning");
        delete prevCardsRef.current[oldRow.id];
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "delivery_checklists",
      }, async (payload) => {
        const newRow = payload.new as any;
        if (newRow.is_checked) {
          addTickerItem(`✅ Checklist dicentang: "${newRow.label}"`, "checklist");
        }
      })
      // Plan Order status changes
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "plan_order_headers",
      }, (payload) => {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        if (oldRow.status !== newRow.status) {
          const statusLabel = STATUS_LABELS[newRow.status] || newRow.status;
          if (['submitted', 'pending'].includes(newRow.status)) {
            addTickerItem(`📋 Plan Order ${newRow.plan_number} membutuhkan approval`, "approval");
          } else if (newRow.status === 'approved') {
            addTickerItem(`✅ Plan Order ${newRow.plan_number} telah disetujui`, "approval");
          } else if (newRow.status === 'revision_requested') {
            addTickerItem(`🔄 Plan Order ${newRow.plan_number} diminta revisi`, "warning");
          } else if (newRow.status === 'cancelled') {
            addTickerItem(`❌ Plan Order ${newRow.plan_number} dibatalkan`, "warning");
          }
        }
      })
      // Sales Order status changes
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "sales_order_headers",
      }, (payload) => {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        if (oldRow.status !== newRow.status) {
          if (['submitted', 'pending'].includes(newRow.status)) {
            addTickerItem(`📋 Sales Order ${newRow.sales_order_number} membutuhkan approval`, "approval");
          } else if (newRow.status === 'approved') {
            addTickerItem(`✅ Sales Order ${newRow.sales_order_number} telah disetujui`, "approval");
          } else if (newRow.status === 'revision_requested') {
            addTickerItem(`🔄 Sales Order ${newRow.sales_order_number} diminta revisi`, "warning");
          } else if (newRow.status === 'cancelled') {
            addTickerItem(`❌ Sales Order ${newRow.sales_order_number} dibatalkan`, "warning");
          }
        }
      })
      // Stock Adjustment status changes
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "stock_adjustments",
      }, (payload) => {
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        if (oldRow.status !== newRow.status) {
          if (['submitted', 'pending'].includes(newRow.status)) {
            addTickerItem(`📋 Stock Adjustment ${newRow.adjustment_number} membutuhkan approval`, "approval");
          } else if (newRow.status === 'approved') {
            addTickerItem(`✅ Stock Adjustment ${newRow.adjustment_number} telah disetujui`, "approval");
          } else if (newRow.status === 'revision_requested') {
            addTickerItem(`🔄 Stock Adjustment ${newRow.adjustment_number} diminta revisi`, "warning");
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-8 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-t border-slate-700/50 overflow-hidden flex-shrink-0">
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-amber-500/5 pointer-events-none" />
      
      {/* Label badge */}
      <div className="absolute left-0 top-0 h-full z-10 flex items-center px-2.5 bg-gradient-to-r from-slate-900 via-slate-900 to-transparent">
        <div className="flex items-center gap-1.5 bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border border-blue-500/30">
          <Bell className="h-3 w-3 animate-pulse" />
          <span>LIVE</span>
        </div>
      </div>

      {/* Scrolling marquee */}
      <div className="absolute inset-0 pl-20 flex items-center overflow-hidden">
        <div
          ref={tickerRef}
          className="whitespace-nowrap animate-marquee inline-flex items-center gap-1"
        >
          {items.length > 0 ? items.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && <span className="text-slate-600 mx-3">•</span>}
              <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TYPE_COLORS[item.type])}>
                {TYPE_ICONS[item.type]}
                <span className="text-slate-500 text-[10px]">
                  {item.timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
                </span>
                <span className="text-slate-200">{item.message}</span>
              </span>
            </React.Fragment>
          )) : (
            <span className="text-xs text-slate-400">📡 Menunggu aktivitas...</span>
          )}
          {/* Duplicate for seamless loop */}
          {items.length > 0 && (
            <>
              <span className="text-slate-600 mx-6">|</span>
              {items.map((item, idx) => (
                <React.Fragment key={`dup-${item.id}`}>
                  {idx > 0 && <span className="text-slate-600 mx-3">•</span>}
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TYPE_COLORS[item.type])}>
                    {TYPE_ICONS[item.type]}
                    <span className="text-slate-500 text-[10px]">
                      {item.timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
                    </span>
                    <span className="text-slate-200">{item.message}</span>
                  </span>
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right fade */}
      <div className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none z-10" />
    </div>
  );
}
