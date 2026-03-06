import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Truck, ChevronRight, Tag, MessageSquare, Send, X, Plus, Trash2, Paperclip, FileText, Image, Download, Loader2, CheckSquare, AlertTriangle, Calendar, AtSign, Pencil, Check, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format, formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

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

const LABEL_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#6366f1", "#64748b",
];

interface DeliveryCard {
  id: string;
  sales_order_id: string;
  board_status: string;
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

interface Label {
  id: string;
  name: string;
  color: string;
}

interface Comment {
  id: string;
  user_id: string;
  message: string;
  type: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

interface Attachment {
  id: string;
  file_key: string;
  url: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
  uploader_name?: string;
}

interface ChecklistItem {
  id: string;
  delivery_request_id: string;
  label: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

interface Props {
  card: DeliveryCard | null;
  onClose: () => void;
  onMoveRequest: (card: DeliveryCard) => void;
  canManage: boolean;
}

export default function DeliveryCardDetail({ card, onClose, onMoveRequest, canManage }: Props) {
  const { user } = useAuth();

  // Labels state
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [cardLabelIds, setCardLabelIds] = useState<string[]>([]);
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [labelSearchQuery, setLabelSearchQuery] = useState("");
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState("");
  const [editLabelColor, setEditLabelColor] = useState("");
  
  // Urgent/Cito reason dialog
  const [urgentReasonDialog, setUrgentReasonDialog] = useState<{ labelId: string; labelName: string } | null>(null);
  const [urgentReason, setUrgentReason] = useState("");

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [allMentionUsers, setAllMentionUsers] = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Checklist state
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);

  // Stock out delivery details
  const [stockOutDetails, setStockOutDetails] = useState<{
    stock_out_number: string;
    delivery_date: string;
    items: {
      product_name: string;
      qty_out: number;
      batch_no: string;
      expired_date: string | null;
    }[];
  }[]>([]);

  // Delete card dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteAction, setDeleteAction] = useState<"remove_from_board" | "delivered">("remove_from_board");
  const [deliveredDate, setDeliveredDate] = useState(new Date().toISOString().split("T")[0]);
  const [deletingCard, setDeletingCard] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';
  const isFinance = user?.role === 'finance';
  const isAdmin = user?.role && ['super_admin', 'admin'].includes(user.role);
  const canCheckChecklist = user?.role && ['super_admin', 'purchasing', 'finance'].includes(user.role);
  const canDeleteCard = user?.role && ['super_admin', 'finance'].includes(user.role);

  // Fetch labels & card labels
  const fetchLabels = useCallback(async () => {
    if (!card) return;
    const [{ data: labels }, { data: cardLabels }] = await Promise.all([
      supabase.from("delivery_labels").select("*").order("created_at"),
      supabase.from("delivery_card_labels").select("label_id").eq("delivery_request_id", card.id),
    ]);
    setAllLabels((labels as Label[]) || []);
    setCardLabelIds((cardLabels || []).map((cl: any) => cl.label_id));
  }, [card]);

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (!card) return;
    const { data } = await supabase
      .from("delivery_comments")
      .select("*")
      .eq("delivery_request_id", card.id)
      .order("created_at", { ascending: false });

    if (!data) { setComments([]); return; }

    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", userIds);

    const mapped: Comment[] = data.map(c => {
      const profile = profiles?.find(p => p.id === c.user_id);
      return {
        ...c,
        user_name: profile?.full_name || "Unknown",
        user_avatar: profile?.avatar_url || undefined,
      };
    });
    setComments(mapped);
  }, [card]);

  // Fetch attachments
  const fetchAttachments = useCallback(async () => {
    if (!card) return;
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("ref_table", "delivery_requests")
      .eq("ref_id", card.id)
      .order("uploaded_at", { ascending: false });

    if (!data) { setAttachments([]); return; }

    const userIds = [...new Set(data.map(a => a.uploaded_by).filter(Boolean))] as string[];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] };

