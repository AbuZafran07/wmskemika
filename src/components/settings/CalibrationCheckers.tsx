import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, FlaskConical } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  is_active: boolean | null;
}

const SETTING_KEY = 'calibration_checklist_users';

export default function CalibrationCheckers() {
  const { isSuperAdmin } = usePermissions();
  const canEdit = isSuperAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: profiles }, { data: setting }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, is_active').order('full_name'),
        supabase.from('settings').select('value').eq('key', SETTING_KEY).maybeSingle(),
      ]);
      setUsers((profiles as ProfileRow[]) || []);
      const val = (setting?.value as unknown as string[]) || [];
      setSelected(Array.isArray(val) ? val : []);
      setLoading(false);
    })();
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    const { error } = await supabase
      .from('settings')
      .upsert({ key: SETTING_KEY, value: selected as unknown as any }, { onConflict: 'key' });
    setSaving(false);
    if (error) {
      toast.error('Gagal menyimpan: ' + error.message);
      return;
    }
    toast.success('Daftar petugas checklist kalibrasi disimpan');
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (u.full_name || '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" />
          Petugas Checklist Kalibrasi
        </CardTitle>
        <CardDescription>
          Akun terpilih boleh mencentang checklist dari kolom <b>Scheduled</b> sampai{' '}
          <b>Calibration In Progress</b> (Receive Instrument, SPK Issued, SPK Confirmed, Calibration
          Completed). Super Admin selalu diizinkan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Input
              placeholder="Cari nama atau email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="border rounded-md divide-y max-h-[420px] overflow-auto">
              {filtered.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.includes(u.id)}
                    onCheckedChange={() => toggle(u.id)}
                    disabled={!canEdit}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.full_name || u.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  {u.is_active === false && <Badge variant="secondary">Nonaktif</Badge>}
                </label>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  Tidak ada pengguna.
                </div>
              )}
            </div>
            {canEdit && (
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Simpan Daftar
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}