-- Create role enum for RBAC
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create settings table
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ
);

-- Create units table
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ
);

-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  npwp TEXT,
  terms_payment TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  npwp TEXT,
  customer_type TEXT,
  pic TEXT,
  jabatan TEXT,
  phone TEXT,
  email TEXT,
  terms_payment TEXT,
  address TEXT,
  city TEXT,
  credit_limit DECIMAL(15,2),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ
);

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  photo_url TEXT,
  category_id UUID REFERENCES public.categories(id),
  unit_id UUID REFERENCES public.units(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  purchase_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(15,2),
  min_stock INTEGER DEFAULT 0,
  max_stock INTEGER,
  location_rack TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ
);

-- Create plan_order_headers table (Inbound Plan)
CREATE TABLE public.plan_order_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_number TEXT UNIQUE NOT NULL,
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  expected_delivery_date DATE,
  notes TEXT,
  po_document_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled')),
  total_amount DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  shipping_cost DECIMAL(15,2) DEFAULT 0,
  grand_total DECIMAL(15,2) DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create plan_order_items table
CREATE TABLE public.plan_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_order_id UUID NOT NULL REFERENCES public.plan_order_headers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  unit_price DECIMAL(15,2) NOT NULL,
  planned_qty INTEGER NOT NULL,
  qty_received INTEGER DEFAULT 0,
  qty_remaining INTEGER GENERATED ALWAYS AS (planned_qty - qty_received) STORED,
  subtotal DECIMAL(15,2) GENERATED ALWAYS AS (unit_price * planned_qty) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create sales_order_headers table (Outbound Plan)
CREATE TABLE public.sales_order_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_number TEXT UNIQUE NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sales_name TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  customer_po_number TEXT NOT NULL,
  allocation_type TEXT NOT NULL,
  project_instansi TEXT NOT NULL,
  delivery_deadline DATE NOT NULL,
  po_document_url TEXT,
  ship_to_address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'partially_delivered', 'delivered', 'cancelled')),
  total_amount DECIMAL(15,2) DEFAULT 0,
  discount DECIMAL(15,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  shipping_cost DECIMAL(15,2) DEFAULT 0,
  grand_total DECIMAL(15,2) DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create sales_order_items table
CREATE TABLE public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_order_headers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  unit_price DECIMAL(15,2) NOT NULL,
  ordered_qty INTEGER NOT NULL,
  qty_delivered INTEGER DEFAULT 0,
  qty_remaining INTEGER GENERATED ALWAYS AS (ordered_qty - qty_delivered) STORED,
  subtotal DECIMAL(15,2) GENERATED ALWAYS AS (unit_price * ordered_qty) STORED,
  discount DECIMAL(15,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create inventory_batches table (FEFO tracking)
CREATE TABLE public.inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_no TEXT NOT NULL,
  expired_date DATE,
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (product_id, batch_no, expired_date)
);

-- Create stock_transactions table
CREATE TABLE public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID REFERENCES public.inventory_batches(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('inbound', 'outbound', 'adjustment')),
  quantity INTEGER NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create stock_adjustments table
CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number TEXT UNIQUE NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL,
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'posted', 'cancelled')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create stock_adjustment_items table
CREATE TABLE public.stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID NOT NULL REFERENCES public.inventory_batches(id),
  adjustment_qty INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create attachments table (metadata for R2/Storage)
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_key TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  module_name TEXT NOT NULL,
  ref_table TEXT NOT NULL,
  ref_id UUID NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  ref_table TEXT,
  ref_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create stock_in_headers table
CREATE TABLE public.stock_in_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_in_number TEXT UNIQUE NOT NULL,
  plan_order_id UUID NOT NULL REFERENCES public.plan_order_headers(id),
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_note_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create stock_in_items table
CREATE TABLE public.stock_in_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_in_id UUID NOT NULL REFERENCES public.stock_in_headers(id) ON DELETE CASCADE,
  plan_order_item_id UUID NOT NULL REFERENCES public.plan_order_items(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_no TEXT NOT NULL,
  expired_date DATE,
  qty_received INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create stock_out_headers table
CREATE TABLE public.stock_out_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_out_number TEXT UNIQUE NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES public.sales_order_headers(id),
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_note_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create stock_out_items table
CREATE TABLE public.stock_out_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_out_id UUID NOT NULL REFERENCES public.stock_out_headers(id) ON DELETE CASCADE,
  sales_order_item_id UUID NOT NULL REFERENCES public.sales_order_items(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID NOT NULL REFERENCES public.inventory_batches(id),
  qty_out INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_order_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_out_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_out_items ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to check if user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

-- Create function to get user's primary role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY 
    CASE role 
      WHEN 'super_admin' THEN 1 
      WHEN 'admin' THEN 2 
      ELSE 3 
    END
  LIMIT 1
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin']::app_role[]));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Super admin can manage all profiles" ON public.profiles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin']::app_role[]));
CREATE POLICY "Only super_admin can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for settings
CREATE POLICY "Authenticated users can view settings" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only super_admin can manage settings" ON public.settings FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for categories
CREATE POLICY "Authenticated users can view categories" ON public.categories FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Authorized users can manage categories" ON public.categories FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing']::app_role[]));

