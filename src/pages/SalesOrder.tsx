import React, { useState } from 'react';
import { Plus, Search, Filter, Eye, Edit, MoreHorizontal, FileText, Printer } from 'lucide-react';
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
const salesOrders = [
  {
    id: '1',
    soNumber: 'SO-2026-001',
    orderDate: '2026-01-02',
    customer: 'PT. Industri Maju',
    customerPO: 'CUST-PO-001',
    salesName: 'John Doe',
    allocation: 'Selling',
    project: 'Project Alpha',
    deliveryDeadline: '2026-01-10',
    totalAmount: 25000000,
    status: 'approved',
  },
  {
    id: '2',
    soNumber: 'SO-2026-002',
    orderDate: '2026-01-03',
    customer: 'PT. Kimia Nusantara',
    customerPO: 'CUST-PO-002',
    salesName: 'Jane Smith',
    allocation: 'Sample',
    project: 'Project Beta',
    deliveryDeadline: '2026-01-12',
    totalAmount: 12500000,
    status: 'partially_delivered',
  },
  {
    id: '3',
    soNumber: 'SO-2026-003',
    orderDate: '2026-01-04',
    customer: 'PT. Manufacturing Indo',
    customerPO: 'CUST-PO-003',
    salesName: 'John Doe',
    allocation: 'Stock',
    project: 'Project Gamma',
    deliveryDeadline: '2026-01-15',
    totalAmount: 35000000,
    status: 'draft',
  },
];

const statusConfig: Record<string, { label: string; variant: 'draft' | 'approved' | 'pending' | 'success' | 'cancelled' }> = {
  draft: { label: 'Draft', variant: 'draft' },
  approved: { label: 'Approved', variant: 'approved' },
  partially_delivered: { label: 'Partially Delivered', variant: 'pending' },
  delivered: { label: 'Delivered', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'cancelled' },
};

export default function SalesOrder() {
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

  const filteredOrders = salesOrders.filter(order =>
    order.soNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.customerPO.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.salesOrder')}</h1>
          <p className="text-muted-foreground">{t('menu.salesOrderSub')} - Manage customer orders</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Sales Order
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by SO number, customer, or PO..."
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
                <TableHead>SO Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Customer PO</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead>Allocation</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const status = statusConfig[order.status];
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.soNumber}</TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.customer}</p>
                        <p className="text-xs text-muted-foreground">{order.project}</p>
                      </div>
                    </TableCell>
                    <TableCell>{order.customerPO}</TableCell>
                    <TableCell>{order.salesName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{order.allocation}</Badge>
                    </TableCell>
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
                          <DropdownMenuItem>
                            <Printer className="w-4 h-4 mr-2" />
                            Print PDF
                          </DropdownMenuItem>
                          {order.status === 'draft' && (
                            <DropdownMenuItem>
                              <Edit className="w-4 h-4 mr-2" />
                              {t('common.edit')}
                            </DropdownMenuItem>
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
