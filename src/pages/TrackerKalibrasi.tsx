import React, { useState } from "react";
import { FlaskConical, Loader2, RefreshCw, Building2, Package, Calendar as CalendarIcon, User } from "lucide-react";
import { format, isPast } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useTrackerKalibrasi,
  COLUMN_DEFS,
  KalibrasiV2Card,
  KalibrasiV2Column,
} from "@/hooks/useTrackerKalibrasi";
import TrackerKalibrasiCardDetail from "@/components/tracker-kalibrasi/TrackerKalibrasiCardDetail";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function totalValue(card: KalibrasiV2Card): number {
  return (card.instruments ?? []).reduce((sum, i) => sum + (i.unit_price ?? 0), 0);
}

function statusBadgeColor(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "approved" || s === "completed" || s === "invoiced") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "rejected" || s === "cancelled") return "bg-red-100 text-red-700 border-red-200";
  if (s === "received" || s === "in_progress") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

// ─── kanban card ─────────────────────────────────────────────────────────────

interface KanbanCardProps {
  card: KalibrasiV2Card;
  columnId: KalibrasiV2Column;
  onClickCard: (id: string) => void;
}

function KanbanCard({ card, columnId, onClickCard }: KanbanCardProps) {
  const isOverdue =
    card.target_completion_date &&
    isPast(new Date(card.target_completion_date + "T23:59:59")) &&
    columnId !== "invoiced" && columnId !== "rejected";

  const instCount = card.instruments?.length ?? 0;
  const firstInstrument = card.instruments?.[0];

  return (
    <button
      onClick={() => onClickCard(card.id)}
      className={cn(
        "text-left rounded-xl border bg-card shadow-sm p-3 flex flex-col gap-1.5",
        "hover:shadow-md hover:border-primary/40 transition-all cursor-pointer",
      )}
    >
      {/* SO number + status */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-primary text-[13px] truncate">
          {card.receipt_number}
        </span>
        <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 py-0 font-medium capitalize", statusBadgeColor(card.status))}>
          {card.status}
        </Badge>
      </div>

      {/* Dibuat */}
      {card.created_at && (
        <p className="text-[10px] text-muted-foreground">
          Dibuat: {format(new Date(card.created_at), "d MMM yy, HH:mm", { locale: idLocale })}
        </p>
      )}

      {/* Labels: allocation + KAL */}
      <div className="flex flex-wrap gap-1">
        <span className="text-[9px] font-semibold text-white bg-amber-500 px-1.5 py-0.5 rounded">
          KAL
        </span>
        {card.allocation_type && (
          <span className="text-[9px] font-semibold text-white bg-blue-600 px-1.5 py-0.5 rounded capitalize">
            {card.allocation_type.replace(/_/g, " ")}
          </span>
        )}
        {card.spk_number && (
          <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {card.spk_number}
          </span>
        )}
      </div>

      {/* Customer */}
      <div className="flex items-center gap-1 mt-0.5">
        <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <span className="text-[12px] font-medium truncate">{card.customer?.name ?? "-"}</span>
      </div>

      {/* PO */}
      {card.customer_po_number && (
        <p className="text-[10px] text-muted-foreground truncate">
          PO: <span className="font-medium text-foreground/80">{card.customer_po_number}</span>
        </p>
      )}

      {/* Lokasi service */}
      {card.service_location && (
        <p className="text-[10px] text-muted-foreground truncate">
          {card.service_location}
        </p>
      )}

      {/* Instrumen preview */}
      {instCount > 0 && (
        <div className="flex items-center gap-1">
          <Package className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            {firstInstrument?.instrument_name}
            {instCount > 1 && ` +${instCount - 1} lainnya`} · {formatRupiah(totalValue(card))}
          </span>
        </div>
      )}

      {/* Footer: deadline + sales */}
      <div className="flex items-center justify-between border-t border-border/40 pt-1.5 mt-1">
        <div className="flex items-center gap-1">
          <CalendarIcon className="h-3 w-3 text-destructive" />
          <div className="flex flex-col leading-tight">
            <span className="text-[8px] text-destructive font-semibold">Deadline Pengiriman</span>
            <span className={cn("text-[10px] font-bold text-destructive", isOverdue && "underline")}>
              {card.target_completion_date
                ? format(new Date(card.target_completion_date + "T00:00:00"), "d MMM yy", { locale: idLocale })
                : "-"}
            </span>
          </div>
        </div>
        {card.sales_name && (
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{card.sales_name}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── column ──────────────────────────────────────────────────────────────────

interface ColumnProps {
  colDef: (typeof COLUMN_DEFS)[number];
  cards: KalibrasiV2Card[];
  onClickCard: (id: string) => void;
}

function KanbanColumn({ colDef, cards, onClickCard }: ColumnProps) {
  return (
    <div className="flex flex-col w-72 flex-none">
      {/* Column header */}
      <div className="rounded-xl border bg-card mb-2 overflow-hidden">
        <div className={cn("h-1.5 w-full", colDef.color)} />
        <div className="px-3 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{colDef.label}</p>
            <p className="text-xs text-muted-foreground">{colDef.desc}</p>
          </div>
          <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">
            {cards.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto pb-4 pr-0.5">
        {cards.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 h-20 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Kosong</p>
          </div>
        ) : (
          cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              columnId={colDef.id}
              onClickCard={onClickCard}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function TrackerKalibrasi() {
  const {
    loading,
    checklists,
    canToggle,
    getColumnCards,
    toggleChecklist,
    setReceivedDate,
    setSpkConfirmedDate,
    setDecision,
    refetch,
  } = useTrackerKalibrasi();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totalCards = COLUMN_DEFS.reduce(
    (sum, col) => sum + getColumnCards(col.id).length,
    0,
  );

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">Tracker Kalibrasi</h1>
          {!loading && (
            <span className="text-sm text-muted-foreground">
              ({totalCards} aktif)
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* Kanban board */
        <div className="flex gap-4 flex-1 overflow-x-auto overflow-y-hidden pb-2">
          {COLUMN_DEFS.map((col) => (
            <KanbanColumn
              key={col.id}
              colDef={col}
              cards={getColumnCards(col.id)}
              onClickCard={setSelectedId}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedId && (
        <TrackerKalibrasiCardDetail
          receiptId={selectedId}
          checklists={checklists[selectedId] ?? []}
          canToggle={canToggle}
          onToggle={toggleChecklist}
          onSetReceivedDate={setReceivedDate}
          onSetSpkConfirmedDate={setSpkConfirmedDate}
          onSetDecision={setDecision}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
