import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Truck, ChevronRight, Tag, MessageSquare, Send, X, Plus, Trash2, Paperclip, FileText, Image, Download, Loader2, CheckSquare, AlertTriangle, Calendar, AtSign, Pencil, Check, Search, Eye, ExternalLink } from "lucide-react";
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
  approval_status?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_reason?: string | null;
  label_request_id?: string | null;
  approver_name?: string;
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  // Checklist state
  const [checklists, setChecklists] = useState<ChecklistItem[]>([]);

  // Stock out delivery details
  const [stockOutDetails, setStockOutDetails] = useState<{
    id: string;
    stock_out_number: string;
    delivery_date: string;
    items: {
      product_name: string;
      qty_out: number;
      batch_no: string;
      expired_date: string | null;
    }[];
  }[]>([]);

  // Delivery number (DO) & actual date state
  const [deliveryNumbers, setDeliveryNumbers] = useState<Record<string, string>>({});
  const [deliveryDates, setDeliveryDates] = useState<Record<string, string>>({});
  const [savingDO, setSavingDO] = useState(false);

  // Delete card dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteAction, setDeleteAction] = useState<"remove_from_board" | "delivered" | "archived">("remove_from_board");
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

    const userIds = [...new Set([
      ...data.map(c => c.user_id),
      ...data.map(c => (c as any).approved_by).filter(Boolean),
    ])];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", userIds);

    const mapped: Comment[] = data.map(c => {
      const profile = profiles?.find(p => p.id === c.user_id);
      const approverProfile = (c as any).approved_by ? profiles?.find(p => p.id === (c as any).approved_by) : null;
      return {
        ...c,
        approval_status: (c as any).approval_status,
        approved_by: (c as any).approved_by,
        approved_at: (c as any).approved_at,
        rejected_reason: (c as any).rejected_reason,
        label_request_id: (c as any).label_request_id,
        user_name: profile?.full_name || "Unknown",
        user_avatar: profile?.avatar_url || undefined,
        approver_name: approverProfile?.full_name || undefined,
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

    setAttachments(data.map(a => {
      const { data: publicUrlData } = supabase.storage.from("documents").getPublicUrl(a.file_key);
      return {
        ...a,
        // Always rebuild URL from file_key to avoid stale/expired URLs saved in DB
        url: publicUrlData?.publicUrl || a.url,
        uploader_name: profiles?.find(p => p.id === a.uploaded_by)?.full_name || "Unknown",
      };
    }));
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
        .select("id, stock_out_number, delivery_date, delivery_number, delivery_actual_date")
        .eq("sales_order_id", card.sales_order_id)
        .order("created_at", { ascending: false });

      if (!stockOuts || stockOuts.length === 0) {
        setStockOutDetails([]);
        return;
      }

      const details = [];
      const doNumbers: Record<string, string> = {};
      const doDates: Record<string, string> = {};
      for (const so of stockOuts) {
        const { data: outItems } = await supabase
          .from("stock_out_items")
          .select("qty_out, product:products(name), batch:inventory_batches(batch_no, expired_date)")
          .eq("stock_out_id", so.id);

        details.push({
          id: so.id,
          stock_out_number: so.stock_out_number,
          delivery_date: so.delivery_date,
          items: (outItems || []).map((item: any) => ({
            product_name: item.product?.name || "-",
            qty_out: item.qty_out,
            batch_no: item.batch?.batch_no || "-",
            expired_date: item.batch?.expired_date || null,
          })),
        });
        doNumbers[so.id] = (so as any).delivery_number || '';
        doDates[so.id] = (so as any).delivery_actual_date || '';
      }
      setStockOutDetails(details);
      setDeliveryNumbers(doNumbers);
      setDeliveryDates(doDates);
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

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const abortController = new AbortController();

    const loadPreview = async () => {
      if (!previewAttachment) {
        setPreviewFileUrl(null);
        setPreviewLoading(false);
        setPreviewProgress(0);
        return;
      }

      // Image preview with loading state
      if (isImageFile(previewAttachment.mime_type)) {
        setPreviewLoading(true);
        setPreviewProgress(10);
        const img = new window.Image();
        img.onload = () => {
          if (cancelled) return;
          setPreviewFileUrl(previewAttachment.url);
          setPreviewProgress(100);
          setPreviewLoading(false);
        };
        img.onerror = () => {
          if (cancelled) return;
          setPreviewFileUrl(null);
          setPreviewProgress(0);
          setPreviewLoading(false);
        };
        img.src = previewAttachment.url;
        return;
      }

      if (previewAttachment.mime_type !== "application/pdf") {
        setPreviewFileUrl(null);
        setPreviewLoading(false);
        setPreviewProgress(0);
        return;
      }

      setPreviewLoading(true);
      setPreviewProgress(5);
      try {
        // Try fetch first to show progress for large PDFs
        const response = await fetch(previewAttachment.url, { signal: abortController.signal });
        if (!response.ok) throw new Error("Gagal memuat PDF");

        const totalBytes = Number(response.headers.get("content-length")) || previewAttachment.file_size || 0;
        const reader = response.body?.getReader();

        if (reader) {
          const chunks: BlobPart[] = [];
          let receivedBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              receivedBytes += value.length;
              if (!cancelled && totalBytes > 0) {
                const progress = Math.min(95, Math.round((receivedBytes / totalBytes) * 100));
                setPreviewProgress(progress);
              }
            }
          }

          const pdfBlob = new Blob(chunks, { type: "application/pdf" });
          objectUrl = URL.createObjectURL(pdfBlob);
        } else {
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
        }

        if (!cancelled) {
          setPreviewFileUrl(objectUrl);
          setPreviewProgress(100);
        }
      } catch {
        // Fallback to storage download if direct fetch fails
        try {
          const { data, error } = await supabase.storage
            .from("documents")
            .download(previewAttachment.file_key);
          if (error || !data) throw error;

          objectUrl = URL.createObjectURL(data);
          if (!cancelled) {
            setPreviewFileUrl(objectUrl);
            setPreviewProgress(100);
          }
        } catch {
          if (!cancelled) {
            setPreviewFileUrl(null);
            setPreviewProgress(0);
          }
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      abortController.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewAttachment]);

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
    
    // Check if user is super_admin - if so, directly apply label (no approval needed)
    if (isSuperAdmin) {
      await supabase.from("delivery_card_labels").insert({ delivery_request_id: card.id, label_id: urgentReasonDialog.labelId });
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
      return;
    }
    
    // For non-super_admin: post as pending approval request
    const { error } = await supabase.from("delivery_comments").insert({
      delivery_request_id: card.id,
      user_id: user.id,
      message: `🚨 Permintaan Label "${urgentReasonDialog.labelName}"\nAlasan: ${urgentReason.trim()}`,
      type: "activity",
      approval_status: "pending",
      label_request_id: urgentReasonDialog.labelId,
    } as any);
    
    if (error) {
      toast.error("Gagal mengirim permintaan: " + error.message);
    } else {
      toast.success(`Permintaan label ${urgentReasonDialog.labelName} terkirim, menunggu persetujuan Warehouse/Finance`);
    }
    setUrgentReasonDialog(null);
    setUrgentReason("");
    fetchComments();
  };

  // Approve urgent label request
  const approveUrgentRequest = async (comment: Comment) => {
    if (!card || !user || !comment.label_request_id) return;
    
    // Update comment status
    await supabase.from("delivery_comments").update({
      approval_status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    } as any).eq("id", comment.id);
    
    // Assign the label
    await supabase.from("delivery_card_labels").insert({ 
      delivery_request_id: card.id, 
      label_id: comment.label_request_id 
    });
    
    // Post approval activity
    const labelName = allLabels.find(l => l.id === comment.label_request_id)?.name || "Urgent/Cito";
    await supabase.from("delivery_comments").insert({
      delivery_request_id: card.id,
      user_id: user.id,
      message: `✅ Label "${labelName}" disetujui dan diterapkan.`,
      type: "activity",
    });
    
    toast.success("Permintaan label disetujui");
    fetchLabels();
    fetchComments();
  };

  // Reject urgent label request
  const [rejectDialog, setRejectDialog] = useState<Comment | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  
  const rejectUrgentRequest = async () => {
    if (!rejectDialog || !user || !card) return;
    
    await supabase.from("delivery_comments").update({
      approval_status: "rejected",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      rejected_reason: rejectReason.trim() || null,
    } as any).eq("id", rejectDialog.id);
    
    const labelName = allLabels.find(l => l.id === rejectDialog.label_request_id)?.name || "Urgent/Cito";
    await supabase.from("delivery_comments").insert({
      delivery_request_id: card.id,
      user_id: user.id,
      message: `❌ Permintaan label "${labelName}" ditolak.${rejectReason.trim() ? `\nAlasan: ${rejectReason.trim()}` : ""}`,
      type: "activity",
    });
    
    toast.info("Permintaan label ditolak");
    setRejectDialog(null);
    setRejectReason("");
    fetchComments();
  };

  // Re-request urgent label (for sales after rejection)
  const reRequestUrgent = (comment: Comment) => {
    if (!comment.label_request_id) return;
    const label = allLabels.find(l => l.id === comment.label_request_id);
    if (label) {
      setUrgentReasonDialog({ labelId: label.id, labelName: label.name });
      setUrgentReason("");
    }
  };

  const canApproveUrgent = user?.role && ['super_admin', 'warehouse', 'finance'].includes(user.role);

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

      // Auto-add/remove "Ready to Deliver" label when finance checklist is toggled on approval_delivery
      if (isFinanceChecklist && card.board_status === "approval_delivery") {
        const { data: readyLabel } = await supabase
          .from("delivery_labels")
          .select("id")
          .ilike("name", "%ready to deliver%")
          .maybeSingle();

        if (readyLabel) {
          if (newChecked) {
            // Add label if not already present
            const { data: existing } = await supabase
              .from("delivery_card_labels")
              .select("id")
              .eq("delivery_request_id", card.id)
              .eq("label_id", readyLabel.id)
              .maybeSingle();

            if (!existing) {
              await supabase.from("delivery_card_labels").insert({
                delivery_request_id: card.id,
                label_id: readyLabel.id,
              });
            }

            await supabase.from("delivery_comments").insert({
              delivery_request_id: card.id,
              user_id: user.id,
              message: `🏷️ Label "Ready to Deliver" otomatis ditambahkan setelah Verifikasi Administrasi Finance dicentang.`,
              type: "activity",
            });

            fetchLabels();
          } else {
            // Remove label when unchecked
            await supabase
              .from("delivery_card_labels")
              .delete()
              .eq("delivery_request_id", card.id)
              .eq("label_id", readyLabel.id);

            await supabase.from("delivery_comments").insert({
              delivery_request_id: card.id,
              user_id: user.id,
              message: `🏷️ Label "Ready to Deliver" otomatis dihapus karena Verifikasi Administrasi Finance di-uncheck.`,
              type: "activity",
            });

            fetchLabels();
          }
        }
      }

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
        // Check if delivery number (DO) AND actual date have been filled for all stock outs
        if (stockOutDetails.length > 0) {
          const allDOFilled = stockOutDetails.every(so => {
            const doNum = deliveryNumbers[so.id];
            const doDate = deliveryDates[so.id];
            return doNum && doNum.trim() !== '' && doDate && doDate.trim() !== '';
          });
          if (!allDOFilled) {
            toast.error("Nomor DO dan Tanggal Pengiriman Riil harus diisi terlebih dahulu sebelum card dapat dipindahkan ke Delivered.");
            fetchChecklists();
            return;
          }
        }

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

  // Save delivery number (DO) & actual date to stock_out_headers
  const handleSaveDeliveryNumber = async (stockOutId: string) => {
    if (!user || !card) return;
    const doNumber = deliveryNumbers[stockOutId]?.trim();
    const doDate = deliveryDates[stockOutId]?.trim();
    if (!doNumber) {
      toast.error("Nomor Delivery (DO) tidak boleh kosong");
      return;
    }
    if (!doDate) {
      toast.error("Tanggal Pengiriman Riil tidak boleh kosong");
      return;
    }
    setSavingDO(true);
    try {
      const updateData: Record<string, any> = { delivery_number: doNumber, delivery_actual_date: doDate };
      const { error } = await supabase
        .from("stock_out_headers")
        .update(updateData)
        .eq("id", stockOutId);
      if (error) throw error;

      await supabase.from("delivery_comments").insert({
        delivery_request_id: card.id,
        user_id: user.id,
        message: `📝 Nomor DO: ${doNumber}, Tanggal DO: ${doDate}`,
        type: "activity",
      });

      toast.success("Data DO berhasil disimpan");
      await fetchStockOutDetails();

      // After saving DO, check if all conditions met for auto-move to delivered
      if (PENGIRIMAN_COLUMNS.includes(card.board_status)) {
        const { data: latestChecklists } = await supabase
          .from("delivery_checklists")
          .select("*")
          .eq("delivery_request_id", card.id);

        const allChecklistsDone = latestChecklists && latestChecklists.length > 0 && latestChecklists.every((cl: any) => cl.is_checked);

        // Re-fetch latest stock out data to check all DOs
        const { data: latestStockOuts } = await supabase
          .from("stock_out_headers")
          .select("id, delivery_number, delivery_actual_date")
          .eq("sales_order_id", card.sales_order_id);

        const allDOComplete = latestStockOuts && latestStockOuts.length > 0 && latestStockOuts.every((so: any) => 
          so.delivery_number && so.delivery_number.trim() !== '' && so.delivery_actual_date && so.delivery_actual_date.trim() !== ''
        );

        if (allChecklistsDone && allDOComplete) {
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
            message: `✅ Semua checklist dan data DO lengkap. Card otomatis dipindahkan ke ${targetLabel}.`,
            type: "activity",
          });

          toast.success(`Card otomatis dipindahkan ke ${targetLabel}`);
          onClose();
          return;
        }
      }
    } catch (err: any) {
      toast.error("Gagal menyimpan data DO: " + err.message);
    } finally {
      setSavingDO(false);
    }
  };

  // Delete card handler with options
  const handleDeleteCard = async () => {
    if (!user || !card || !canDeleteCard) return;
    setDeletingCard(true);
    try {
      if (deleteAction === "delivered") {
        // Move to delivered with date note
        const { error: updateError } = await supabase
          .from("delivery_requests")
          .update({
            board_status: "delivered",
            moved_by: user.id,
            moved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            notes: `Sudah terkirim pada ${deliveredDate}. ${card.notes || ""}`.trim(),
          })
          .eq("id", card.id);

        if (updateError) throw updateError;

        const { error: commentError } = await supabase.from("delivery_comments").insert({
          delivery_request_id: card.id,
          user_id: user.id,
          message: `✅ Card dipindahkan ke Delivered. Tanggal pengiriman: ${deliveredDate}`,
          type: "activity",
        });

        if (commentError) throw commentError;

        toast.success("Card dipindahkan ke Delivered");
      } else if (deleteAction === "archived") {
        // Move to archived status
        const { error: updateError } = await supabase
          .from("delivery_requests")
          .update({
            board_status: "archived",
            moved_by: user.id,
            moved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", card.id);

        if (updateError) throw updateError;

        const { error: commentError } = await supabase.from("delivery_comments").insert({
          delivery_request_id: card.id,
          user_id: user.id,
          message: `📦 Card dipindahkan ke Archived.`,
          type: "activity",
        });

        if (commentError) throw commentError;

        toast.success("Card dipindahkan ke Archived");
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
    setUploadProgress(0);
    try {
      const fileExt = file.name.split(".").pop();
      const fileKey = `delivery/${card.id}/${Date.now()}.${fileExt}`;

      // Simulate progress for UX (storage SDK doesn't expose progress)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileKey, file);

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      setUploadProgress(95);

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

      setUploadProgress(100);
      toast.success("File berhasil diupload");
      fetchAttachments();
    } catch (err: any) {
      toast.error("Gagal upload: " + err.message);
    } finally {
      setUploadingFile(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Open attachment (preview for image/pdf, new tab for others)
  const handleOpenAttachment = (att: Attachment) => {
    if (att.mime_type?.startsWith("image/") || att.mime_type === "application/pdf") {
      setPreviewAttachment(att);
      return;
    }
    window.open(att.url, "_blank", "noopener,noreferrer");
  };

  // Download attachment as file (avoid blank tab behavior)
  const handleDownloadAttachment = async (att: Attachment) => {
    setDownloadingAttachmentId(att.id);
    try {
      const { data, error } = await supabase.storage.from("documents").download(att.file_key);
      if (error || !data) throw error || new Error("Gagal download file");

      const objectUrl = URL.createObjectURL(data);
      const fileName = att.file_key.split("/").pop() || "attachment";
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open direct URL
      window.open(att.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  // Delete attachment
  const deleteAttachment = async (att: Attachment) => {
    try {
      const { error: removeError } = await supabase.storage.from("documents").remove([att.file_key]);
      if (removeError) throw removeError;

      const { error: deleteError } = await supabase.from("attachments").delete().eq("id", att.id);
      if (deleteError) throw deleteError;

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
    <>
    <Dialog open={!!card} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl max-h-[100dvh] md:max-h-[90vh] flex flex-col p-0 w-[100vw] md:w-auto fixed top-0 left-0 md:top-[50%] md:left-[50%] translate-x-0 translate-y-0 md:translate-x-[-50%] md:translate-y-[-50%] rounded-none md:rounded-lg h-[100dvh] md:h-auto">
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
              <PopoverContent className="w-80 p-3" align="start" onWheel={(e) => e.stopPropagation()}>
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
                <div className="mb-3 max-h-48 overflow-y-auto overscroll-contain border rounded-md p-1" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                </div>
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

        {/* Two-column layout on desktop, stacked on mobile */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 border-t overflow-y-auto md:overflow-hidden">
          {/* LEFT PANEL - Details, Products, Attachments */}
          <ScrollArea className="flex-1 min-w-0 md:border-r">
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

                {/* Upload Progress Bar */}
                {uploadingFile && (
                  <div className="mb-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Mengupload file... {uploadProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {attachments.length === 0 && !uploadingFile ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Belum ada lampiran</p>
                ) : attachments.length === 0 ? null : (
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-start gap-2 p-2 rounded-lg border bg-muted/30 group">
                        {/* Thumbnail for images */}
                        {isImageFile(att.mime_type) ? (
                          <button
                            onClick={() => setPreviewAttachment(att)}
                            className="w-10 h-10 rounded border border-border overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                          >
                            <img
                              src={att.url}
                              alt={att.file_key.split("/").pop() || ""}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{att.file_key.split("/").pop()}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatSize(att.file_size)} • {att.uploader_name}
                            {att.uploaded_at && ` • ${formatDistanceToNow(new Date(att.uploaded_at), { addSuffix: true, locale: idLocale })}`}
                          </p>
                        </div>
                        {/* View button */}
                        <button
                          onClick={() => handleOpenAttachment(att)}
                          className="text-primary hover:text-primary/80 p-1"
                          title="Lihat"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDownloadAttachment(att)}
                          disabled={downloadingAttachmentId === att.id}
                          className="text-muted-foreground hover:text-foreground p-1 disabled:opacity-50"
                          title="Download"
                        >
                          {downloadingAttachmentId === att.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                        </button>
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

                   {/* DO Number & Date Input - only in pengiriman columns */}
                   {PENGIRIMAN_COLUMNS.includes(card.board_status) && stockOutDetails.length > 0 && (
                     <div className="mt-3 pt-3 border-t space-y-2">
                       <div className="flex items-center gap-2">
                         <Truck className="h-3.5 w-3.5 text-primary" />
                         <span className="text-xs font-semibold">Delivery Order (DO)</span>
                       </div>
                       <p className="text-[10px] text-muted-foreground">
                         Input nomor & tanggal DO riil. Data ini akan tampil sebagai data utama di Outbound Report.
                       </p>
                       {stockOutDetails.map((so) => (
                         <div key={so.id} className="space-y-1.5">
                           <div className="text-[10px] text-muted-foreground font-medium">SO: {so.stock_out_number}</div>
                           <div className="flex items-center gap-2">
                             <Input
                               value={deliveryNumbers[so.id] || ''}
                               onChange={(e) => setDeliveryNumbers(prev => ({ ...prev, [so.id]: e.target.value }))}
                               placeholder="No. DO..."
                               className="h-8 text-xs flex-1"
                               disabled={!canManage || savingDO}
                             />
                             <Input
                               type="date"
                               value={deliveryDates[so.id] || ''}
                               onChange={(e) => setDeliveryDates(prev => ({ ...prev, [so.id]: e.target.value }))}
                               className="h-8 text-xs w-[130px]"
                               disabled={!canManage || savingDO}
                             />
                             <Button
                               size="sm"
                               className="h-8 text-xs px-3"
                               onClick={() => handleSaveDeliveryNumber(so.id)}
                               disabled={!canManage || savingDO || !deliveryNumbers[so.id]?.trim()}
                             >
                               {savingDO ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                               Simpan
                             </Button>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* RIGHT PANEL - Comments & Activity */}
          <div className="w-full md:w-[340px] flex-shrink-0 flex flex-col min-h-0 border-t md:border-t-0">
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
                        comment.type === "activity" && !comment.approval_status && "opacity-70",
                        comment.approval_status === "pending" && "bg-warning/5 rounded-lg p-2 border border-warning/20",
                        comment.approval_status === "approved" && "bg-success/5 rounded-lg p-2 border border-success/20 opacity-80",
                        comment.approval_status === "rejected" && "bg-destructive/5 rounded-lg p-2 border border-destructive/20 opacity-70",
                      )}>
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                          {comment.user_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold">{comment.user_name}</span>
                            {comment.approval_status === "pending" && (
                              <Badge variant="warning" className="text-[9px] h-4 px-1.5">⏳ Menunggu Persetujuan</Badge>
                            )}
                            {comment.approval_status === "approved" && (
                              <Badge variant="approved" className="text-[9px] h-4 px-1.5">✅ Disetujui</Badge>
                            )}
                            {comment.approval_status === "rejected" && (
                              <Badge variant="cancelled" className="text-[9px] h-4 px-1.5">❌ Ditolak</Badge>
                            )}
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
                          <p className={cn("text-xs mt-0.5 whitespace-pre-wrap break-words", comment.type === "activity" && !comment.approval_status && (/(cito|urgent)/i.test(comment.message) ? "text-foreground italic font-bold" : "text-muted-foreground italic"))}>
                            {comment.type === "activity" ? comment.message : renderCommentMessage(comment.message)}
                          </p>
                          
                          {/* Approver info */}
                          {comment.approval_status === "approved" && comment.approver_name && (
                            <p className="text-[10px] text-success mt-1">Disetujui oleh {comment.approver_name}</p>
                          )}
                          {comment.approval_status === "rejected" && (
                            <div className="mt-1">
                              {comment.approver_name && <p className="text-[10px] text-destructive">Ditolak oleh {comment.approver_name}</p>}
                              {comment.rejected_reason && <p className="text-[10px] text-muted-foreground italic">Alasan: {comment.rejected_reason}</p>}
                            </div>
                          )}
                          
                          {/* Approve/Reject buttons for warehouse & finance */}
                          {comment.approval_status === "pending" && canApproveUrgent && (
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" variant="success" className="h-6 text-[10px] px-2" onClick={() => approveUrgentRequest(comment)}>
                                <Check className="h-3 w-3 mr-1" /> Setujui
                              </Button>
                              <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={() => { setRejectDialog(comment); setRejectReason(""); }}>
                                <X className="h-3 w-3 mr-1" /> Tolak
                              </Button>
                            </div>
                          )}
                          
                          {/* Re-request button for sales after rejection */}
                          {comment.approval_status === "rejected" && comment.user_id === user?.id && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 mt-2" onClick={() => reRequestUrgent(comment)}>
                              Ajukan Ulang
                            </Button>
                          )}
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
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="deleteAction"
                  value="archived"
                  checked={deleteAction === "archived"}
                  onChange={() => setDeleteAction("archived")}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium">Pindahkan ke Archived</p>
                  <p className="text-xs text-muted-foreground">Card akan diarsipkan dan tidak tampil di board aktif.</p>
                </div>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(false)}>Batal</Button>
            <Button
              variant={deleteAction === "remove_from_board" ? "destructive" : "default"}
              size="sm"
              onClick={handleDeleteCard}
              disabled={deletingCard}
            >
              {deletingCard && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {deleteAction === "delivered" ? "Pindah ke Delivered" : deleteAction === "archived" ? "Pindah ke Archived" : "Hapus dari Board"}
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
            {!isSuperAdmin && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-2">
                <p className="text-xs text-warning font-medium">⚠️ Permintaan ini akan dikirim untuk persetujuan Warehouse/Finance sebelum label diterapkan.</p>
              </div>
            )}
            <Textarea
              value={urgentReason}
              onChange={e => setUrgentReason(e.target.value)}
              placeholder={`Contoh: Barang dibutuhkan segera oleh customer untuk proyek X, deadline pengiriman besok pagi...`}
              rows={4}
              autoFocus
            />
            <div className="flex items-center justify-between">
              <p className={`text-xs ${urgentReason.trim().length < 60 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {urgentReason.trim().length}/60 karakter minimum
              </p>
              {urgentReason.trim().length >= 60 && (
                <span className="text-xs text-success">✓ Cukup</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUrgentReasonDialog(null)}>Batal</Button>
            <Button size="sm" onClick={confirmUrgentLabel} disabled={urgentReason.trim().length < 60}>
              {isSuperAdmin ? "Konfirmasi & Terapkan" : "Kirim Permintaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Urgent Request Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-destructive" />
              Tolak Permintaan Label
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Berikan alasan penolakan (opsional):
            </p>
            <Textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Alasan penolakan..."
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectDialog(null)}>Batal</Button>
            <Button variant="destructive" size="sm" onClick={rejectUrgentRequest}>
              Tolak Permintaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Dialog */}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Eye className="h-4 w-4 text-primary" />
              <span className="truncate">{previewAttachment?.file_key.split("/").pop()}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Preview lampiran delivery card
            </DialogDescription>
          </DialogHeader>
          <div className="p-4">
            {previewAttachment && isImageFile(previewAttachment.mime_type) ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-full flex items-center justify-center bg-muted/30 rounded-lg p-2 max-h-[70vh] overflow-auto">
                  {previewLoading ? (
                    <div className="w-full h-[70vh] rounded border bg-muted/20 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Memuat gambar...</p>
                      {previewProgress > 0 && previewProgress < 100 && (
                        <p className="text-xs text-muted-foreground">{previewProgress}%</p>
                      )}
                    </div>
                  ) : previewFileUrl ? (
                    <img
                      src={previewFileUrl}
                      alt={previewAttachment.file_key.split("/").pop() || "Preview"}
                      className="max-w-full max-h-[65vh] object-contain rounded"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">Preview gambar tidak tersedia.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.open(previewAttachment.url, "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Buka di Tab Baru
                  </Button>
                </div>
              </div>
            ) : previewAttachment?.mime_type === "application/pdf" ? (
              <div className="flex flex-col items-center gap-3">
                {previewLoading ? (
                  <div className="w-full h-[70vh] rounded border bg-muted/20 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Memuat PDF...</p>
                    {previewProgress > 0 && previewProgress < 100 && (
                      <p className="text-xs text-muted-foreground">{previewProgress}%</p>
                    )}
                  </div>
                ) : previewFileUrl ? (
                  <object
                    data={previewFileUrl}
                    type="application/pdf"
                    className="w-full h-[70vh] rounded border"
                  >
                    <div className="w-full h-[70vh] rounded border bg-muted/20 flex flex-col items-center justify-center gap-2 px-4 text-center">
                      <p className="text-sm text-muted-foreground">Browser tidak mendukung preview PDF inline.</p>
                      <p className="text-xs text-muted-foreground">Silakan buka file di tab baru.</p>
                    </div>
                  </object>
                ) : (
                  <div className="w-full h-[70vh] rounded border bg-muted/20 flex flex-col items-center justify-center gap-2 px-4 text-center">
                    <p className="text-sm text-muted-foreground">Preview PDF tidak bisa ditampilkan.</p>
                    <p className="text-xs text-muted-foreground">Silakan buka file di tab baru.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.open(previewAttachment.url, "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Buka di Tab Baru
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <FileText className="h-16 w-16 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Preview tidak tersedia untuk tipe file ini</p>
                <Button variant="outline" size="sm" onClick={() => window.open(previewAttachment?.url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Buka di Tab Baru
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
