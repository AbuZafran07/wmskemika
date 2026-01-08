import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  status: 'valid' | 'duplicate' | 'error' | 'warning' | 'update';
  message?: string;
  existingId?: string; // ID of existing record for upsert
}

interface ImportPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (enableUpsert: boolean) => void;
  title: string;
  rows: ImportPreviewRow[];
  columns: { key: string; header: string }[];
  isImporting: boolean;
  showUpsertOption?: boolean;
}

export function ImportPreviewDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  rows,
  columns,
  isImporting,
  showUpsertOption = true,
}: ImportPreviewDialogProps) {
  const { language } = useLanguage();
  const [enableUpsert, setEnableUpsert] = React.useState(false);

  const validRows = rows.filter(r => r.status === 'valid');
  const duplicateRows = rows.filter(r => r.status === 'duplicate');
  const updateRows = rows.filter(r => r.status === 'update');
  const errorRows = rows.filter(r => r.status === 'error');
  const warningRows = rows.filter(r => r.status === 'warning');

  // When upsert is enabled, duplicates become updates
  const effectiveNewRows = enableUpsert ? validRows.length : validRows.length;
  const effectiveUpdateRows = enableUpsert ? duplicateRows.length : 0;
  const effectiveSkipRows = enableUpsert ? 0 : duplicateRows.length;

  const getStatusIcon = (status: ImportPreviewRow['status']) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'duplicate':
        return enableUpsert 
          ? <RefreshCw className="w-4 h-4 text-blue-500" />
          : <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'update':
        return <RefreshCw className="w-4 h-4 text-blue-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    }
  };

  const getStatusBadge = (status: ImportPreviewRow['status']) => {
    switch (status) {
      case 'valid':
        return <Badge variant="success">{language === 'en' ? 'New' : 'Baru'}</Badge>;
      case 'duplicate':
        return enableUpsert 
          ? <Badge className="bg-blue-500 hover:bg-blue-600">{language === 'en' ? 'Update' : 'Update'}</Badge>
          : <Badge variant="warning">{language === 'en' ? 'Duplicate' : 'Duplikat'}</Badge>;
      case 'update':
        return <Badge className="bg-blue-500 hover:bg-blue-600">{language === 'en' ? 'Update' : 'Update'}</Badge>;
      case 'error':
        return <Badge variant="destructive">{language === 'en' ? 'Error' : 'Error'}</Badge>;
      case 'warning':
        return <Badge variant="secondary">{language === 'en' ? 'Warning' : 'Peringatan'}</Badge>;
    }
  };

  const handleConfirm = () => {
    onConfirm(enableUpsert);
  };

  const totalToProcess = enableUpsert 
    ? validRows.length + duplicateRows.length 
    : validRows.length;

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-600">{validRows.length}</p>
              <p className="text-xs text-muted-foreground">{language === 'en' ? 'New' : 'Baru'}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${
            enableUpsert 
              ? 'bg-blue-500/10 border-blue-500/20' 
              : 'bg-yellow-500/10 border-yellow-500/20'
          }`}>
            {enableUpsert 
              ? <RefreshCw className="w-5 h-5 text-blue-500" />
              : <AlertTriangle className="w-5 h-5 text-yellow-500" />
            }
            <div>
              <p className={`text-sm font-medium ${enableUpsert ? 'text-blue-600' : 'text-yellow-600'}`}>
                {duplicateRows.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {enableUpsert 
                  ? (language === 'en' ? 'Update' : 'Update')
                  : (language === 'en' ? 'Duplicate' : 'Duplikat')
                }
              </p>
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

        {/* Upsert Option */}
        {showUpsertOption && duplicateRows.length > 0 && (
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                {language === 'en' ? 'Update existing records' : 'Update data yang sudah ada'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {language === 'en' 
                  ? `Enable to update ${duplicateRows.length} existing record(s) instead of skipping them`
                  : `Aktifkan untuk mengupdate ${duplicateRows.length} data yang sudah ada`}
              </p>
            </div>
            <Switch
              checked={enableUpsert}
              onCheckedChange={setEnableUpsert}
            />
          </div>
        )}

        {/* Preview Table */}
        <ScrollArea className="h-[300px] border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead className="w-[90px]">Status</TableHead>
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
                    row.status === 'duplicate' ? (enableUpsert ? 'bg-blue-500/5' : 'bg-yellow-500/5') :
                    row.status === 'warning' ? 'bg-orange-500/5' :
                    ''
                  }
                >
                  <TableCell className="font-mono text-sm">{row.rowIndex}</TableCell>
                  <TableCell>{getStatusBadge(row.status)}</TableCell>
                  {columns.map(col => (
                    <TableCell key={col.key} className="max-w-[150px] truncate">
                      {row.data[col.key] || '-'}
                    </TableCell>
                  ))}
                  <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                    {row.status === 'duplicate' && enableUpsert 
                      ? (language === 'en' ? 'Will be updated' : 'Akan diupdate')
                      : row.message || '-'
                    }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            {language === 'en' ? 'Cancel' : 'Batal'}
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isImporting || totalToProcess === 0}
          >
            {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {language === 'en' 
              ? `Import ${totalToProcess} Row${totalToProcess !== 1 ? 's' : ''}`
              : `Impor ${totalToProcess} Baris`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
