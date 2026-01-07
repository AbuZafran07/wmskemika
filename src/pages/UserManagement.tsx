import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, MoreHorizontal, Edit, Trash2, Key, Loader2, Shield, UserCheck, UserX, Upload, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface UserData {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
  created_at: string;
}

const roleLabels: Record<string, { en: string; id: string; color: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  super_admin: { en: 'Super Admin', id: 'Super Admin', color: 'destructive' },
  admin: { en: 'Admin', id: 'Admin', color: 'default' },
  finance: { en: 'Finance', id: 'Keuangan', color: 'secondary' },
  purchasing: { en: 'Purchasing', id: 'Pembelian', color: 'secondary' },
  warehouse: { en: 'Warehouse', id: 'Gudang', color: 'secondary' },
  sales: { en: 'Sales', id: 'Penjualan', color: 'secondary' },
  viewer: { en: 'Viewer', id: 'Viewer', color: 'outline' },
};

const allRoles: UserRole[] = ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'];

export default function UserManagement() {
  const { t, language } = useLanguage();
  const { user: currentUser, hasPermission } = useAuth();
  
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isBulkImportDialogOpen, setIsBulkImportDialogOpen] = useState(false);
  
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserData | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserData | null>(null);
  
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('viewer');
  const [formIsActive, setFormIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  
  // Bulk import state
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvData, setCsvData] = useState<{ email: string; password: string; full_name: string; role: string }[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkImportResults, setBulkImportResults] = useState<{ row: number; email: string; success: boolean; error?: string }[] | null>(null);

  // Check if user is super_admin
  if (!hasPermission(['super_admin'])) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Shield className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">
          {language === 'en' ? 'Access Denied' : 'Akses Ditolak'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'en' 
            ? 'Only Super Admin can access this page.' 
            : 'Hanya Super Admin yang dapat mengakses halaman ini.'
          }
        </p>
      </div>
    );
  }

  const isValidEmail = (email: string) => {
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed) && trimmed.length <= 255;
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 12) {
      return language === 'en' ? 'Password must be at least 12 characters' : 'Password minimal 12 karakter';
    }
    if (!/[a-z]/.test(password)) {
      return language === 'en' ? 'Password must contain at least one lowercase letter' : 'Password harus mengandung minimal 1 huruf kecil';
    }
    if (!/[A-Z]/.test(password)) {
      return language === 'en' ? 'Password must contain at least one uppercase letter' : 'Password harus mengandung minimal 1 huruf besar';
    }
    if (!/\d/.test(password)) {
      return language === 'en' ? 'Password must contain at least one number' : 'Password harus mengandung minimal 1 angka';
    }
    if (!/[!@#$%^&*()\-_+=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
      return language === 'en'
        ? 'Password must contain at least one special character'
        : 'Password harus mengandung minimal 1 karakter spesial (!@#$%^&*-_)';
    }
    return null;
  };

  const getInvokeHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const extractInvokeErrorMessage = async (err: unknown) => {
    if (err instanceof FunctionsHttpError || err instanceof FunctionsRelayError) {
      const res = err.context;
      try {
        const cloned = res.clone();
        const contentType = cloned.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          const body = await cloned.json();
          if (body?.error && typeof body.error === 'string') return body.error;
        } else {
          const text = (await cloned.text()).trim();
          if (text) return text;
        }
      } catch {
        // ignore
      }
    }

    if (err instanceof Error) return err.message;
    return language === 'en' ? 'Operation failed' : 'Operasi gagal';
  };

  const invokeUserManagement = async (payload: Record<string, unknown>) => {
    const headers = await getInvokeHeaders();
    const { data, error } = await supabase.functions.invoke('user-management', {
      body: payload,
      headers,
    });

    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await invokeUserManagement({ action: 'list' });
      setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      toast.error(await extractInvokeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission(['super_admin'])) {
      fetchUsers();
    }
  }, []);

  const resetForm = () => {
    setFormEmail('');
    setFormPassword('');
    setFormFullName('');
    setFormRole('viewer');
    setFormIsActive(true);
    setEditingUser(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (user: UserData) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormFullName(user.full_name);
    setFormRole(user.roles[0] as UserRole || 'viewer');
    setFormIsActive(user.is_active);
    setIsDialogOpen(true);
  };

  const handleDelete = (user: UserData) => {
    setDeletingUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleResetPassword = (user: UserData) => {
    setResetPasswordUser(user);
    setNewPassword('');
    setIsResetPasswordDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formRole) {
      toast.error(language === 'en' ? 'Role is required' : 'Role wajib dipilih');
      return;
    }

    // Create
    if (!editingUser) {
      const email = formEmail.trim();
      const password = formPassword;

      if (!email || !password) {
        toast.error(language === 'en' ? 'Email and password are required' : 'Email dan password wajib diisi');
        return;
      }

      if (!isValidEmail(email)) {
        toast.error(language === 'en' ? 'Invalid email format' : 'Format email tidak valid');
        return;
      }

      const pwdError = validatePassword(password);
      if (pwdError) {
        toast.error(pwdError);
        return;
      }

      setIsSaving(true);
      try {
        await invokeUserManagement({
          action: 'create',
          email,
          password,
          full_name: formFullName,
          role: formRole,
        });

        toast.success(language === 'en' ? 'User created successfully' : 'Pengguna berhasil dibuat');
        setIsDialogOpen(false);
        resetForm();
        fetchUsers();
      } catch (err) {
        toast.error(await extractInvokeErrorMessage(err));
      } finally {
        setIsSaving(false);
      }

      return;
    }

    // Update
    setIsSaving(true);
    try {
      await invokeUserManagement({
        action: 'update',
        user_id: editingUser.id,
        full_name: formFullName,
        role: formRole,
        is_active: formIsActive,
      });

      toast.success(language === 'en' ? 'User updated successfully' : 'Pengguna berhasil diperbarui');
      setIsDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (err) {
      toast.error(await extractInvokeErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;

    try {
      await invokeUserManagement({
        action: 'delete',
        user_id: deletingUser.id,
      });

      toast.success(language === 'en' ? 'User deleted successfully' : 'Pengguna berhasil dihapus');
      fetchUsers();
    } catch (err) {
      toast.error(await extractInvokeErrorMessage(err));
    }

    setIsDeleteDialogOpen(false);
    setDeletingUser(null);
  };

  const confirmResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) return;

    const pwdError = validatePassword(newPassword);
    if (pwdError) {
      toast.error(pwdError);
      return;
    }

    try {
      await invokeUserManagement({
        action: 'reset_password',
        user_id: resetPasswordUser.id,
        new_password: newPassword,
      });

      toast.success(language === 'en' ? 'Password reset successfully' : 'Password berhasil direset');
    } catch (err) {
      toast.error(await extractInvokeErrorMessage(err));
    }

    setIsResetPasswordDialogOpen(false);
    setResetPasswordUser(null);
    setNewPassword('');
  };

  // CSV Import Handlers
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setCsvErrors([language === 'en' ? 'CSV must have header row and at least one data row' : 'CSV harus memiliki baris header dan minimal satu baris data']);
        return;
      }

      const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
      const requiredCols = ['email', 'password', 'role'];
      const missingCols = requiredCols.filter(col => !header.includes(col));
      
      if (missingCols.length > 0) {
        setCsvErrors([`${language === 'en' ? 'Missing required columns' : 'Kolom wajib tidak ditemukan'}: ${missingCols.join(', ')}`]);
        return;
      }

      const emailIdx = header.indexOf('email');
      const passwordIdx = header.indexOf('password');
      const fullNameIdx = header.indexOf('full_name');
      const roleIdx = header.indexOf('role');

      const parsed: { email: string; password: string; full_name: string; role: string }[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const email = (values[emailIdx] || '').trim();
        const password = values[passwordIdx] || '';
        const full_name = fullNameIdx >= 0 ? (values[fullNameIdx] || '') : '';
        const role = values[roleIdx] || '';

        if (!email && !password && !role) continue; // skip empty rows

        if (!email) errors.push(`${language === 'en' ? 'Row' : 'Baris'} ${i + 1}: ${language === 'en' ? 'Email is required' : 'Email wajib diisi'}`);
        if (email && !isValidEmail(email)) errors.push(`${language === 'en' ? 'Row' : 'Baris'} ${i + 1}: ${language === 'en' ? 'Invalid email format' : 'Format email tidak valid'}`);

        if (!password) errors.push(`${language === 'en' ? 'Row' : 'Baris'} ${i + 1}: ${language === 'en' ? 'Password is required' : 'Password wajib diisi'}`);
        if (password) {
          const pwdError = validatePassword(password);
          if (pwdError) errors.push(`${language === 'en' ? 'Row' : 'Baris'} ${i + 1}: ${pwdError}`);
        }

        if (!role) errors.push(`${language === 'en' ? 'Row' : 'Baris'} ${i + 1}: ${language === 'en' ? 'Role is required' : 'Role wajib diisi'}`);
        if (role && !allRoles.includes(role as UserRole)) {
          errors.push(`${language === 'en' ? 'Row' : 'Baris'} ${i + 1}: ${language === 'en' ? 'Invalid role' : 'Role tidak valid'} "${role}"`);
        }

        parsed.push({ email, password, full_name, role });
      }

      setCsvData(parsed);
      setCsvErrors(errors);
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const handleBulkImport = async () => {
    if (csvData.length === 0 || csvErrors.length > 0) return;

    setIsBulkImporting(true);
    setBulkImportResults(null);

    try {
      const data = await invokeUserManagement({
        action: 'bulk_create',
        users: csvData,
      });

      setBulkImportResults(data.results || []);

      const { success, failed } = data.summary;
      if (failed === 0) {
        toast.success(language === 'en' ? `Successfully created ${success} users` : `Berhasil membuat ${success} pengguna`);
      } else {
        toast.warning(language === 'en' ? `Created ${success} users, ${failed} failed` : `Berhasil ${success} pengguna, ${failed} gagal`);
      }

      fetchUsers();
    } catch (err) {
      toast.error(await extractInvokeErrorMessage(err));
    } finally {
      setIsBulkImporting(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.userManagement')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage users and assign roles' : 'Kelola pengguna dan tetapkan role'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setCsvData([]); setCsvErrors([]); setBulkImportResults(null); setIsBulkImportDialogOpen(true); }}>
            <Upload className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Import CSV' : 'Import CSV'}
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
          {language === 'en' ? 'Add User' : 'Tambah Pengguna'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex-1">
            <Input
              placeholder={language === 'en' ? 'Search users...' : 'Cari pengguna...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>{language === 'en' ? 'Created' : 'Dibuat'}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No users found' : 'Tidak ada pengguna ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const primaryRole = user.roles[0] || 'viewer';
                    const roleInfo = roleLabels[primaryRole] || roleLabels.viewer;
                    const isCurrentUser = user.id === currentUser?.id;

                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={roleInfo.color as any}>
                            {language === 'en' ? roleInfo.en : roleInfo.id}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {user.is_active ? (
                            <Badge variant="success" className="gap-1">
                              <UserCheck className="w-3 h-3" />
                              {language === 'en' ? 'Active' : 'Aktif'}
                            </Badge>
                          ) : (
                            <Badge variant="draft" className="gap-1">
                              <UserX className="w-3 h-3" />
                              {language === 'en' ? 'Inactive' : 'Nonaktif'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(user.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="iconSm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(user)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                                <Key className="w-4 h-4 mr-2" />
                                {language === 'en' ? 'Reset Password' : 'Reset Password'}
                              </DropdownMenuItem>
                              {!isCurrentUser && (
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => handleDelete(user)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {t('common.delete')}
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

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser 
                ? (language === 'en' ? 'Edit User' : 'Edit Pengguna')
                : (language === 'en' ? 'Add New User' : 'Tambah Pengguna Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!editingUser && (
              <>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === 'en' 
                      ? 'Min 12 chars, uppercase, lowercase, number & special char (!@#$%^&*)'
                      : 'Min 12 karakter, huruf besar, huruf kecil, angka & karakter khusus (!@#$%^&*)'
                    }
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</Label>
              <Input
                placeholder={language === 'en' ? 'Enter full name' : 'Masukkan nama lengkap'}
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'en' ? 'Select role' : 'Pilih role'} />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {language === 'en' ? roleLabels[role].en : roleLabels[role].id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editingUser && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="is-active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                />
                <Label htmlFor="is-active">{language === 'en' ? 'Active' : 'Aktif'}</Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete User' : 'Hapus Pengguna'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingUser?.email}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingUser?.email}"? Tindakan ini tidak dapat dibatalkan.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Reset Password' : 'Reset Password'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {language === 'en' 
                ? `Set a new password for ${resetPasswordUser?.email}`
                : `Tetapkan password baru untuk ${resetPasswordUser?.email}`
              }
            </p>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'New Password' : 'Password Baru'}</Label>
              <Input
                type="password"
                placeholder={language === 'en' ? 'Enter new password' : 'Masukkan password baru'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmResetPassword} disabled={!newPassword}>
              {language === 'en' ? 'Reset Password' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={isBulkImportDialogOpen} onOpenChange={setIsBulkImportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              {language === 'en' ? 'Bulk Import Users from CSV' : 'Import User Massal dari CSV'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* CSV Format Info */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">{language === 'en' ? 'CSV Format' : 'Format CSV'}</h4>
              <p className="text-sm text-muted-foreground mb-2">
                {language === 'en' 
                  ? 'Required columns: email, password, role. Optional: full_name'
                  : 'Kolom wajib: email, password, role. Opsional: full_name'
                }
              </p>
              <code className="block p-2 bg-background rounded text-xs">
                email,password,full_name,role<br/>
                user1@example.com,SecurePass123!,John Doe,admin<br/>
                user2@example.com,SecurePass123!,Jane Smith,sales
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                {language === 'en' 
                  ? `Valid roles: ${allRoles.join(', ')}`
                  : `Role valid: ${allRoles.join(', ')}`
                }
              </p>
            </div>

            {/* Upload */}
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Upload CSV File' : 'Upload File CSV'}</Label>
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept=".csv"
                  ref={csvInputRef}
                  onChange={handleCsvUpload}
                />
              </div>
            </div>

            {/* Validation Errors */}
            {csvErrors.length > 0 && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <h4 className="font-medium text-destructive flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  {language === 'en' ? 'Validation Errors' : 'Error Validasi'}
                </h4>
                <ul className="text-sm text-destructive space-y-1">
                  {csvErrors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {csvErrors.length > 10 && (
                    <li>...{language === 'en' ? `and ${csvErrors.length - 10} more errors` : `dan ${csvErrors.length - 10} error lainnya`}</li>
                  )}
                </ul>
              </div>
            )}

            {/* Preview */}
            {csvData.length > 0 && csvErrors.length === 0 && !bulkImportResults && (
              <div>
                <h4 className="font-medium mb-2">
                  {language === 'en' ? `Preview (${csvData.length} users)` : `Preview (${csvData.length} pengguna)`}
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>{language === 'en' ? 'Full Name' : 'Nama Lengkap'}</TableHead>
                        <TableHead>Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>{row.full_name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{row.role}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {csvData.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            ...{language === 'en' ? `and ${csvData.length - 10} more rows` : `dan ${csvData.length - 10} baris lainnya`}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Results */}
            {bulkImportResults && (
              <div>
                <h4 className="font-medium mb-2">{language === 'en' ? 'Import Results' : 'Hasil Import'}</h4>
                <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">{language === 'en' ? 'Row' : 'Baris'}</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>{language === 'en' ? 'Message' : 'Pesan'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkImportResults.map((result, i) => (
                        <TableRow key={i}>
                          <TableCell>{result.row}</TableCell>
                          <TableCell>{result.email}</TableCell>
                          <TableCell className="text-center">
                            {result.success ? (
                              <CheckCircle className="w-5 h-5 text-success mx-auto" />
                            ) : (
                              <XCircle className="w-5 h-5 text-destructive mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className={result.success ? 'text-success' : 'text-destructive'}>
                            {result.success 
                              ? (language === 'en' ? 'Created successfully' : 'Berhasil dibuat')
                              : result.error
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkImportDialogOpen(false)}>
              {bulkImportResults ? (language === 'en' ? 'Close' : 'Tutup') : t('common.cancel')}
            </Button>
            {!bulkImportResults && (
              <Button 
                onClick={handleBulkImport} 
                disabled={csvData.length === 0 || csvErrors.length > 0 || isBulkImporting}
              >
                {isBulkImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {language === 'en' ? `Import ${csvData.length} Users` : `Import ${csvData.length} Pengguna`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
