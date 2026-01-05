import React, { useState } from 'react';
import { Plus, Search, Filter, Eye, Edit, MoreHorizontal, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
const planOrders = [
  {
    id: '1',
    planNumber: 'PO-2026-001',
    planDate: '2026-01-02',
    supplier: 'PT. Supplier Utama',
    expectedDelivery: '2026-01-10',
    totalItems: 5,
    totalAmount: 15000000,
    status: 'approved',
  },
  {
    id: '2',
    planNumber: 'PO-2026-002',
    planDate: '2026-01-03',
    supplier: 'PT. Chemical Indonesia',
    expectedDelivery: '2026-01-12',
    totalItems: 3,
    totalAmount: 8500000,
    status: 'partially_received',
  },
  {
    id: '3',
    planNumber: 'PO-2026-003',
    planDate: '2026-01-04',
    supplier: 'PT. Kimia Jaya',
    expectedDelivery: '2026-01-15',
    totalItems: 8,
    totalAmount: 22000000,
    status: 'draft',
  },
  {
    id: '4',
    planNumber: 'PO-2026-004',
    planDate: '2026-01-05',
    supplier: 'PT. Supplier Utama',
    expectedDelivery: '2026-01-18',
    totalItems: 2,
    totalAmount: 5500000,
    status: 'received',
  },
];

const statusConfig: Record<string, { label: string; variant: 'draft' | 'approved' | 'pending' | 'success' | 'cancelled' }> = {
  draft: { label: 'Draft', variant: 'draft' },
  approved: { label: 'Approved', variant: 'approved' },
  partially_received: { label: 'Partially Received', variant: 'pending' },
  received: { label: 'Received', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'cancelled' },
};

export default function PlanOrder() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const filteredOrders = planOrders.filter(order =>
    order.planNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.supplier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.planOrder')}</h1>
          <p className="text-muted-foreground">{t('menu.planOrderSub')} - Manage procurement plans</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Plan Order
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by PO number or supplier..."
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
                <TableHead>Plan Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead className="text-center">Items</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-center">{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const status = statusConfig[order.status];
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.planNumber}</TableCell>
                    <TableCell>{formatDate(order.planDate)}</TableCell>
                    <TableCell>{order.supplier}</TableCell>
                    <TableCell>{formatDate(order.expectedDelivery)}</TableCell>
                    <TableCell className="text-center">{order.totalItems}</TableCell>
                    <TableCell className="text-right">{formatCurrency(order.totalAmount)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={status.variant}>{status.label}</Badge>
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
                          {order.status === 'draft' && (
                            <>
                              <DropdownMenuItem>
                                <Edit className="w-4 h-4 mr-2" />
                                {t('common.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-success">
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <XCircle className="w-4 h-4 mr-2" />
                                Cancel
                              </DropdownMenuItem>
                            </>
                          )}
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
