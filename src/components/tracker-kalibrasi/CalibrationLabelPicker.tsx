import React, { useEffect, useState, useCallback } from "react";
import { Tag, Plus, Pencil, Trash2, Check, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#64748b",
];

interface LabelRow { id: string; name: string; color: string }

interface Props {
  salesOrderId: string;
  canManage?: boolean;
}

export default function CalibrationLabelPicker({ salesOrderId, canManage = true }: Props) {
  const { user } = useAuth() as any;

  const [allLabels, setAllLabels] = useState<LabelRow[]>([]);
  const [cardLabelIds, setCardLabelIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(LABEL_COLORS[0]);

  const load = useCallback(async () => {
    if (!salesOrderId) return;
    const [{ data: labels }, { data: cardLabels }] = await Promise.all([
      supabase.from("calibration_labels" as any).select("*").order("created_at"),
      supabase.from("calibration_card_labels" as any).select("label_id").eq("sales_order_id", salesOrderId),
    ]);
    setAllLabels((labels as any) || []);
    setCardLabelIds(((cardLabels as any) || []).map((c: any) => c.label_id));
  }, [salesOrderId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (labelId: string) => {
    const assigned = cardLabelIds.includes(labelId);
    if (assigned) {
      const { error } = await supabase.from("calibration_card_labels" as any)
        .delete().eq("sales_order_id", salesOrderId).eq("label_id", labelId);
      if (error) return toast.error("Gagal melepas label");
    } else {
      const { error } = await supabase.from("calibration_card_labels" as any)
        .insert({ sales_order_id: salesOrderId, label_id: labelId, created_by: user?.id });
      if (error) return toast.error("Gagal memasang label");
    }
    load();
  };

  const createLabel = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("calibration_labels" as any).insert({
      name: newName.trim(), color: newColor, created_by: user?.id,
    });
    setCreating(false);
    if (error) return toast.error("Gagal membuat label: " + error.message);
    setNewName(""); setNewColor(LABEL_COLORS[0]);
    load();
  };

  const updateLabel = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from("calibration_labels" as any)
      .update({ name: editName.trim(), color: editColor }).eq("id", id);
    if (error) return toast.error("Gagal mengubah label");
    setEditId(null); load();
  };

  const deleteLabel = async (id: string) => {
    if (!confirm("Hapus label ini?")) return;
    const { error } = await supabase.from("calibration_labels" as any).delete().eq("id", id);
    if (error) return toast.error("Gagal menghapus label");
    load();
  };

  const assigned = allLabels.filter(l => cardLabelIds.includes(l.id));
  const filtered = allLabels.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map(label => (
        <Badge key={label.id} className="text-[11px] text-white border-0 gap-1" style={{ backgroundColor: label.color }}>
          {label.name}
          {canManage && <X className="h-3 w-3 cursor-pointer hover:opacity-70" onClick={() => toggle(label.id)} />}
        </Badge>
      ))}
      {canManage && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1">
              <Tag className="h-3 w-3" /> Label
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start" onWheel={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold mb-2">Label</p>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari label..." className="h-7 text-xs pl-7" />
            </div>
            <div className="mb-3 max-h-48 overflow-y-auto overscroll-contain border rounded-md p-1">
              <div className="space-y-1 pr-2">
                {filtered.map(label => (
                  <div key={label.id} className="flex items-center gap-1 group">
                    {editId === label.id ? (
                      <div className="flex-1 space-y-1.5 p-1.5 rounded bg-muted/50">
                        <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-6 text-xs"
                          onKeyDown={e => e.key === "Enter" && updateLabel(label.id)} autoFocus />
                        <div className="flex gap-1 flex-wrap">
                          {LABEL_COLORS.map(c => (
                            <button key={c} onClick={() => setEditColor(c)}
                              className={cn("w-4 h-4 rounded-full transition-all", editColor === c && "ring-2 ring-offset-1 ring-primary")}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => updateLabel(label.id)}>
                            <Check className="h-3 w-3 mr-0.5" /> Simpan
                          </Button>
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => setEditId(null)}>Batal</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => toggle(label.id)}
                          className={cn("flex-1 flex items-center gap-2 text-left rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors",
                            cardLabelIds.includes(label.id) && "ring-2 ring-primary/50")}>
                          <span className="w-5 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: label.color }} />
                          <span className="truncate">{label.name}</span>
                          {cardLabelIds.includes(label.id) && <span className="text-primary ml-auto text-[10px]">✓</span>}
                        </button>
                        <>
                            <button onClick={() => { setEditId(label.id); setEditName(label.name); setEditColor(label.color); }}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => deleteLabel(label.id)}
                              className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 p-1">
                              <Trash2 className="h-3 w-3" />
                            </button>
                        </>
                      </>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    {search ? "Label tidak ditemukan" : "Belum ada label"}
                  </p>
                )}
              </div>
            </div>
            <div className="border-t pt-2 space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground">Buat Label Baru</p>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nama label..."
                  className="h-7 text-xs" onKeyDown={e => e.key === "Enter" && createLabel()} />
                <div className="flex gap-1 flex-wrap">
                  {LABEL_COLORS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className={cn("w-5 h-5 rounded-full transition-all", newColor === c && "ring-2 ring-offset-1 ring-primary")}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
                <Button size="sm" className="w-full h-7 text-xs" onClick={createLabel} disabled={!newName.trim() || creating}>
                  <Plus className="h-3 w-3 mr-1" /> Buat Label
                </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}