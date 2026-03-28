import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Holiday {
  date: string; // yyyy-MM-dd
  name: string;
}

let cachedHolidays: Holiday[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function useHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>(cachedHolidays || []);
  const [loading, setLoading] = useState(!cachedHolidays);

  useEffect(() => {
    const now = Date.now();
    if (cachedHolidays && (now - cacheTimestamp) < CACHE_TTL) {
      setHolidays(cachedHolidays);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from('national_holidays')
        .select('holiday_date, name')
        .gte('year', currentYear)
        .lte('year', currentYear + 1)
        .order('holiday_date');

      if (!error && data) {
        const mapped = (data as any[]).map(h => ({
          date: h.holiday_date,
          name: h.name,
        }));
        cachedHolidays = mapped;
        cacheTimestamp = Date.now();
        setHolidays(mapped);
      }
      setLoading(false);
    };

    fetch();
  }, []);

  const isHoliday = (date: Date): string | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const found = holidays.find(h => h.date === dateStr);
    return found ? found.name : null;
  };

  const invalidateCache = () => {
    cachedHolidays = null;
    cacheTimestamp = 0;
  };

  return { holidays, loading, isHoliday, invalidateCache };
}
