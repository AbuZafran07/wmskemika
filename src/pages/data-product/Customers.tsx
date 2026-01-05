import React, { useState } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCustomers, Customer } from '@/hooks/useMasterData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CustomerFormData {
  code: string;
  name: string;
  customer_type: string;
  pic: string;
  jabatan: string;
  phone: string;
  email: string;
  npwp: string;
  terms_payment: string;
  address: string;
  city: string;
  is_active: boolean;
}

const initialFormData: CustomerFormData = {
  code: '',
  name: '',
  customer_type: '',
  pic: '',
  jabatan: '',
  phone: '',
  email: '',
  npwp: '',
  terms_payment: '',
  address: '',
  city: '',
  is_active: true,
};

const customerTypes = ['Corporate', 'Government', 'Individual', 'Distributor', 'Retail'];

export default function Customers() {
  const { t, language } = useLanguage();
  const { customers, loading, refetch } = useCustomers();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      code: customer.code,
      name: customer.name,
      customer_type: customer.customer_type || '',
      pic: customer.pic || '',
      jabatan: customer.jabatan || '',
      phone: customer.phone || '',
      email: customer.email || '',
      npwp: customer.npwp || '',
      terms_payment: customer.terms_payment || '',
      address: customer.address || '',
      city: customer.city || '',
      is_active: customer.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleView = (customer: Customer) => {
    setViewingCustomer(customer);
    setIsViewDialogOpen(true);
  };

  const handleDelete = (customer: Customer) => {
    setDeletingCustomer(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    setIsSaving(true);

    const customerData = {
      code: formData.code,
      name: formData.name,
      customer_type: formData.customer_type || null,
      pic: formData.pic || null,
      jabatan: formData.jabatan || null,
      phone: formData.phone || null,
      email: formData.email || null,
      npwp: formData.npwp || null,
      terms_payment: formData.terms_payment || null,
      address: formData.address || null,
      city: formData.city || null,
      is_active: formData.is_active,
    };

    let error;

    if (editingCustomer) {
      const { error: updateError } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', editingCustomer.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('customers')
        .insert(customerData);
      error = insertError;
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        editingCustomer 
          ? (language === 'en' ? 'Customer updated successfully' : 'Customer berhasil diperbarui')
          : (language === 'en' ? 'Customer created successfully' : 'Customer berhasil dibuat')
      );
      setIsDialogOpen(false);
      refetch();
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingCustomer) return;

    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingCustomer.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Customer deleted successfully' : 'Customer berhasil dihapus');
      refetch();
    }

    setIsDeleteDialogOpen(false);
    setDeletingCustomer(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.customers')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage customer data' : 'Kelola data customer'}
          </p>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="w-4 h-4 mr-2" />
          {t('common.add')} Customer
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={language === 'en' ? 'Search customers...' : 'Cari customer...'}
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
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'en' ? 'Code' : 'Kode'}</TableHead>
                  <TableHead>{language === 'en' ? 'Name' : 'Nama'}</TableHead>
                  <TableHead>{language === 'en' ? 'Type' : 'Tipe'}</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>{language === 'en' ? 'Phone' : 'Telepon'}</TableHead>
                  <TableHead>{language === 'en' ? 'City' : 'Kota'}</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No customers found' : 'Tidak ada customer ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.code}</TableCell>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell>
                        {customer.customer_type && (
                          <Badge variant="secondary">{customer.customer_type}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{customer.pic || '-'}</TableCell>
                      <TableCell>{customer.phone || '-'}</TableCell>
                      <TableCell>{customer.city || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={customer.is_active ? 'success' : 'draft'}>
                          {customer.is_active ? t('status.active') : t('status.inactive')}
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
                            <DropdownMenuItem onClick={() => handleView(customer)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {language === 'en' ? 'View Details' : 'Lihat Detail'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(customer)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(customer)}>
                              <Trash2 className="w-4 h-4 mr-2" />
                              {t('common.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer 
                ? (language === 'en' ? 'Edit Customer' : 'Edit Customer')
                : (language === 'en' ? 'Add New Customer' : 'Tambah Customer Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Code' : 'Kode'} *</Label>
                <Input
                  placeholder="e.g., CUS-001"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Name' : 'Nama'} *</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter customer name' : 'Masukkan nama customer'}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Customer Type' : 'Tipe Customer'}</Label>
                <Select
                  value={formData.customer_type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, customer_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select type' : 'Pilih tipe'} />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>NPWP</Label>
                <Input
                  placeholder="XX.XXX.XXX.X-XXX.XXX"
                  value={formData.npwp}
                  onChange={(e) => setFormData(prev => ({ ...prev, npwp: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PIC</Label>
                <Input
                  placeholder={language === 'en' ? 'Person in charge' : 'Penanggung jawab'}
                  value={formData.pic}
                  onChange={(e) => setFormData(prev => ({ ...prev, pic: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Position' : 'Jabatan'}</Label>
                <Input
                  placeholder={language === 'en' ? 'Position' : 'Jabatan'}
                  value={formData.jabatan}
                  onChange={(e) => setFormData(prev => ({ ...prev, jabatan: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Phone' : 'Telepon'}</Label>
                <Input
                  placeholder="+62..."
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@customer.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Payment Terms' : 'Termin Pembayaran'}</Label>
                <Input
                  placeholder="e.g., NET 30"
                  value={formData.terms_payment}
                  onChange={(e) => setFormData(prev => ({ ...prev, terms_payment: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'City' : 'Kota'}</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter city' : 'Masukkan kota'}
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Address' : 'Alamat'}</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter full address' : 'Masukkan alamat lengkap'}
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{language === 'en' ? 'Active Status' : 'Status Aktif'}</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{language === 'en' ? 'Customer Details' : 'Detail Customer'}</DialogTitle>
          </DialogHeader>
          {viewingCustomer && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Code' : 'Kode'}</Label>
                  <p className="font-medium">{viewingCustomer.code}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Name' : 'Nama'}</Label>
                  <p className="font-medium">{viewingCustomer.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Type' : 'Tipe'}</Label>
                  <p className="font-medium">{viewingCustomer.customer_type || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">NPWP</Label>
                  <p className="font-medium">{viewingCustomer.npwp || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">PIC</Label>
                  <p className="font-medium">{viewingCustomer.pic || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Position' : 'Jabatan'}</Label>
                  <p className="font-medium">{viewingCustomer.jabatan || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Phone' : 'Telepon'}</Label>
                  <p className="font-medium">{viewingCustomer.phone || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{viewingCustomer.email || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'Payment Terms' : 'Termin'}</Label>
                  <p className="font-medium">{viewingCustomer.terms_payment || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{language === 'en' ? 'City' : 'Kota'}</Label>
                  <p className="font-medium">{viewingCustomer.city || '-'}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">{language === 'en' ? 'Address' : 'Alamat'}</Label>
                <p className="font-medium">{viewingCustomer.address || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <Badge variant={viewingCustomer.is_active ? 'success' : 'draft'} className="mt-1">
                  {viewingCustomer.is_active ? t('status.active') : t('status.inactive')}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Customer' : 'Hapus Customer'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingCustomer?.name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingCustomer?.name}"? Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
