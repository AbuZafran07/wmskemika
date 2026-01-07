import React, { useState, useRef } from 'react';
import { Plus, Search, Filter, Download, Upload, MoreHorizontal, Edit, Trash2, Eye, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useProducts, useCategories, useUnits, useSuppliers, Product } from '@/hooks/useMasterData';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/storage';
import { ProductImage } from '@/components/ProductImage';
import { toast } from 'sonner';

interface ProductFormData {
  sku: string;
  name: string;
  category_id: string;
  unit_id: string;
  supplier_id: string;
  purchase_price: string;
  selling_price: string;
  min_stock: string;
  max_stock: string;
  location_rack: string;
  is_active: boolean;
  photo_url: string;
}

const initialFormData: ProductFormData = {
  sku: '',
  name: '',
  category_id: '',
  unit_id: '',
  supplier_id: '',
  purchase_price: '',
  selling_price: '',
  min_stock: '0',
  max_stock: '',
  location_rack: '',
  is_active: true,
  photo_url: '',
};

export default function Products() {
  const { t, language } = useLanguage();
  const { products, loading, refetch } = useProducts();
  const { categories } = useCategories();
  const { units } = useUnits();
  const { suppliers } = useSuppliers();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (product.sku && product.sku.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleAdd = () => {
    setEditingProduct(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku || '',
      name: product.name,
      category_id: product.category_id || '',
      unit_id: product.unit_id || '',
      supplier_id: product.supplier_id || '',
      purchase_price: product.purchase_price.toString(),
      selling_price: product.selling_price?.toString() || '',
      min_stock: product.min_stock.toString(),
      max_stock: product.max_stock?.toString() || '',
      location_rack: product.location_rack || '',
      is_active: product.is_active,
      photo_url: product.photo_url || '',
    });
    setIsDialogOpen(true);
  };

  const handleView = (product: Product) => {
    setViewingProduct(product);
    setIsViewDialogOpen(true);
  };

  const handleDelete = (product: Product) => {
    setDeletingProduct(product);
    setIsDeleteDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const result = await uploadFile(file, 'product-photos', 'products');
    
    if (result) {
      // Store the path, not the URL - we'll generate signed URLs when displaying
      setFormData(prev => ({ ...prev, photo_url: result.path }));
      toast.success(language === 'en' ? 'Photo uploaded successfully' : 'Foto berhasil diupload');
    } else {
      toast.error(language === 'en' ? 'Failed to upload photo' : 'Gagal upload foto');
    }
    setIsUploading(false);
  };

  const generateBarcode = () => {
    const timestamp = Date.now().toString().slice(-10);
    const randomArray = new Uint8Array(1);
    crypto.getRandomValues(randomArray);
    const random = (randomArray[0] % 100).toString().padStart(2, '0');
    return `899${timestamp}${random}`;
  };

  const handleSave = async () => {
    if (!formData.name || !formData.category_id || !formData.unit_id || !formData.supplier_id || !formData.purchase_price) {
      toast.error(language === 'en' ? 'Please fill all required fields' : 'Harap isi semua field wajib');
      return;
    }

    setIsSaving(true);

    const productData = {
      sku: formData.sku || null,
      barcode: editingProduct?.barcode || generateBarcode(),
      name: formData.name,
      category_id: formData.category_id,
      unit_id: formData.unit_id,
      supplier_id: formData.supplier_id,
      purchase_price: parseFloat(formData.purchase_price),
      selling_price: formData.selling_price ? parseFloat(formData.selling_price) : null,
      min_stock: parseInt(formData.min_stock) || 0,
      max_stock: formData.max_stock ? parseInt(formData.max_stock) : null,
      location_rack: formData.location_rack || null,
      is_active: formData.is_active,
      photo_url: formData.photo_url || null,
    };

    let error;

    if (editingProduct) {
      const { error: updateError } = await supabase
        .from('products')
        .update(productData)
        .eq('id', editingProduct.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('products')
        .insert(productData);
      error = insertError;
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        editingProduct 
          ? (language === 'en' ? 'Product updated successfully' : 'Produk berhasil diperbarui')
          : (language === 'en' ? 'Product created successfully' : 'Produk berhasil dibuat')
      );
      setIsDialogOpen(false);
      refetch();
    }

    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deletingProduct) return;

    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingProduct.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === 'en' ? 'Product deleted successfully' : 'Produk berhasil dihapus');
      refetch();
    }

    setIsDeleteDialogOpen(false);
    setDeletingProduct(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">{t('menu.products')}</h1>
          <p className="text-muted-foreground">
            {language === 'en' ? 'Manage your product catalog' : 'Kelola katalog produk Anda'}
          </p>
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
          <Button size="sm" onClick={handleAdd}>
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
                placeholder={language === 'en' ? 'Search products...' : 'Cari produk...'}
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
                  <TableHead>{language === 'en' ? 'Photo' : 'Foto'}</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>{language === 'en' ? 'Product Name' : 'Nama Produk'}</TableHead>
                  <TableHead>{language === 'en' ? 'Category' : 'Kategori'}</TableHead>
                  <TableHead>{language === 'en' ? 'Unit' : 'Satuan'}</TableHead>
                  <TableHead className="text-right">{language === 'en' ? 'Purchase Price' : 'Harga Beli'}</TableHead>
                  <TableHead className="text-right">{language === 'en' ? 'Selling Price' : 'Harga Jual'}</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      {language === 'en' ? 'No products found' : 'Tidak ada produk ditemukan'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <ProductImage 
                          photoUrl={product.photo_url} 
                          alt={product.name}
                          className="w-10 h-10 rounded object-cover"
                          fallbackClassName="w-10 h-10 rounded bg-muted flex items-center justify-center"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{product.sku || '-'}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.barcode}</p>
                        </div>
                      </TableCell>
                      <TableCell>{product.category?.name || '-'}</TableCell>
                      <TableCell>{product.unit?.name || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.purchase_price)}</TableCell>
                      <TableCell className="text-right">{product.selling_price ? formatCurrency(product.selling_price) : '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={product.is_active ? 'success' : 'draft'}>
                          {product.is_active ? t('status.active') : t('status.inactive')}
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
                            <DropdownMenuItem onClick={() => handleView(product)}>
                              <Eye className="w-4 h-4 mr-2" />
                              {language === 'en' ? 'View Details' : 'Lihat Detail'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(product)}>
                              <Edit className="w-4 h-4 mr-2" />
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(product)}>
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
              {editingProduct 
                ? (language === 'en' ? 'Edit Product' : 'Edit Produk')
                : (language === 'en' ? 'Add New Product' : 'Tambah Produk Baru')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Photo Upload */}
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Product Photo' : 'Foto Produk'} *</Label>
              <div className="flex items-center gap-4">
                {formData.photo_url ? (
                  <div className="relative">
                    <ProductImage 
                      photoUrl={formData.photo_url} 
                      alt="Product"
                      className="w-24 h-24 rounded-lg object-cover"
                      fallbackClassName="w-24 h-24 rounded-lg bg-muted flex items-center justify-center"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, photo_url: '' }))}
                      className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div 
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {language === 'en' ? 'Upload Photo' : 'Upload Foto'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU ({language === 'en' ? 'Optional' : 'Opsional'})</Label>
                <Input
                  placeholder="e.g., CHM-001"
                  value={formData.sku}
                  onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Product Name' : 'Nama Produk'} *</Label>
                <Input
                  placeholder={language === 'en' ? 'Enter product name' : 'Masukkan nama produk'}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Category' : 'Kategori'} *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select category' : 'Pilih kategori'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Unit' : 'Satuan'} *</Label>
                <Select
                  value={formData.unit_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, unit_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select unit' : 'Pilih satuan'} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Default Supplier' : 'Supplier Default'} *</Label>
                <Select
                  value={formData.supplier_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, supplier_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'en' ? 'Select supplier' : 'Pilih supplier'} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Purchase Price' : 'Harga Beli'} (IDR) *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, purchase_price: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Selling Price' : 'Harga Jual'} (IDR)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.selling_price}
                  onChange={(e) => setFormData(prev => ({ ...prev, selling_price: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Min Stock *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.min_stock}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_stock: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Stock</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.max_stock}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_stock: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'en' ? 'Location/Rack' : 'Lokasi/Rak'}</Label>
                <Input
                  placeholder="e.g., A-01"
                  value={formData.location_rack}
                  onChange={(e) => setFormData(prev => ({ ...prev, location_rack: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is-active">{language === 'en' ? 'Active' : 'Aktif'}</Label>
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
            <DialogTitle>{language === 'en' ? 'Product Details' : 'Detail Produk'}</DialogTitle>
          </DialogHeader>
          {viewingProduct && (
            <div className="space-y-4">
              {viewingProduct.photo_url && (
                <ProductImage 
                  photoUrl={viewingProduct.photo_url} 
                  alt={viewingProduct.name}
                  className="w-full h-48 rounded-lg object-cover"
                  fallbackClassName="w-full h-48 rounded-lg bg-muted flex items-center justify-center"
                />
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">SKU</p>
                  <p className="font-medium">{viewingProduct.sku || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Barcode</p>
                  <p className="font-medium">{viewingProduct.barcode || '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">{language === 'en' ? 'Name' : 'Nama'}</p>
                  <p className="font-medium">{viewingProduct.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Category' : 'Kategori'}</p>
                  <p className="font-medium">{viewingProduct.category?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Unit' : 'Satuan'}</p>
                  <p className="font-medium">{viewingProduct.unit?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Purchase Price' : 'Harga Beli'}</p>
                  <p className="font-medium">{formatCurrency(viewingProduct.purchase_price)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Selling Price' : 'Harga Jual'}</p>
                  <p className="font-medium">{viewingProduct.selling_price ? formatCurrency(viewingProduct.selling_price) : '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Min Stock</p>
                  <p className="font-medium">{viewingProduct.min_stock}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Max Stock</p>
                  <p className="font-medium">{viewingProduct.max_stock || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Supplier' : 'Supplier'}</p>
                  <p className="font-medium">{viewingProduct.supplier?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{language === 'en' ? 'Location' : 'Lokasi'}</p>
                  <p className="font-medium">{viewingProduct.location_rack || '-'}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'en' ? 'Delete Product' : 'Hapus Produk'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to delete "${deletingProduct?.name}"? This action cannot be undone.`
                : `Apakah Anda yakin ingin menghapus "${deletingProduct?.name}"? Tindakan ini tidak dapat dibatalkan.`
              }
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
