import React, { useState, useEffect } from 'react';
import { FileWarning, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

interface ExpiringDocument {
  id: string;
  file_key: string;
  module_name: string;
  uploaded_at: string;
  daysUntilDeletion: number;
}

export default function DocumentCleanupWarning() {
  const { language } = useLanguage();
  const [documents, setDocuments] = useState<ExpiringDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExpiringDocuments = async () => {
      // Documents that are between 83-90 days old (will be deleted within 7 days)
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() - 83); // 90 - 7 = 83 days ago

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const { data, error } = await supabase
        .from('attachments')
        .select('id, file_key, module_name, uploaded_at')
        .lt('uploaded_at', warningDate.toISOString())
        .gt('uploaded_at', cutoffDate.toISOString())
        .in('module_name', ['plan_order', 'sales_order', 'stock_adjustment', 'stock_in', 'stock_out'])
        .order('uploaded_at', { ascending: true })
        .limit(20);

      if (error) {
        console.error('Error fetching expiring documents:', error);
        setLoading(false);
        return;
      }

      const docs: ExpiringDocument[] = (data || []).map(d => {
        const uploadedAt = new Date(d.uploaded_at);
        const deleteAt = new Date(uploadedAt);
        deleteAt.setDate(deleteAt.getDate() + 90);
        const now = new Date();
        const daysLeft = Math.ceil((deleteAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: d.id,
          file_key: d.file_key,
          module_name: d.module_name,
          uploaded_at: d.uploaded_at,
          daysUntilDeletion: Math.max(0, daysLeft),
        };
      });

      setDocuments(docs);
      setLoading(false);
    };

    fetchExpiringDocuments();
  }, []);

  if (loading || documents.length === 0) return null;

  const moduleLabel = (mod: string) => {
    switch (mod) {
      case 'plan_order': return 'Plan Order';
      case 'sales_order': return 'Sales Order';
      case 'stock_adjustment': return 'Adjustment';
      case 'stock_in': return 'Stock In';
      case 'stock_out': return 'Stock Out';
      default: return mod;
    }
  };

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileWarning className="w-5 h-5 text-warning" />
          {language === 'en' 
            ? `${documents.length} Document(s) Expiring Soon`
            : `${documents.length} Dokumen Akan Dihapus`}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {language === 'en'
            ? 'These documents will be auto-deleted after 90 days. Download them if needed.'
            : 'Dokumen ini akan otomatis terhapus setelah 90 hari. Download jika diperlukan.'}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-background border text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Trash2 className="w-4 h-4 text-warning shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {doc.file_key.split('/').pop()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {moduleLabel(doc.module_name)} • {new Date(doc.uploaded_at).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                </div>
                <Badge variant={doc.daysUntilDeletion <= 3 ? 'destructive' : 'outline'} className="shrink-0 ml-2 text-xs">
                  {doc.daysUntilDeletion} {language === 'en' ? 'days' : 'hari'}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
