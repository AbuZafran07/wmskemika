import React, { useState, useRef } from 'react';
import { User, Mail, Shield, Camera, Save, Loader2, Lock, Eye, EyeOff, FileSignature, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ImageCropper } from '@/components/ImageCropper';
import { SignatureCropper } from '@/components/SignatureCropper';
import { validateImageFile, formatFileSize } from '@/lib/imageUtils';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { language } = useLanguage();
  const [fullName, setFullName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Signature state
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signaturePath, setSignaturePath] = useState<string | null>(null);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [isDeletingSignature, setIsDeletingSignature] = useState(false);
  const [selectedSignatureFile, setSelectedSignatureFile] = useState<File | null>(null);
  const [showSignatureCropper, setShowSignatureCropper] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  // Get signed URL for avatar on mount
  React.useEffect(() => {
    const getAvatarUrl = async () => {
      if (user?.avatar) {
        // If it's already a full URL, use it directly
        if (user.avatar.startsWith('http')) {
          setAvatarUrl(user.avatar);
          return;
        }
        // Otherwise get signed URL
        const { data } = await supabase.storage
          .from('avatars')
          .createSignedUrl(user.avatar, 3600);
        if (data?.signedUrl) {
          setAvatarUrl(data.signedUrl);
        }
      }
    };
    getAvatarUrl();
  }, [user?.avatar]);

  // Get user signature on mount
  React.useEffect(() => {
    const getSignature = async () => {
      if (!user?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('user_signatures')
          .select('signature_path')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching signature:', error);
          return;
        }

        if (data?.signature_path) {
          setSignaturePath(data.signature_path);
          // Get signed URL for signature
          const { data: urlData } = await supabase.storage
            .from('signatures')
            .createSignedUrl(data.signature_path, 3600);
          if (urlData?.signedUrl) {
            setSignatureUrl(urlData.signedUrl);
          }
        }
      } catch (err) {
        console.error('Error loading signature:', err);
      }
    };
    getSignature();
  }, [user?.id]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    // Validate file
    const validation = validateImageFile(file, language as 'en' | 'id');
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    // Show cropper
    setSelectedFile(file);
    setShowCropper(true);
    
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    if (!user?.id) return;

    setIsUploading(true);
    try {
      const fileName = `${user.id}/avatar.webp`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { 
          upsert: true,
          contentType: 'image/webp'
        });

      if (uploadError) throw uploadError;

      // Update profile with avatar path
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: fileName, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Get new signed URL with cache busting
      const { data } = await supabase.storage
        .from('avatars')
        .createSignedUrl(fileName, 3600);
      
      if (data?.signedUrl) {
        setAvatarUrl(data.signedUrl + '&t=' + Date.now());
      }

      // Refresh user context
      await refreshUser();

      const sizeInfo = formatFileSize(blob.size);
      toast.success(
        language === 'en' 
          ? `Photo updated successfully (${sizeInfo})` 
          : `Foto berhasil diperbarui (${sizeInfo})`
      );
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error(language === 'en' ? 'Failed to upload photo' : 'Gagal mengunggah foto');
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
    }
  };

  // Handle signature file selection - show cropper
  const handleSignatureSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    // Validate file type and size
    const validation = validateImageFile(file, language as 'en' | 'id');
    if (!validation.valid) {
      toast.error(validation.error);
      event.target.value = '';
      return;
    }

    // Show cropper instead of direct upload
    setSelectedSignatureFile(file);
    setShowSignatureCropper(true);
    
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  // Handle cropped signature upload
  const handleSignatureCropComplete = async (blob: Blob) => {
    if (!user?.id) return;

    setIsUploadingSignature(true);
    try {
      const fileName = `${user.id}/signature.png`;

      // Upload cropped signature to storage
      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob, { 
          upsert: true,
          contentType: blob.type || 'image/png'
        });

      if (uploadError) throw uploadError;

      // Upsert signature record
      const { error: upsertError } = await supabase
        .from('user_signatures')
        .upsert({
          user_id: user.id,
          signature_path: fileName,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (upsertError) throw upsertError;

      // Get new signed URL
      const { data } = await supabase.storage
        .from('signatures')
        .createSignedUrl(fileName, 3600);
      
      if (data?.signedUrl) {
        setSignatureUrl(data.signedUrl + '&t=' + Date.now());
        setSignaturePath(fileName);
      }

      const sizeInfo = formatFileSize(blob.size);
      toast.success(
        language === 'en' 
          ? `Signature uploaded successfully (${sizeInfo})` 
          : `Tanda tangan berhasil diunggah (${sizeInfo})`
      );
    } catch (error) {
      console.error('Error uploading signature:', error);
      toast.error(language === 'en' ? 'Failed to upload signature' : 'Gagal mengunggah tanda tangan');
    } finally {
      setIsUploadingSignature(false);
      setSelectedSignatureFile(null);
    }
  };

  const handleDeleteSignature = async () => {
    if (!user?.id || !signaturePath) return;

    setIsDeletingSignature(true);
    try {
      // Delete from storage
      const { error: deleteStorageError } = await supabase.storage
        .from('signatures')
        .remove([signaturePath]);

      if (deleteStorageError) {
        console.error('Storage delete error:', deleteStorageError);
      }

      // Delete from database
      const { error: deleteDbError } = await supabase
        .from('user_signatures')
        .delete()
        .eq('user_id', user.id);

      if (deleteDbError) throw deleteDbError;

      setSignatureUrl(null);
      setSignaturePath(null);

      toast.success(
        language === 'en' 
          ? 'Signature deleted successfully' 
          : 'Tanda tangan berhasil dihapus'
      );
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast.error(language === 'en' ? 'Failed to delete signature' : 'Gagal menghapus tanda tangan');
    } finally {
      setIsDeletingSignature(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      await refreshUser();
      toast.success(language === 'en' ? 'Profile updated successfully' : 'Profil berhasil diperbarui');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(language === 'en' ? 'Failed to update profile' : 'Gagal memperbarui profil');
    }
    setIsSaving(false);
  };

  const handleChangePassword = async () => {
    // Validate inputs
    if (!currentPassword) {
      toast.error(language === 'en' ? 'Please enter your current password' : 'Masukkan password saat ini');
      return;
    }
    if (!newPassword) {
      toast.error(language === 'en' ? 'Please enter a new password' : 'Masukkan password baru');
      return;
    }
    if (newPassword.length < 6) {
      toast.error(language === 'en' ? 'Password must be at least 6 characters' : 'Password minimal 6 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(language === 'en' ? 'Passwords do not match' : 'Password tidak cocok');
      return;
    }
    if (currentPassword === newPassword) {
      toast.error(language === 'en' ? 'New password must be different from current password' : 'Password baru harus berbeda dari password saat ini');
      return;
    }

    setIsChangingPassword(true);
    try {
      // First verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword
      });

      if (signInError) {
        toast.error(language === 'en' ? 'Current password is incorrect' : 'Password saat ini salah');
        setIsChangingPassword(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      toast.success(language === 'en' ? 'Password changed successfully' : 'Password berhasil diubah');
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error(language === 'en' ? 'Failed to change password' : 'Gagal mengubah password');
    }
    setIsChangingPassword(false);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'default';
      case 'admin': return 'info';
      case 'warehouse': return 'success';
      case 'sales': return 'warning';
      case 'finance': return 'secondary';
      case 'purchasing': return 'outline';
      default: return 'secondary';
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, { en: string; id: string }> = {
      super_admin: { en: 'Super Admin', id: 'Super Admin' },
      admin: { en: 'Admin', id: 'Admin' },
      warehouse: { en: 'Warehouse', id: 'Gudang' },
      sales: { en: 'Sales', id: 'Sales' },
      finance: { en: 'Finance', id: 'Keuangan' },
      purchasing: { en: 'Purchasing', id: 'Pembelian' },
      viewer: { en: 'Viewer', id: 'Viewer' },
    };
    return labels[role]?.[language] || role;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display">
          {language === 'en' ? 'My Profile' : 'Profil Saya'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'en' ? 'Manage your account information' : 'Kelola informasi akun Anda'}
        </p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>{language === 'en' ? 'Profile Information' : 'Informasi Profil'}</CardTitle>
          <CardDescription>
            {language === 'en' 
              ? 'Update your personal information here'
              : 'Perbarui informasi pribadi Anda di sini'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar with Upload */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="w-20 h-20">
                <AvatarImage src={avatarUrl || undefined} alt={user?.name} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{user?.name}</h3>
              <Badge variant={getRoleBadgeVariant(user?.role || '')}>
                {getRoleLabel(user?.role || '')}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">
                {language === 'en' ? 'Click photo to change' : 'Klik foto untuk mengubah'}
              </p>
            </div>
          </div>

          {/* Image Cropper Dialog */}
          <ImageCropper
            open={showCropper}
            onClose={() => {
              setShowCropper(false);
              setSelectedFile(null);
            }}
            file={selectedFile}
            onCropComplete={handleCropComplete}
            aspectRatio={1}
            outputSize={256}
          />

          {/* Form */}
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {language === 'en' ? 'Full Name' : 'Nama Lengkap'}
                </div>
              </Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={language === 'en' ? 'Enter your full name' : 'Masukkan nama lengkap'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </div>
              </Label>
              <Input
                id="email"
                value={user?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                {language === 'en' 
                  ? 'Email cannot be changed. Contact Super Admin if needed.'
                  : 'Email tidak dapat diubah. Hubungi Super Admin jika diperlukan.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  {language === 'en' ? 'Role' : 'Peran'}
                </div>
              </Label>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                <Badge variant={getRoleBadgeVariant(user?.role || '')}>
                  {getRoleLabel(user?.role || '')}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {language === 'en' 
                    ? 'Role is assigned by Super Admin'
                    : 'Peran ditetapkan oleh Super Admin'}
                </span>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {language === 'en' ? 'Save Changes' : 'Simpan Perubahan'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Signature Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" />
            {language === 'en' ? 'Digital Signature' : 'Tanda Tangan Digital'}
          </CardTitle>
          <CardDescription>
            {language === 'en' 
              ? 'Upload your signature for document approval'
              : 'Unggah tanda tangan Anda untuk persetujuan dokumen'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {signatureUrl ? (
            <div className="space-y-4">
              {/* Signature Preview */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground mb-2">
                  {language === 'en' ? 'Current Signature:' : 'Tanda Tangan Saat Ini:'}
                </p>
                <div className="flex items-center justify-center bg-white rounded-lg p-4 min-h-[120px]">
                  <img 
                    src={signatureUrl} 
                    alt="Signature" 
                    className="max-h-[100px] object-contain"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => signatureInputRef.current?.click()}
                  disabled={isUploadingSignature}
                >
                  {isUploadingSignature ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {language === 'en' ? 'Replace' : 'Ganti'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteSignature}
                  disabled={isDeletingSignature}
                >
                  {isDeletingSignature ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  {language === 'en' ? 'Delete' : 'Hapus'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Upload Area */}
              <div 
                onClick={() => signatureInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                {isUploadingSignature ? (
                  <Loader2 className="w-8 h-8 mx-auto text-muted-foreground animate-spin" />
                ) : (
                  <FileSignature className="w-8 h-8 mx-auto text-muted-foreground" />
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  {language === 'en' 
                    ? 'Click to upload your signature'
                    : 'Klik untuk mengunggah tanda tangan Anda'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === 'en'
                    ? 'PNG, JPG, WebP • Max 5MB • Auto crop & resize'
                    : 'PNG, JPG, WebP • Maks 5MB • Crop & resize otomatis'}
                </p>
              </div>
            </div>
          )}

          <input
            ref={signatureInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleSignatureSelect}
          />

          {/* Signature Cropper Dialog */}
          <SignatureCropper
            open={showSignatureCropper}
            onClose={() => {
              setShowSignatureCropper(false);
              setSelectedSignatureFile(null);
            }}
            file={selectedSignatureFile}
            onCropComplete={handleSignatureCropComplete}
          />

          <p className="text-xs text-muted-foreground">
            {language === 'en' 
              ? 'This signature will be used when you approve Purchase Orders and Sales Orders.'
              : 'Tanda tangan ini akan digunakan saat Anda menyetujui Purchase Order dan Sales Order.'}
          </p>
        </CardContent>
      </Card>

      {/* Change Password Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {language === 'en' ? 'Change Password' : 'Ubah Password'}
          </CardTitle>
          <CardDescription>
            {language === 'en' 
              ? 'Update your password to keep your account secure'
              : 'Perbarui password untuk menjaga keamanan akun Anda'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="currentPassword">
              {language === 'en' ? 'Current Password' : 'Password Saat Ini'}
            </Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={language === 'en' ? 'Enter current password' : 'Masukkan password saat ini'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">
              {language === 'en' ? 'New Password' : 'Password Baru'}
            </Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={language === 'en' ? 'Enter new password' : 'Masukkan password baru'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {language === 'en' ? 'Minimum 6 characters' : 'Minimal 6 karakter'}
            </p>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              {language === 'en' ? 'Confirm New Password' : 'Konfirmasi Password Baru'}
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={language === 'en' ? 'Confirm new password' : 'Konfirmasi password baru'}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Change Password Button */}
          <div className="flex justify-end pt-2">
            <Button 
              onClick={handleChangePassword} 
              disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
              variant="secondary"
            >
              {isChangingPassword ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              {language === 'en' ? 'Change Password' : 'Ubah Password'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
