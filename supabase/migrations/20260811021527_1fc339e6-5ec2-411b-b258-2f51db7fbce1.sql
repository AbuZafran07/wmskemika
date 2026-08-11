ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS move_source text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.delivery_requests.move_source IS 'Sumber perpindahan kartu: manual (user drag/aksi langsung), automation (otomatis karena aksi user seperti checklist/stock out), system (otomatis oleh aturan sistem/cron time guard)';