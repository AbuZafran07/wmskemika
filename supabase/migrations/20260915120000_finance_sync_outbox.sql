-- Integrasi pergerakan stok WMS -> Finance (pola OUTBOX)
-- Aditif & non-destruktif: hanya menambah 1 tabel baru + 1 trigger.
-- TIDAK mengubah struktur stock_transactions, RPC stok, atau logika stok apa pun.

-- ============================================
-- 1. Tabel finance_sync_outbox
-- ============================================
CREATE TABLE public.finance_sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_transaction_id UUID NOT NULL REFERENCES public.stock_transactions(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('STOCK_IN', 'STOCK_OUT', 'STOCK_ADJUSTMENT')),
  transaction_date DATE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_ref TEXT,
  quantity NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  reference_number TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_finance_sync_outbox_status ON public.finance_sync_outbox (status);

-- Hanya service_role (edge function) yang boleh mengakses tabel ini.
-- RLS diaktifkan tanpa policy untuk authenticated/anon; service_role
-- melewati RLS secara default di Supabase/Postgres.
GRANT ALL ON public.finance_sync_outbox TO service_role;
ALTER TABLE public.finance_sync_outbox ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Trigger AFTER INSERT di stock_transactions -> enqueue ke outbox
-- ============================================
-- SECURITY DEFINER: agar bisa menulis ke finance_sync_outbox (RLS-locked,
-- hanya service_role) walau dipanggil oleh role authenticated saat insert
-- stock_transactions. Dibungkus EXCEPTION agar kegagalan enqueue TIDAK
-- PERNAH menggagalkan transaksi stok itu sendiri.
CREATE OR REPLACE FUNCTION public.fn_finance_sync_outbox_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_cost NUMERIC;
BEGIN
  BEGIN
    v_type := CASE NEW.transaction_type
      WHEN 'inbound' THEN 'STOCK_IN'
      WHEN 'outbound' THEN 'STOCK_OUT'
      WHEN 'adjustment' THEN 'STOCK_ADJUSTMENT'
      ELSE NULL
    END;

    IF v_type IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT ABS(NEW.quantity) * COALESCE(p.purchase_price, 0)
    INTO v_cost
    FROM public.products p
    WHERE p.id = NEW.product_id;

    INSERT INTO public.finance_sync_outbox (
      stock_transaction_id, transaction_type, transaction_date,
      product_id, quantity, total_cost, reference_number, status
    ) VALUES (
      NEW.id, v_type, COALESCE(NEW.created_at::date, CURRENT_DATE),
      NEW.product_id, NEW.quantity, COALESCE(v_cost, 0), NEW.reference_number, 'PENDING'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'finance_sync_outbox enqueue failed for stock_transactions.id=%: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_sync_outbox_enqueue ON public.stock_transactions;
CREATE TRIGGER trg_finance_sync_outbox_enqueue
  AFTER INSERT ON public.stock_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_finance_sync_outbox_enqueue();
