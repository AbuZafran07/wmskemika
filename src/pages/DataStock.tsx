import React, { useState } from 'react';
import { Search, Filter, ChevronDown, ChevronRight, Package, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

// Mock data with batches
const stockData = [
  {
    id: '1',
    code: 'CHM-001',
    name: 'Chemical A-100',
    category: 'Chemicals',
    unit: 'Liter',
    totalStock: 245,
    minStock: 50,
    batches: [
      { batchNo: 'BATCH-001', expiredDate: '2026-06-15', qty: 100 },
      { batchNo: 'BATCH-002', expiredDate: '2026-08-20', qty: 145 },
    ],
  },
  {
    id: '2',
    code: 'SLV-002',
    name: 'Solvent B-200',
    category: 'Solvents',
    unit: 'Kg',
    totalStock: 35,
    minStock: 100,
    batches: [
      { batchNo: 'BATCH-003', expiredDate: '2026-03-10', qty: 35 },
    ],
  },
  {
    id: '3',
    code: 'ADD-003',
    name: 'Additive C-300',
    category: 'Additives',
    unit: 'Kg',
    totalStock: 156,
    minStock: 25,
    batches: [
      { batchNo: 'BATCH-004', expiredDate: '2026-12-01', qty: 80 },
      { batchNo: 'BATCH-005', expiredDate: '2027-02-15', qty: 76 },
    ],
  },
  {
    id: '4',
    code: 'REA-004',
    name: 'Reagent D-400',
    category: 'Reagents',
    unit: 'Liter',
    totalStock: 18,
    minStock: 20,
    batches: [
      { batchNo: 'BATCH-006', expiredDate: null, qty: 18 },
    ],
  },
];

export default function DataStock() {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const isLowStock = (current: number, min: number) => current <= min;
  const isNearExpiry = (dateStr: string | null) => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 90 && diffDays > 0;
  };

  const filteredStock = stockData.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.dataStock')}</h1>
          <p className="text-muted-foreground">View stock levels with batch/FEFO details</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stockData.length}</p>
              <p className="text-sm text-muted-foreground">Total Products</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-warning/10 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stockData.filter(s => isLowStock(s.totalStock, s.minStock)).length}</p>
              <p className="text-sm text-muted-foreground">Low Stock Items</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-info/10 rounded-xl">
              <Calendar className="w-6 h-6 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stockData.reduce((acc, s) => acc + s.batches.length, 0)}</p>
              <p className="text-sm text-muted-foreground">Total Batches</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by product name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              {t('common.filter')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-center">Total Stock</TableHead>
                <TableHead className="text-center">Min Stock</TableHead>
                <TableHead className="text-center">Batches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStock.map((item) => {
                const isExpanded = expandedRows.includes(item.id);
                const lowStock = isLowStock(item.totalStock, item.minStock);
                
                return (
                  <React.Fragment key={item.id}>
                    <TableRow 
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        lowStock && "bg-destructive/5"
                      )}
                      onClick={() => toggleRow(item.id)}
                    >
                      <TableCell>
                        <Button variant="ghost" size="iconSm" className="h-6 w-6">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={lowStock ? 'destructive' : 'success'}>
                          {item.totalStock}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{item.minStock}</TableCell>
                      <TableCell className="text-center">{item.batches.length}</TableCell>
                    </TableRow>
                    
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-0">
                          <div className="p-4">
                            <h4 className="text-sm font-medium mb-3">Batch Details (FEFO Order)</h4>
                            <div className="bg-card rounded-lg border overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Batch No</TableHead>
                                    <TableHead>Expired Date</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.batches
                                    .sort((a, b) => {
                                      if (!a.expiredDate) return 1;
                                      if (!b.expiredDate) return -1;
                                      return new Date(a.expiredDate).getTime() - new Date(b.expiredDate).getTime();
                                    })
                                    .map((batch, idx) => {
                                      const nearExpiry = isNearExpiry(batch.expiredDate);
                                      return (
                                        <TableRow key={idx}>
                                          <TableCell className="font-medium">{batch.batchNo}</TableCell>
                                          <TableCell>
                                            <div className="flex items-center gap-2">
                                              {formatDate(batch.expiredDate)}
                                              {nearExpiry && (
                                                <Badge variant="warning" className="text-[10px]">
                                                  Near Expiry
                                                </Badge>
                                              )}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right">{batch.qty} {item.unit}</TableCell>
                                          <TableCell className="text-center">
                                            <Badge variant="success">Available</Badge>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
