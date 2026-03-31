
-- Create proforma_invoices table
CREATE TABLE public.proforma_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_number text NOT NULL UNIQUE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_order_headers(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  delivery_request_id uuid REFERENCES public.delivery_requests(id),
  
  -- Financial fields
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  shipping_cost numeric DEFAULT 0,
  other_costs numeric DEFAULT 0,
  materai_amount numeric DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  
  -- Customer info snapshot
  customer_type text,
  payment_terms text,
  
  -- Workflow
  status text NOT NULL DEFAULT 'pending',
  notes text,
  
  -- Approval
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  
  -- Cancel
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  
  -- Audit
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add CHECK constraint for status
ALTER TABLE public.proforma_invoices 
  ADD CONSTRAINT proforma_invoices_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- Enable RLS
ALTER TABLE public.proforma_invoices ENABLE ROW LEVEL SECURITY;

-- RLS: Sales, finance, purchasing, admin, super_admin can view
CREATE POLICY "Authorized users can view proforma invoices"
  ON public.proforma_invoices FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role, 'sales'::app_role])
  );

-- RLS: Only sales can create
CREATE POLICY "Sales can create proforma invoices"
  ON public.proforma_invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'sales'::app_role])
  );

-- RLS: Finance, purchasing, super_admin can update (for approval)
CREATE POLICY "Authorized users can update proforma invoices"
  ON public.proforma_invoices FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'finance'::app_role, 'purchasing'::app_role])
  );

-- RLS: Finance and super_admin can delete (cancel)
CREATE POLICY "Finance and super_admin can delete proforma invoices"
  ON public.proforma_invoices FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'finance'::app_role])
  );

-- Create proforma_invoice_items table
CREATE TABLE public.proforma_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_invoice_id uuid NOT NULL REFERENCES public.proforma_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  qty integer NOT NULL,
  unit_price numeric NOT NULL,
  discount numeric DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.proforma_invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for items (same as header)
CREATE POLICY "Authorized users can view pi items"
  ON public.proforma_invoice_items FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'finance'::app_role, 'purchasing'::app_role, 'sales'::app_role])
  );

CREATE POLICY "Sales can create pi items"
  ON public.proforma_invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'sales'::app_role])
  );

CREATE POLICY "Authorized users can update pi items"
  ON public.proforma_invoice_items FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'finance'::app_role, 'purchasing'::app_role])
  );

CREATE POLICY "Authorized users can delete pi items"
  ON public.proforma_invoice_items FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND 
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'finance'::app_role])
  );