-- RLS Policies for units
CREATE POLICY "Authenticated users can view units" ON public.units FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Authorized users can manage units" ON public.units FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing']::app_role[]));

-- RLS Policies for suppliers
CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Authorized users can manage suppliers" ON public.suppliers FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing']::app_role[]));

-- RLS Policies for customers
CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Authorized users can manage customers" ON public.customers FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'finance', 'sales']::app_role[]));

-- RLS Policies for products
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Authorized users can manage products" ON public.products FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing']::app_role[]));

-- RLS Policies for plan_order_headers
CREATE POLICY "Authenticated users can view plan orders" ON public.plan_order_headers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage plan orders" ON public.plan_order_headers FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse']::app_role[]));

-- RLS Policies for plan_order_items
CREATE POLICY "Authenticated users can view plan order items" ON public.plan_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage plan order items" ON public.plan_order_items FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'purchasing', 'warehouse']::app_role[]));

-- RLS Policies for sales_order_headers
CREATE POLICY "Authenticated users can view sales orders" ON public.sales_order_headers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage sales orders" ON public.sales_order_headers FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'warehouse']::app_role[]));

-- RLS Policies for sales_order_items
CREATE POLICY "Authenticated users can view sales order items" ON public.sales_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage sales order items" ON public.sales_order_items FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'sales', 'warehouse']::app_role[]));

-- RLS Policies for inventory_batches
CREATE POLICY "Authenticated users can view inventory" ON public.inventory_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage inventory" ON public.inventory_batches FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));

-- RLS Policies for stock_transactions
CREATE POLICY "Authenticated users can view transactions" ON public.stock_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can create transactions" ON public.stock_transactions FOR INSERT WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));

-- RLS Policies for stock_adjustments
CREATE POLICY "Authenticated users can view adjustments" ON public.stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage adjustments" ON public.stock_adjustments FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));

-- RLS Policies for stock_adjustment_items
CREATE POLICY "Authenticated users can view adjustment items" ON public.stock_adjustment_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage adjustment items" ON public.stock_adjustment_items FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));

-- RLS Policies for attachments
CREATE POLICY "Authenticated users can view attachments" ON public.attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can upload attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

-- RLS Policies for audit_logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin']::app_role[]));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for stock_in
CREATE POLICY "Authenticated users can view stock in" ON public.stock_in_headers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage stock in" ON public.stock_in_headers FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));
CREATE POLICY "Authenticated users can view stock in items" ON public.stock_in_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage stock in items" ON public.stock_in_items FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));

-- RLS Policies for stock_out
CREATE POLICY "Authenticated users can view stock out" ON public.stock_out_headers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage stock out" ON public.stock_out_headers FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));
CREATE POLICY "Authenticated users can view stock out items" ON public.stock_out_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized users can manage stock out items" ON public.stock_out_items FOR ALL USING (public.has_any_role(auth.uid(), ARRAY['super_admin', 'admin', 'warehouse']::app_role[]));

-- Create trigger function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create update triggers for tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_plan_order_headers_updated_at BEFORE UPDATE ON public.plan_order_headers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sales_order_headers_updated_at BEFORE UPDATE ON public.sales_order_headers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_batches_updated_at BEFORE UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_adjustments_updated_at BEFORE UPDATE ON public.stock_adjustments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.settings (key, value) VALUES ('allow_admin_approve', 'false');

-- Create indexes for performance
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_supplier ON public.products(supplier_id);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_inventory_product ON public.inventory_batches(product_id);
CREATE INDEX idx_inventory_batch ON public.inventory_batches(batch_no);
CREATE INDEX idx_inventory_expired ON public.inventory_batches(expired_date);
CREATE INDEX idx_plan_order_status ON public.plan_order_headers(status);
CREATE INDEX idx_sales_order_status ON public.sales_order_headers(status);
CREATE INDEX idx_stock_transactions_product ON public.stock_transactions(product_id);
CREATE INDEX idx_stock_transactions_type ON public.stock_transactions(transaction_type);
CREATE INDEX idx_audit_logs_module ON public.audit_logs(module);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);