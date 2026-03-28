import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  year: number;
}

export default function HolidayManager() {
  const { language } = useLanguage();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  useEffect(() => {
    fetchHolidays();
  }, [selectedYear]);

  const fetchHolidays = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('national_holidays')
      .select('*')
      .eq('year', parseInt(selectedYear))
      .order('holiday_date', { ascending: true });

    if (error) {
      console.error('Error fetching holidays:', error);
      toast.error('Gagal memuat data hari libur');
    } else {
      setHolidays((data as any[]) || []);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newDate || !newName.trim()) {
      toast.error('Tanggal dan nama hari libur wajib diisi');
      return;
    }

    setAdding(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('national_holidays')
      .insert({
        holiday_date: newDate,
        name: newName.trim(),
        created_by: userData.user?.id,
      } as any);

    if (error) {
      if (error.code === '23505') {
        toast.error('Hari libur dengan tanggal dan nama ini sudah ada');
      } else {
        console.error('Error adding holiday:', error);
        toast.error('Gagal menambahkan hari libur');
      }
    } else {
      toast.success('Hari libur berhasil ditambahkan');
      setNewDate('');
      setNewName('');
      fetchHolidays();
    }
    setAdding(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus hari libur "${name}"?`)) return;

    const { error } = await supabase
      .from('national_holidays')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting holiday:', error);
      toast.error('Gagal menghapus hari libur');
    } else {
      toast.success('Hari libur berhasil dihapus');
      fetchHolidays();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <CalendarDays className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-lg">
              {language === 'en' ? 'National Holidays' : 'Hari Libur Nasional'}
            </CardTitle>
            <CardDescription>
              {language === 'en'
                ? 'Manage national holidays for delivery calendar'
                : 'Kelola hari libur nasional untuk kalender pengiriman'
              }
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Year selector */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Tahun:</Label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            ({holidays.length} hari libur)
          </span>
        </div>

        {/* Add new holiday */}
        <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-lg border bg-muted/30">
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="sm:w-44"
            placeholder="Tanggal"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama hari libur"
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={adding} size="sm" className="gap-1">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Tambah
          </Button>
        </div>

        {/* Holiday list */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Belum ada data hari libur untuk tahun {selectedYear}
          </div>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {holidays.map((h) => {
              const date = new Date(h.holiday_date + 'T00:00:00');
              return (
                <div key={h.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-24 flex-shrink-0">
                      {format(date, 'dd MMM yyyy', { locale: idLocale })}
                    </span>
                    <span className="text-sm font-medium text-destructive">{h.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(h.id, h.name)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
