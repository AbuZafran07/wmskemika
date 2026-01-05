import React, { useState } from 'react';
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

export default function Profile() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [fullName, setFullName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!user?.id) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

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
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">{user?.name}</h3>
              <Badge variant={getRoleBadgeVariant(user?.role || '')}>
                {getRoleLabel(user?.role || '')}
              </Badge>
            </div>
          </div>

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
