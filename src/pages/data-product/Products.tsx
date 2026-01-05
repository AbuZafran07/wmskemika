import React, { useState } from 'react';
import { Plus, Search, Filter, Download, Upload, MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';

// Mock data
const products = [
  {
    id: '1',
    code: 'CHM-001',
    barcode: '8991234567001',
    name: 'Chemical A-100',
    category: 'Chemicals',
    unit: 'Liter',
    supplier: 'PT. Supplier Utama',
    purchasePrice: 150000,
    sellingPrice: 185000,
    minStock: 50,
    maxStock: 500,
    currentStock: 245,
    location: 'Rack A-01',
    isActive: true,
  },
  {
    id: '2',
    code: 'SLV-002',
    barcode: '8991234567002',
    name: 'Solvent B-200',
    category: 'Solvents',
    unit: 'Kg',
    supplier: 'PT. Chemical Indonesia',
    purchasePrice: 85000,
    sellingPrice: 105000,
    minStock: 100,
    maxStock: 1000,
    currentStock: 35,
    location: 'Rack B-02',
    isActive: true,
  },
  {
    id: '3',
    code: 'ADD-003',
    barcode: '8991234567003',
    name: 'Additive C-300',
    category: 'Additives',
    unit: 'Kg',
    supplier: 'PT. Supplier Utama',
    purchasePrice: 220000,
    sellingPrice: 275000,
    minStock: 25,
    maxStock: 200,
    currentStock: 156,
    location: 'Rack C-01',
    isActive: true,
  },
  {
    id: '4',
    code: 'REA-004',
    barcode: '8991234567004',
    name: 'Reagent D-400',
    category: 'Reagents',
    unit: 'Liter',
    supplier: 'PT. Kimia Jaya',
    purchasePrice: 320000,
    sellingPrice: 400000,
    minStock: 20,
    maxStock: 150,
    currentStock: 18,
    location: 'Rack D-03',
    isActive: false,
  },
];

export default function Products() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getStockStatus = (current: number, min: number) => {
    if (current <= min) return 'low';
    if (current <= min * 1.5) return 'warning';
    return 'normal';
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.products')}</h1>
          <p className="text-muted-foreground">Manage your product catalog</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-2" />
            {t('common.import')}
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            {t('common.export')}
          </Button>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('common.add')} Product
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search products..."
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
                <TableHead>Code</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Purchase Price</TableHead>
                <TableHead className="text-right">Selling Price</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => {
                const stockStatus = getStockStatus(product.currentStock, product.minStock);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.code}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.barcode}</p>
                      </div>
                    </TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.unit}</TableCell>
                    <TableCell className="text-right">{formatCurrency(product.purchasePrice)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(product.sellingPrice)}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          stockStatus === 'low' ? 'destructive' :
                          stockStatus === 'warning' ? 'warning' : 'success'
                        }
                      >
                        {product.currentStock} / {product.minStock}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={product.isActive ? 'success' : 'draft'}>
                        {product.isActive ? t('status.active') : t('status.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="iconSm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
