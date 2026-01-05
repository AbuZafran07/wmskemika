import React, { useState, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Edit, Trash2, Key, Loader2, Shield, UserCheck, UserX } from 'lucide-react';
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

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('user-management', {
        body: { action: 'list' }
      });

      if (error) throw error;
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error(language === 'en' ? 'Failed to load users' : 'Gagal memuat pengguna');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
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
    if (!editingUser && (!formEmail || !formPassword)) {
      toast.error(language === 'en' ? 'Email and password are required' : 'Email dan password wajib diisi');
      return;
    }

    if (!formRole) {
      toast.error(language === 'en' ? 'Role is required' : 'Role wajib dipilih');
      return;
    }

    setIsSaving(true);

    try {
      if (editingUser) {
        // Update user
        const { error } = await supabase.functions.invoke('user-management', {
          body: {
            action: 'update',
            user_id: editingUser.id,
            full_name: formFullName,
            role: formRole,
            is_active: formIsActive
          }
        });

        if (error) throw error;
        toast.success(language === 'en' ? 'User updated successfully' : 'Pengguna berhasil diperbarui');
      } else {
        // Create user
        const { error } = await supabase.functions.invoke('user-management', {
          body: {
            action: 'create',
            email: formEmail,
            password: formPassword,
            full_name: formFullName,
            role: formRole
          }
        });

        if (error) throw error;
        toast.success(language === 'en' ? 'User created successfully' : 'Pengguna berhasil dibuat');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Operation failed';
      toast.error(message);
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;

    try {
      const { error } = await supabase.functions.invoke('user-management', {
        body: {
          action: 'delete',
          user_id: deletingUser.id
        }
      });

      if (error) throw error;
      toast.success(language === 'en' ? 'User deleted successfully' : 'Pengguna berhasil dihapus');
      fetchUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete user';
      toast.error(message);
    }

    setIsDeleteDialogOpen(false);
    setDeletingUser(null);
  };

  const confirmResetPassword = async () => {
    if (!resetPasswordUser || !newPassword) return;

    try {
      const { error } = await supabase.functions.invoke('user-management', {
        body: {
          action: 'reset_password',
          user_id: resetPasswordUser.id,
          new_password: newPassword
        }
      });

      if (error) throw error;
      toast.success(language === 'en' ? 'Password reset successfully' : 'Password berhasil direset');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reset password';
      toast.error(message);
    }

    setIsResetPasswordDialogOpen(false);
    setResetPasswordUser(null);
    setNewPassword('');
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
        <Button onClick={handleAdd}>
          <Plus className="w-4 h-4 mr-2" />
          {language === 'en' ? 'Add User' : 'Tambah Pengguna'}
        </Button>
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
    </div>
  );
}
