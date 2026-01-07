import React, { useState, useRef } from 'react';
import { User, Mail, Shield, Camera, Save, Loader2 } from 'lucide-react';
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
    </div>
  );
}
