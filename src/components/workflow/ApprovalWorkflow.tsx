import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, Shield, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ApprovalWorkflowProps {
  type: 'plan_order' | 'sales_order';
  orderId: string;
  orderNumber: string;
  currentStatus: string;
  onStatusChange: () => void;
}

// Roles that can approve
const APPROVAL_ROLES: UserRole[] = ['super_admin', 'admin'];

export function ApprovalWorkflow({
  type,
  orderId,
  orderNumber,
  currentStatus,
  onStatusChange,
}: ApprovalWorkflowProps) {
  const { language } = useLanguage();
  const { user, hasPermission } = useAuth();
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allowAdminApprove, setAllowAdminApprove] = useState(false);

  // Check settings for allow_admin_approve
  useEffect(() => {
    const checkSettings = async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'allow_admin_approve')
        .single();
      
      if (data?.value) {
        setAllowAdminApprove(data.value === true);
      }
    };
    checkSettings();
  }, []);

  const canApprove = () => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'admin' && allowAdminApprove) return true;
    return false;
  };

  const tableName = type === 'plan_order' ? 'plan_order_headers' : 'sales_order_headers';

  const handleApprove = async () => {
    if (!canApprove()) {
      toast.error(language === 'en' ? 'You do not have permission to approve' : 'Anda tidak memiliki izin untuk menyetujui');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase
      .from(tableName)
      .update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? `${orderNumber} approved successfully` : `${orderNumber} berhasil disetujui`);
      onStatusChange();
    }

    setIsLoading(false);
    setIsApproveDialogOpen(false);
  };

  const handleReject = async () => {
    if (!canApprove()) {
      toast.error(language === 'en' ? 'You do not have permission to reject' : 'Anda tidak memiliki izin untuk menolak');
      return;
    }

    if (!rejectReason.trim()) {
      toast.error(language === 'en' ? 'Please provide a rejection reason' : 'Harap berikan alasan penolakan');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase
      .from(tableName)
      .update({
        status: 'cancelled',
        notes: rejectReason,
      })
      .eq('id', orderId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? `${orderNumber} rejected` : `${orderNumber} ditolak`);
      onStatusChange();
    }

    setIsLoading(false);
    setIsRejectDialogOpen(false);
    setRejectReason('');
  };

  if (currentStatus !== 'draft') {
    return null;
  }

  return (
    <>
      <div className="flex gap-2">
        {canApprove() && (
          <>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-success border-success hover:bg-success/10"
              onClick={() => setIsApproveDialogOpen(true)}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              {language === 'en' ? 'Approve' : 'Setujui'}
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => setIsRejectDialogOpen(true)}
            >
              <XCircle className="w-4 h-4 mr-1" />
              {language === 'en' ? 'Reject' : 'Tolak'}
            </Button>
          </>
        )}
        {!canApprove() && (
          <Badge variant="pending" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {language === 'en' ? 'Pending Approval' : 'Menunggu Persetujuan'}
          </Badge>
        )}
      </div>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'en' ? 'Approve Order' : 'Setujui Order'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to approve ${orderNumber}? This action cannot be undone.`
                : `Apakah Anda yakin ingin menyetujui ${orderNumber}? Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Approve' : 'Setujui'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Reject Order' : 'Tolak Order'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? `Please provide a reason for rejecting ${orderNumber}.`
                : `Harap berikan alasan untuk menolak ${orderNumber}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Rejection Reason' : 'Alasan Penolakan'} *</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter reason...' : 'Masukkan alasan...'}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)} disabled={isLoading}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Reject' : 'Tolak'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Component to display approval info
export function ApprovalInfo({ 
  status, 
  approvedBy, 
  approvedAt 
}: { 
  status: string; 
  approvedBy: string | null; 
  approvedAt: string | null;
}) {
  const { language } = useLanguage();
  const [approverName, setApproverName] = useState<string | null>(null);

  useEffect(() => {
    const fetchApprover = async () => {
      if (!approvedBy) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', approvedBy)
        .single();
      
      if (data) {
        setApproverName(data.full_name || data.email);
      }
    };

    fetchApprover();
  }, [approvedBy]);

  if (status !== 'approved' || !approvedAt) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Shield className="w-4 h-4 text-success" />
      <span>
        {language === 'en' ? 'Approved by' : 'Disetujui oleh'} {approverName || '-'} 
        {' '}
        {language === 'en' ? 'on' : 'pada'} {new Date(approvedAt).toLocaleDateString('id-ID')}
      </span>
    </div>
  );
}
