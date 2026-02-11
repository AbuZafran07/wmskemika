import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  npwp: string | null;
  terms_payment: string | null;
  address: string | null;
  city: string | null;
  is_active: boolean;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  npwp: string | null;
  customer_type: string | null;
  pic: string | null;
  jabatan: string | null;
  phone: string | null;
  email: string | null;
  terms_payment: string | null;
  address: string | null;
  city: string | null;
  is_active: boolean;
}

export interface Product {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  photo_url: string | null;
  category_id: string | null;
  unit_id: string | null;
  supplier_id: string | null;
  purchase_price: number;
  selling_price: number | null;
  min_stock: number;
  max_stock: number | null;
  location_rack: string | null;
  is_active: boolean;
  category?: Category;
  unit?: Unit;
  supplier?: Supplier;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (error) {
      toast.error('Failed to load categories');
      console.error(error);
    } else {
      setCategories(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return { categories, loading, refetch: fetchCategories };
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUnits = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (error) {
      toast.error('Failed to load units');
      console.error(error);
    } else {
      setUnits(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  return { units, loading, refetch: fetchUnits };
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuppliers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (error) {
      toast.error('Failed to load suppliers');
      console.error(error);
    } else {
      setSuppliers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  return { suppliers, loading, refetch: fetchSuppliers };
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .is('deleted_at', null)
      .order('name');

    if (error) {
      toast.error('Failed to load customers');
      console.error(error);
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  return { customers, loading, refetch: fetchCustomers };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(*),
        unit:units(*),
        supplier:suppliers(*)
      `)
      .is('deleted_at', null)
      .order('name');

    if (error) {
      toast.error('Failed to load products');
      console.error(error);
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return { products, loading, refetch: fetchProducts };
}
