import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';

export interface ImportPreviewRow {
  rowIndex: number;
  data: Record<string, string>;
  status: 'valid' | 'duplicate' | 'error' | 'warning';
  message?: string;
}

interface ImportPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  rows: ImportPreviewRow[];
  columns: { key: string; header: string }[];
  isImporting: boolean;
}

export function ImportPreviewDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  rows,
  columns,
  isImporting,
}: ImportPreviewDialogProps) {
  const { language } = useLanguage();

  const validRows = rows.filter(r => r.status === 'valid');
  const duplicateRows = rows.filter(r => r.status === 'duplicate');
  const errorRows = rows.filter(r => r.status === 'error');
  const warningRows = rows.filter(r => r.status === 'warning');

  const getStatusIcon = (status: ImportPreviewRow['status']) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'duplicate':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    }
  };

  const getStatusBadge = (status: ImportPreviewRow['status']) => {
    switch (status) {
      case 'valid':
        return <Badge variant="success">{language === 'en' ? 'Valid' : 'Valid'}</Badge>;
      case 'duplicate':
        return <Badge variant="warning">{language === 'en' ? 'Duplicate' : 'Duplikat'}</Badge>;
      case 'error':
        return <Badge variant="destructive">{language === 'en' ? 'Error' : 'Error'}</Badge>;
      case 'warning':
        return <Badge variant="secondary">{language === 'en' ? 'Warning' : 'Peringatan'}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {language === 'en' 
              ? 'Review the data before importing. Rows with issues will be highlighted.'
              : 'Tinjau data sebelum mengimpor. Baris dengan masalah akan ditandai.'}
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 py-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-600">{validRows.length}</p>
              <p className="text-xs text-muted-foreground">{language === 'en' ? 'Valid' : 'Valid'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <div>
              <p className="text-sm font-medium text-yellow-600">{duplicateRows.length}</p>
              <p className="text-xs text-muted-foreground">{language === 'en' ? 'Duplicate' : 'Duplikat'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <div>
              <p className="text-sm font-medium text-orange-600">{warningRows.length}</p>
              <p className="text-xs text-muted-foreground">{language === 'en' ? 'Warning' : 'Peringatan'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <XCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-600">{errorRows.length}</p>
              <p className="text-xs text-muted-foreground">{language === 'en' ? 'Error' : 'Error'}</p>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <ScrollArea className="h-[400px] border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">#</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                {columns.map(col => (
                  <TableHead key={col.key}>{col.header}</TableHead>
                ))}
                <TableHead>{language === 'en' ? 'Message' : 'Pesan'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow 
                  key={row.rowIndex}
                  className={
                    row.status === 'error' ? 'bg-red-500/5' :
                    row.status === 'duplicate' ? 'bg-yellow-500/5' :
                    row.status === 'warning' ? 'bg-orange-500/5' :
                    ''
                  }
                >
                  <TableCell className="font-mono text-sm">{row.rowIndex}</TableCell>
                  <TableCell>{getStatusBadge(row.status)}</TableCell>
                  {columns.map(col => (
                    <TableCell key={col.key} className="max-w-[200px] truncate">
                      {row.data[col.key] || '-'}
                    </TableCell>
                  ))}
                  <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                    {row.message || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Warning message if duplicates found */}
        {duplicateRows.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-600">
                {language === 'en' 
                  ? `${duplicateRows.length} duplicate(s) found`
                  : `${duplicateRows.length} duplikat ditemukan`}
              </p>
              <p className="text-xs text-muted-foreground">
                {language === 'en' 
                  ? 'Duplicate entries will be skipped during import.'
                  : 'Data duplikat akan dilewati saat impor.'}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            {language === 'en' ? 'Cancel' : 'Batal'}
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isImporting || validRows.length === 0}
          >
            {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {language === 'en' 
              ? `Import ${validRows.length} Valid Rows`
              : `Impor ${validRows.length} Baris Valid`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
