ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS calibration_gas text,
  ADD COLUMN IF NOT EXISTS traceability text,
  ADD COLUMN IF NOT EXISTS env_temperature numeric(6,2),
  ADD COLUMN IF NOT EXISTS env_humidity numeric(6,2),
  ADD COLUMN IF NOT EXISTS standard_applied text,
  ADD COLUMN IF NOT EXISTS monitoring_reading text,
  ADD COLUMN IF NOT EXISTS correction text,
  ADD COLUMN IF NOT EXISTS additional_information text;