    setAttachments(data.map(a => ({
      ...a,
      uploader_name: profiles?.find(p => p.id === a.uploaded_by)?.full_name || "Unknown",
    })));
  }, [card]);

  // Fetch checklists
  const fetchChecklists = useCallback(async () => {
    if (!card) return;
    const { data } = await supabase
      .from("delivery_checklists")
      .select("*")
      .eq("delivery_request_id", card.id);
    setChecklists((data as ChecklistItem[]) || []);
  }, [card]);

  // Fetch stock out details for this SO
  const fetchStockOutDetails = useCallback(async () => {
    if (!card) return;
    try {
      // Get all stock out headers for this SO
      const { data: stockOuts } = await supabase
        .from("stock_out_headers")
        .select("id, stock_out_number, delivery_date")
        .eq("sales_order_id", card.sales_order_id)
        .order("created_at", { ascending: false });

      if (!stockOuts || stockOuts.length === 0) {
        setStockOutDetails([]);
        return;
      }

      const details = [];
      for (const so of stockOuts) {
        const { data: outItems } = await supabase
          .from("stock_out_items")
          .select("qty_out, product:products(name), batch:inventory_batches(batch_no, expired_date)")
          .eq("stock_out_id", so.id);

        details.push({
          stock_out_number: so.stock_out_number,
          delivery_date: so.delivery_date,
          items: (outItems || []).map((item: any) => ({
            product_name: item.product?.name || "-",
            qty_out: item.qty_out,
            batch_no: item.batch?.batch_no || "-",
            expired_date: item.batch?.expired_date || null,
          })),
        });
      }
      setStockOutDetails(details);
    } catch (err) {
      console.error("Error fetching stock out details:", err);
    }
  }, [card]);

  // Fetch users for mentions
  useEffect(() => {
    const fetchMentionUsers = async () => {
      const { data } = await supabase.from("profiles_chat_view").select("id, full_name, avatar_url");
      if (data) {
        setAllMentionUsers(data.map(u => ({ id: u.id || '', name: u.full_name || 'User', avatar_url: u.avatar_url })));
      }
    };
    fetchMentionUsers();
  }, []);

  const filteredMentionUsers = useMemo(() => {
    if (!mentionSearch) return allMentionUsers.filter(u => u.id !== user?.id);
    const search = mentionSearch.toLowerCase();
    return allMentionUsers.filter(u => u.id !== user?.id && u.name.toLowerCase().includes(search));
  }, [allMentionUsers, mentionSearch, user?.id]);

  useEffect(() => {
    if (card) {
      fetchLabels();
      fetchComments();
      fetchAttachments();
      fetchChecklists();
      fetchStockOutDetails();
    }
  }, [card, fetchLabels, fetchComments, fetchAttachments, fetchChecklists, fetchStockOutDetails]);

  // Realtime comments & checklists
  useEffect(() => {
    if (!card) return;
    const channel = supabase
      .channel(`detail_${card.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_comments", filter: `delivery_request_id=eq.${card.id}` }, () => {
        fetchComments();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_checklists", filter: `delivery_request_id=eq.${card.id}` }, () => {
        fetchChecklists();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [card, fetchComments, fetchChecklists]);

  // Toggle label on card
  const toggleLabel = async (labelId: string) => {
    if (!card || !canManage) return;
    const isAssigned = cardLabelIds.includes(labelId);
    
    // If assigning (not removing), check if it's Urgent or Cito
    if (!isAssigned) {
      const label = allLabels.find(l => l.id === labelId);
      if (label && /urgent|cito/i.test(label.name)) {
        setUrgentReasonDialog({ labelId, labelName: label.name });
        setUrgentReason("");
        return;
      }
    }
    
    if (isAssigned) {
      await supabase.from("delivery_card_labels").delete().eq("delivery_request_id", card.id).eq("label_id", labelId);
    } else {
      await supabase.from("delivery_card_labels").insert({ delivery_request_id: card.id, label_id: labelId });
    }
    fetchLabels();
  };

  // Confirm urgent/cito label with reason
  const confirmUrgentLabel = async () => {
    if (!urgentReasonDialog || !urgentReason.trim() || !card || !user) return;
    // Assign the label
    await supabase.from("delivery_card_labels").insert({ delivery_request_id: card.id, label_id: urgentReasonDialog.labelId });
    // Post reason as activity comment
    await supabase.from("delivery_comments").insert({
      delivery_request_id: card.id,
      user_id: user.id,
      message: `🚨 Label "${urgentReasonDialog.labelName}" ditambahkan.\nAlasan: ${urgentReason.trim()}`,
      type: "activity",
    });
    toast.success(`Label ${urgentReasonDialog.labelName} ditambahkan`);
    setUrgentReasonDialog(null);
    setUrgentReason("");
    fetchLabels();
    fetchComments();
  };

  // Update existing label (super_admin only)
  const updateLabel = async (labelId: string) => {
    if (!editLabelName.trim()) return;
    const { error } = await supabase.from("delivery_labels").update({ name: editLabelName.trim(), color: editLabelColor }).eq("id", labelId);
    if (error) toast.error("Gagal mengubah label");
    else toast.success("Label diperbarui");
    setEditingLabelId(null);
    fetchLabels();
  };

  // Create new label (super_admin only)
  const createLabel = async () => {
    if (!newLabelName.trim() || !user) return;
    setCreatingLabel(true);
    const { error } = await supabase.from("delivery_labels").insert({
      name: newLabelName.trim(),
      color: newLabelColor,
      created_by: user.id,
    });
    if (error) {
      toast.error("Gagal membuat label: " + error.message);
    } else {
      toast.success("Label berhasil dibuat");
      setNewLabelName("");
    }
    setCreatingLabel(false);
    fetchLabels();
  };

  // Delete label (super_admin only)
  const deleteLabel = async (labelId: string) => {
    const { error } = await supabase.from("delivery_labels").delete().eq("id", labelId);
    if (error) toast.error("Gagal menghapus label");
    else fetchLabels();
  };

  // Handle comment input with mention detection
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;
    setNewComment(value);

    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setShowMentionList(true);
        setMentionStartIndex(lastAtIndex);
        setMentionSearch(textAfterAt);
      } else {
        setShowMentionList(false);
      }
    } else {
      setShowMentionList(false);
    }
  };

  const insertCommentMention = (mentionUser: { id: string; name: string }) => {
    if (mentionStartIndex === -1) return;
    const beforeMention = newComment.slice(0, mentionStartIndex);
    const afterMention = newComment.slice(mentionStartIndex + mentionSearch.length + 1);
    const mentionText = `@${mentionUser.name.split(" ")[0]} `;
    setNewComment(beforeMention + mentionText + afterMention);
    setShowMentionList(false);
    setMentionStartIndex(-1);
    setMentionSearch("");
    commentRef.current?.focus();
  };

  const renderCommentMessage = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const mentionName = part.slice(1).toLowerCase();
        const isMentionedUser = allMentionUsers.some(u => u.name.split(" ")[0].toLowerCase() === mentionName);
        if (isMentionedUser) {
          return (
            <span key={i} className="font-semibold text-primary bg-primary/10 px-0.5 rounded">
              {part}
            </span>
          );
        }
      }
      return part;
    });
  };

  // Send comment
  const sendComment = async () => {
    if (!newComment.trim() || !user || !card) return;
    setSendingComment(true);
    const { error } = await supabase.from("delivery_comments").insert({
      delivery_request_id: card.id,
      user_id: user.id,
      message: newComment.trim(),
      type: "comment",
    });
    if (error) {
      toast.error("Gagal mengirim komentar");
    } else {
      setNewComment("");
    }
    setSendingComment(false);
  };

  // Delete comment
  const deleteComment = async (commentId: string) => {
    await supabase.from("delivery_comments").delete().eq("id", commentId);
    fetchComments();
  };

  const PENGIRIMAN_COLUMNS = ["pengiriman_senin", "pengiriman_selasa", "pengiriman_rabu", "pengiriman_kamis", "pengiriman_jumat"];

  // Toggle checklist & auto-move logic
  const handleToggleChecklist = async (checklistId: string, currentChecked: boolean) => {
    if (!user || !card) return;

    // Find the checklist item to check role permission per-item
    const checklistItem = checklists.find(cl => cl.id === checklistId);
    if (!checklistItem) return;

    // "Verifikasi Administrasi Finance" can only be checked by finance & super_admin
    const isFinanceChecklist = checklistItem.label === "Verifikasi Administrasi Finance";
    // "Upload Foto Pengiriman" & "Upload Dokumen Delivery Order" can only be checked by warehouse & super_admin
    const isUploadChecklist = ["Upload Foto Pengiriman", "Upload Dokumen Delivery Order"].includes(checklistItem.label);
    
    let canCheckThisItem = false;
    if (isFinanceChecklist) {
      canCheckThisItem = ['super_admin', 'finance'].includes(user.role || '');
    } else if (isUploadChecklist) {
      canCheckThisItem = ['super_admin', 'warehouse'].includes(user.role || '');
    } else {
      canCheckThisItem = !!canCheckChecklist;
    }

    if (!canCheckThisItem) {
      if (isFinanceChecklist) {
        toast.error("Hanya Finance atau Super Admin yang dapat mencentang checklist ini");
      } else if (isUploadChecklist) {
        toast.error("Hanya Warehouse atau Super Admin yang dapat mencentang checklist ini");
      } else {
        toast.error("Hanya Purchasing, Finance, atau Super Admin yang dapat mencentang checklist ini");
      }
      return;
    }

    try {
      const newChecked = !currentChecked;
      const { error } = await supabase
        .from("delivery_checklists")
        .update({
          is_checked: newChecked,
          checked_by: newChecked ? user.id : null,
          checked_at: newChecked ? new Date().toISOString() : null,
        })
        .eq("id", checklistId);
      if (error) throw error;

      // Re-fetch to get latest state
      const { data: latestChecklists } = await supabase
        .from("delivery_checklists")
        .select("*")
        .eq("delivery_request_id", card.id);

      const allChecked = latestChecklists && latestChecklists.length > 0 && latestChecklists.every((cl: any) => cl.is_checked);
      
      if (allChecked && card.board_status === "new_order") {
        // Auto-move to checking
        await supabase
          .from("delivery_requests")
          .update({
            board_status: "checking",
            moved_by: user.id,
            moved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", card.id);
        
        await supabase.from("delivery_comments").insert({
          delivery_request_id: card.id,
          user_id: user.id,
          message: `✅ Checklist "Proses Sales Order" dicentang. Card otomatis dipindahkan ke Checking.`,
          type: "activity",
        });

        toast.success("Checklist selesai! Card otomatis dipindahkan ke Checking");
        onClose();
        return;
      }

      // If unchecked and card is in checking, auto-move back to new_order
      if (!allChecked && card.board_status === "checking") {
        await supabase
          .from("delivery_requests")
          .update({
            board_status: "new_order",
            moved_by: user.id,
            moved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", card.id);
        
        await supabase.from("delivery_comments").insert({
          delivery_request_id: card.id,
          user_id: user.id,
          message: `⬅️ Checklist "Proses Sales Order" di-unchecklist. Card otomatis dipindahkan kembali ke New Orders.`,
          type: "activity",
        });

        toast.info("Checklist dibatalkan. Card dipindahkan kembali ke New Orders");
        onClose();
        return;
      }

      // Auto-move from pengiriman columns to delivered/delivered_sample
      if (allChecked && PENGIRIMAN_COLUMNS.includes(card.board_status)) {
        // Check if card has "sample" label
        const { data: cardLabelsData } = await supabase
          .from("delivery_card_labels")
          .select("label_id, delivery_labels!inner(name)")
          .eq("delivery_request_id", card.id);

        const hasSampleLabel = cardLabelsData?.some((cl: any) => 
          cl.delivery_labels?.name?.toLowerCase().includes("sample")
        );

        const targetStatus = hasSampleLabel ? "delivered_sample" : "delivered";
        const targetLabel = hasSampleLabel ? "Delivered Sample" : "Delivered";

        await supabase
          .from("delivery_requests")
          .update({
            board_status: targetStatus,
            moved_by: user.id,
            moved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", card.id);
        
        await supabase.from("delivery_comments").insert({
          delivery_request_id: card.id,
          user_id: user.id,
          message: `✅ Semua checklist pengiriman selesai. Card otomatis dipindahkan ke ${targetLabel}.`,
          type: "activity",
        });

        toast.success(`Checklist selesai! Card otomatis dipindahkan ke ${targetLabel}`);
        onClose();
        return;
      }

      fetchChecklists();
    } catch (err: any) {
      toast.error("Gagal update checklist: " + err.message);
    }
  };

  // Delete card handler with options
  const handleDeleteCard = async () => {
    if (!user || !card || !canDeleteCard) return;
    setDeletingCard(true);
    try {
      if (deleteAction === "delivered") {
        // Move to delivered with date note
        await supabase
          .from("delivery_requests")
          .update({
            board_status: "delivered",
            moved_by: user.id,
            moved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            notes: `Sudah terkirim pada ${deliveredDate}. ${card.notes || ""}`.trim(),
          })
          .eq("id", card.id);

        await supabase.from("delivery_comments").insert({
          delivery_request_id: card.id,
          user_id: user.id,
          message: `✅ Card dipindahkan ke Delivered. Tanggal pengiriman: ${deliveredDate}`,
          type: "activity",
        });

        toast.success("Card dipindahkan ke Delivered");
      } else {
        // Remove card from board entirely (delete related data first)
        await supabase.from("delivery_checklists").delete().eq("delivery_request_id", card.id);
        await supabase.from("delivery_card_labels").delete().eq("delivery_request_id", card.id);
        await supabase.from("delivery_comments").delete().eq("delivery_request_id", card.id);
        await supabase.from("delivery_requests").delete().eq("id", card.id);

        toast.success("Card dihapus dari board. SO dapat ditambahkan kembali ke board.");
      }

      setShowDeleteDialog(false);
      onClose();
    } catch (err: any) {
      toast.error("Gagal memproses card: " + err.message);
    } finally {
      setDeletingCard(false);
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !card || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 5MB");
      return;
    }

    setUploadingFile(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileKey = `delivery/${card.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileKey, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileKey);

      await supabase.from("attachments").insert({
        ref_table: "delivery_requests",
        ref_id: card.id,
        module_name: "delivery",
        file_key: fileKey,
        url: urlData.publicUrl,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });

      toast.success("File berhasil diupload");
      fetchAttachments();
    } catch (err: any) {
      toast.error("Gagal upload: " + err.message);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete attachment
  const deleteAttachment = async (att: Attachment) => {
    try {
      await supabase.storage.from("documents").remove([att.file_key]);
      await supabase.from("attachments").delete().eq("id", att.id);
      toast.success("File dihapus");
      fetchAttachments();
    } catch {
      toast.error("Gagal menghapus file");
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageFile = (mime: string | null) => mime?.startsWith("image/");

  if (!card) return null;

  const assignedLabels = allLabels.filter(l => cardLabelIds.includes(l.id));

  return (
    <Dialog open={!!card} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            {card.sales_order_number}
          </DialogTitle>
        </DialogHeader>

        {/* Labels section */}
        <div className="flex flex-wrap items-center gap-1.5 px-6 pb-2">
          {assignedLabels.map(label => (
            <Badge
              key={label.id}
              className="text-[11px] text-white border-0 gap-1"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
              {canManage && (
                <X className="h-3 w-3 cursor-pointer hover:opacity-70" onClick={() => toggleLabel(label.id)} />
              )}
            </Badge>
          ))}
          {canManage && (
            <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 text-[11px] px-2 gap-1">
                  <Tag className="h-3 w-3" /> Label
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start">
                <p className="text-xs font-semibold mb-2">Label</p>
                {/* Search */}
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={labelSearchQuery}
                    onChange={e => setLabelSearchQuery(e.target.value)}
                    placeholder="Cari label..."
                    className="h-7 text-xs pl-7"
                  />
                </div>
                {/* Scrollable label list */}
                <ScrollArea className="mb-3" style={{ maxHeight: "12rem" }}>
                  <div className="space-y-1 pr-2">
                    {allLabels
                      .filter(l => l.name.toLowerCase().includes(labelSearchQuery.toLowerCase()))
                      .map(label => (
                      <div key={label.id} className="flex items-center gap-1 group">
                        {editingLabelId === label.id ? (
                          /* Edit mode */
                          <div className="flex-1 space-y-1.5 p-1.5 rounded bg-muted/50">
                            <Input
                              value={editLabelName}
                              onChange={e => setEditLabelName(e.target.value)}
                              className="h-6 text-xs"
                              onKeyDown={e => e.key === "Enter" && updateLabel(label.id)}
                              autoFocus
                            />
                            <div className="flex gap-1 flex-wrap">
                              {LABEL_COLORS.map(c => (
                                <button key={c} onClick={() => setEditLabelColor(c)}
                                  className={cn("w-4 h-4 rounded-full transition-all", editLabelColor === c && "ring-2 ring-offset-1 ring-primary")}
                                  style={{ backgroundColor: c }} />
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => updateLabel(label.id)}>
                                <Check className="h-3 w-3 mr-0.5" /> Simpan
                              </Button>
                              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => setEditingLabelId(null)}>
                                Batal
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Normal mode */
                          <>
                            <button
                              onClick={() => toggleLabel(label.id)}
                              className={cn(
                                "flex-1 flex items-center gap-2 text-left rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors",
                                cardLabelIds.includes(label.id) && "ring-2 ring-primary/50"
                              )}
                            >
                              <span className="w-5 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: label.color }} />
                              <span className="truncate">{label.name}</span>
                              {cardLabelIds.includes(label.id) && <span className="text-primary ml-auto text-[10px]">✓</span>}
                            </button>
                            {isSuperAdmin && (
                              <>
                                <button onClick={() => { setEditingLabelId(label.id); setEditLabelName(label.name); setEditLabelColor(label.color); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button onClick={() => deleteLabel(label.id)} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 p-1">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    {allLabels.filter(l => l.name.toLowerCase().includes(labelSearchQuery.toLowerCase())).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        {labelSearchQuery ? "Label tidak ditemukan" : "Belum ada label"}
                      </p>
                    )}
                  </div>
                </ScrollArea>
                {isSuperAdmin && (
                  <div className="border-t pt-2 space-y-2">
                    <p className="text-[11px] font-medium text-muted-foreground">Buat Label Baru</p>
                    <Input
                      value={newLabelName}
                      onChange={e => setNewLabelName(e.target.value)}
                      placeholder="Nama label..."
                      className="h-7 text-xs"
                      onKeyDown={e => e.key === "Enter" && createLabel()}
                    />
                    <div className="flex gap-1 flex-wrap">
                      {LABEL_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setNewLabelColor(c)}
                          className={cn("w-5 h-5 rounded-full transition-all", newLabelColor === c && "ring-2 ring-offset-1 ring-primary")}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <Button size="sm" className="w-full h-7 text-xs" onClick={createLabel} disabled={!newLabelName.trim() || creatingLabel}>
                      <Plus className="h-3 w-3 mr-1" /> Buat Label
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Two-column layout: Left = Details, Right = Comments & Activity */}
        <div className="flex flex-1 min-h-0 border-t">
          {/* LEFT PANEL - Details, Products, Attachments */}
          <ScrollArea className="flex-1 min-w-0 border-r">
            <div className="space-y-4 p-4">
              {/* Detail info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Customer</span>
                  <p className="font-medium">{card.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{card.customer_code}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Sales</span>
                  <p className="font-medium">{card.sales_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">No. PO Customer</span>
                  <p className="font-medium">{card.customer_po_number}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Tipe Alokasi</span>
                  <p className="font-medium">{card.allocation_type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Project/Instansi</span>
                  <p className="font-medium">{card.project_instansi}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Deadline Pengiriman</span>
                  <p className="font-medium">
                    {card.delivery_deadline ? format(new Date(card.delivery_deadline), "dd MMMM yyyy", { locale: idLocale }) : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Status Board</span>
                  <Badge className={cn("mt-1", BOARD_COLUMNS.find(c => c.id === card.board_status)?.color, "text-white")}>
                    {BOARD_COLUMNS.find(c => c.id === card.board_status)?.label}
                  </Badge>
                </div>
              </div>

              {card.ship_to_address && (
                <div className="text-sm">
                  <span className="text-muted-foreground text-xs">Alamat Pengiriman</span>
                  <p className="text-xs">{card.ship_to_address}</p>
                </div>
              )}

              {/* Products table */}
              <div>
                <span className="text-muted-foreground text-xs block mb-1">Produk</span>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Produk</th>
                        <th className="text-center p-2 font-medium">Qty</th>
                        <th className="text-center p-2 font-medium">Terkirim</th>
                        <th className="text-center p-2 font-medium">Sisa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.items.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{item.product_name}</td>
                          <td className="p-2 text-center">{item.ordered_qty}</td>
                          <td className="p-2 text-center">{item.qty_delivered}</td>
                          <td className="p-2 text-center font-medium">{item.ordered_qty - item.qty_delivered}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stock Out / Delivery Details */}
              {stockOutDetails.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs block mb-1">📦 Detail Pengiriman (Stock Out)</span>
                  <div className="space-y-3">
                    {stockOutDetails.map((so, soIdx) => (
                      <div key={soIdx} className="border rounded-lg overflow-hidden">
                        <div className="bg-primary/10 px-2 py-1.5 flex items-center justify-between">
                          <span className="text-[11px] font-bold text-primary">{so.stock_out_number}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(so.delivery_date), "dd MMM yyyy", { locale: idLocale })}
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2 font-medium">Produk</th>
                              <th className="text-center p-2 font-medium">Qty Kirim</th>
                              <th className="text-left p-2 font-medium">No. Batch</th>
                              <th className="text-left p-2 font-medium">Expiry</th>
                            </tr>
                          </thead>
                          <tbody>
                            {so.items.map((item, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="p-2">{item.product_name}</td>
                                <td className="p-2 text-center font-medium">{item.qty_out}</td>
                                <td className="p-2 font-mono text-[10px]">{item.batch_no}</td>
                                <td className="p-2 text-[10px]">
                                  {item.expired_date
                                    ? format(new Date(item.expired_date), "dd MMM yyyy", { locale: idLocale })
                                    : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {card.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground text-xs">Catatan Board</span>
                  <p className="text-xs italic">{card.notes}</p>
                </div>
              )}

              {/* Attachments */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold">Lampiran</span>
                  {attachments.length > 0 && (
                    <Badge variant="secondary" className="h-4 text-[10px] px-1.5">{attachments.length}</Badge>
                  )}
                  {canManage && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={handleFileUpload}
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2 gap-1 ml-auto"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                      >
                        {uploadingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Upload
                      </Button>
                    </>
                  )}
                </div>

                {attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Belum ada lampiran</p>
                ) : (
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 group">
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          {isImageFile(att.mime_type) ? (
                            <Image className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{att.file_key.split("/").pop()}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatSize(att.file_size)} • {att.uploader_name}
                            {att.uploaded_at && ` • ${formatDistanceToNow(new Date(att.uploaded_at), { addSuffix: true, locale: idLocale })}`}
                          </p>
                        </div>
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 p-1">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        {isSuperAdmin && (
                          <button
                            onClick={() => deleteAttachment(att)}
                            className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 p-1"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Checklist section - below Lampiran */}
              {checklists.length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckSquare className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold">Checklist</span>
                  </div>
                  <div className="space-y-2">
                    {checklists.map((cl) => {
                      const isFinanceChecklist = cl.label === "Verifikasi Administrasi Finance";
                      const canCheckThisItem = isFinanceChecklist
                        ? ['super_admin', 'finance'].includes(user?.role || '')
                        : canCheckChecklist;
                      const hintText = isFinanceChecklist
                        ? "Hanya Finance / Super Admin"
                        : "Hanya Purchasing / Finance / Super Admin";

                      return (
                        <div key={cl.id} className="flex items-center gap-3 p-2 rounded-md bg-background border">
                          <Checkbox
                            checked={cl.is_checked}
                            disabled={!canCheckThisItem}
                            onCheckedChange={() => handleToggleChecklist(cl.id, cl.is_checked)}
                          />
                          <div className="flex-1">
                            <span className={cn(
                              "text-sm font-medium",
                              cl.is_checked && "line-through text-muted-foreground"
                            )}>
                              {cl.label}
                            </span>
                            {cl.is_checked && cl.checked_at && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                ✓ Dicentang {formatDistanceToNow(new Date(cl.checked_at), { addSuffix: true, locale: idLocale })}
                              </p>
                            )}
                            {!canCheckThisItem && !cl.is_checked && (
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                {hintText}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* RIGHT PANEL - Comments & Activity */}
          <div className="w-[340px] flex-shrink-0 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold">Comments & Activity</span>
              {comments.length > 0 && (
                <Badge variant="secondary" className="h-4 text-[10px] px-1.5">{comments.length}</Badge>
              )}
            </div>

            {/* Comment input */}
            <div className="px-4 py-3 border-b relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Textarea
                    ref={commentRef}
                    value={newComment}
                    onChange={handleCommentChange}
                    placeholder="Tulis komentar... (ketik @ untuk mention)"
                    className="text-xs min-h-[50px] resize-none"
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey && !showMentionList) {
                        e.preventDefault();
                        sendComment();
                      }
                    }}
                  />
                  {/* Mention autocomplete */}
                  {showMentionList && filteredMentionUsers.length > 0 && (
                    <div className="absolute top-full left-0 right-8 mt-1 bg-popover border rounded-lg shadow-xl max-h-40 overflow-y-auto z-[9999]">
                      {filteredMentionUsers.map(mu => (
                        <button
                          key={mu.id}
                          className="w-full flex items-center gap-2 p-2 hover:bg-muted transition-colors text-left"
                          onClick={() => insertCommentMention(mu)}
                        >
                          <Avatar className="h-5 w-5">
                            {mu.avatar_url && <AvatarImage src={mu.avatar_url} />}
                            <AvatarFallback className="text-[9px]">{mu.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium truncate">{mu.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 self-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setNewComment(prev => prev + "@");
                      setShowMentionList(true);
                      setMentionStartIndex(newComment.length);
                      setMentionSearch("");
                      commentRef.current?.focus();
                    }}
                  >
                    <AtSign className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={sendComment}
                    disabled={!newComment.trim() || sendingComment}
                    className="h-8"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Comments list */}
            <ScrollArea className="flex-1">
              <div className="px-4 py-3">
                {comments.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-xs">Belum ada komentar</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {comments.map(comment => (
                      <div key={comment.id} className={cn(
                        "flex gap-2 group",
                        comment.type === "activity" && "opacity-70"
                      )}>
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                          {comment.user_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{comment.user_name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: idLocale })}
                            </span>
                            {isSuperAdmin && (
                              <button
                                onClick={() => deleteComment(comment.id)}
                                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-auto"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <p className={cn("text-xs mt-0.5 whitespace-pre-wrap break-words", comment.type === "activity" ? "italic text-muted-foreground" : "text-foreground")}>
                            {comment.type === "activity" ? comment.message : renderCommentMessage(comment.message)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t flex-col sm:flex-row gap-2">
          {canDeleteCard && (
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)} className="mr-auto">
              <Trash2 className="h-4 w-4 mr-1" /> Hapus Card
            </Button>
          )}
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => { onMoveRequest(card); onClose(); }}>
              <ChevronRight className="h-4 w-4 mr-1" /> Pindahkan
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>

      {/* Delete Card Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Hapus Card Delivery
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Pilih tindakan untuk card <span className="font-semibold text-foreground">{card.sales_order_number}</span>:
            </p>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="deleteAction"
                  value="remove_from_board"
                  checked={deleteAction === "remove_from_board"}
                  onChange={() => setDeleteAction("remove_from_board")}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Hapus dari Board</p>
                  <p className="text-xs text-muted-foreground">Card akan dihapus. SO dapat ditambahkan kembali ke board melalui dialog "Tambah Sales Order".</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="deleteAction"
                  value="delivered"
                  checked={deleteAction === "delivered"}
                  onChange={() => setDeleteAction("delivered")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Pindahkan ke Delivered</p>
                  <p className="text-xs text-muted-foreground mb-2">Tandai card sudah terkirim dengan tanggal pengiriman.</p>
                  {deleteAction === "delivered" && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={deliveredDate}
                        onChange={(e) => setDeliveredDate(e.target.value)}
                        className="h-8 text-xs w-auto"
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(false)}>Batal</Button>
            <Button
              variant={deleteAction === "delivered" ? "default" : "destructive"}
              size="sm"
              onClick={handleDeleteCard}
              disabled={deletingCard}
            >
              {deletingCard && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {deleteAction === "delivered" ? "Pindah ke Delivered" : "Hapus dari Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>

      {/* Urgent/Cito Reason Dialog */}
      <Dialog open={!!urgentReasonDialog} onOpenChange={() => setUrgentReasonDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Alasan Label {urgentReasonDialog?.labelName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Jelaskan alasan mengapa card ini ditandai <span className="font-semibold text-foreground">{urgentReasonDialog?.labelName}</span>:
            </p>
            <Textarea
              value={urgentReason}
              onChange={e => setUrgentReason(e.target.value)}
              placeholder={`Contoh: Barang dibutuhkan segera oleh customer untuk proyek...`}
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUrgentReasonDialog(null)}>Batal</Button>
            <Button size="sm" onClick={confirmUrgentLabel} disabled={!urgentReason.trim()}>
              Konfirmasi & Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
