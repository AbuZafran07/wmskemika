
-- ============================================================
-- Phase 1: Unify Calibration into Sales Order
-- Data lama sudah kosong, aman drop tabel receipts/instruments
-- ============================================================

-- 1. Drop old calibration tables (data confirmed empty)
DROP TABLE IF EXISTS public.calibration_instruments CASCADE;
DROP TABLE IF EXISTS public.calibration_receipts CASCADE;

-- 2. Remove obsolete FK columns on tracker tables
ALTER TABLE public.calibration_tracker_checklists
  DROP COLUMN IF EXISTS calibration_receipt_id;
ALTER TABLE public.calibration_tracker_comments
  DROP COLUMN IF EXISTS calibration_receipt_id;

-- Ensure sales_order_id is NOT NULL going forward
ALTER TABLE public.calibration_tracker_checklists
  ALTER COLUMN sales_order_id SET NOT NULL;
ALTER TABLE public.calibration_tracker_comments
  ALTER COLUMN sales_order_id SET NOT NULL;

-- Add FK constraints if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calibration_tracker_checklists_sales_order_fk'
  ) THEN
    ALTER TABLE public.calibration_tracker_checklists
      ADD CONSTRAINT calibration_tracker_checklists_sales_order_fk
      FOREIGN KEY (sales_order_id) REFERENCES public.sales_order_headers(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calibration_tracker_comments_sales_order_fk'
  ) THEN
    ALTER TABLE public.calibration_tracker_comments
      ADD CONSTRAINT calibration_tracker_comments_sales_order_fk
      FOREIGN KEY (sales_order_id) REFERENCES public.sales_order_headers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Extend sales_order_headers for calibration lifecycle
ALTER TABLE public.sales_order_headers
  ADD COLUMN IF NOT EXISTS calibration_status TEXT,
  ADD COLUMN IF NOT EXISTS calibration_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_request_notes TEXT;

-- Default order_type to 'regular' when null
UPDATE public.sales_order_headers SET order_type = 'regular' WHERE order_type IS NULL;
ALTER TABLE public.sales_order_headers
  ALTER COLUMN order_type SET DEFAULT 'regular',
  ALTER COLUMN order_type SET NOT NULL;

-- Constrain calibration_status values
ALTER TABLE public.sales_order_headers
  DROP CONSTRAINT IF EXISTS sales_order_headers_calibration_status_check;
ALTER TABLE public.sales_order_headers
  ADD CONSTRAINT sales_order_headers_calibration_status_check
  CHECK (calibration_status IS NULL OR calibration_status IN (
    'pending_receipt','received','in_calibration','completed','returned'
  ));

-- 4. Extend sales_order_items for per-alat calibration rows
-- Make product_id nullable (calibration lines have no product)
ALTER TABLE public.sales_order_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS instrument_name TEXT,
  ADD COLUMN IF NOT EXISTS instrument_brand_model TEXT,
  ADD COLUMN IF NOT EXISTS instrument_serial_number TEXT,
  ADD COLUMN IF NOT EXISTS measurement_range TEXT,
  ADD COLUMN IF NOT EXISTS calibration_method TEXT,
  ADD COLUMN IF NOT EXISTS sla_working_days INTEGER,
  ADD COLUMN IF NOT EXISTS condition_notes TEXT,
  ADD COLUMN IF NOT EXISTS feasibility_status TEXT,
  ADD COLUMN IF NOT EXISTS feasibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS certificate_number TEXT,
  ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ;

ALTER TABLE public.sales_order_items
  DROP CONSTRAINT IF EXISTS sales_order_items_item_type_check;
ALTER TABLE public.sales_order_items
  ADD CONSTRAINT sales_order_items_item_type_check
  CHECK (item_type IN ('product','calibration'));

-- Sanity: product rows must have product_id; calibration rows must have instrument_name
ALTER TABLE public.sales_order_items
  DROP CONSTRAINT IF EXISTS sales_order_items_type_shape_check;
ALTER TABLE public.sales_order_items
  ADD CONSTRAINT sales_order_items_type_shape_check
  CHECK (
    (item_type = 'product' AND product_id IS NOT NULL)
    OR (item_type = 'calibration' AND instrument_name IS NOT NULL)
  );
