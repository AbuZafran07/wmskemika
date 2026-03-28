
-- Create national_holidays table
CREATE TABLE public.national_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM holiday_date)::INTEGER) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(holiday_date, name)
);

-- Enable RLS
ALTER TABLE public.national_holidays ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read holidays
CREATE POLICY "All authenticated users can read holidays"
  ON public.national_holidays FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only super_admin can manage holidays
CREATE POLICY "Only super_admin can manage holidays"
  ON public.national_holidays FOR ALL
  TO public
  USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role));

-- Seed 2026 holidays
INSERT INTO public.national_holidays (holiday_date, name) VALUES
  ('2026-01-01', 'Tahun Baru Masehi'),
  ('2026-01-29', 'Tahun Baru Imlek'),
  ('2026-02-17', 'Isra Mi''raj'),
  ('2026-03-22', 'Hari Raya Nyepi'),
  ('2026-03-29', 'Idul Fitri'),
  ('2026-03-30', 'Idul Fitri'),
  ('2026-03-31', 'Cuti Bersama Idul Fitri'),
  ('2026-04-01', 'Cuti Bersama Idul Fitri'),
  ('2026-04-02', 'Wafat Isa Al-Masih'),
  ('2026-05-01', 'Hari Buruh'),
  ('2026-05-14', 'Kenaikan Isa Al-Masih'),
  ('2026-05-16', 'Hari Raya Waisak'),
  ('2026-06-01', 'Hari Lahir Pancasila'),
  ('2026-06-05', 'Idul Adha'),
  ('2026-06-26', 'Tahun Baru Hijriyah'),
  ('2026-08-17', 'Hari Kemerdekaan RI'),
  ('2026-09-04', 'Maulid Nabi Muhammad'),
  ('2026-12-25', 'Hari Natal'),
  -- 2027 holidays
  ('2027-01-01', 'Tahun Baru Masehi'),
  ('2027-02-17', 'Tahun Baru Imlek'),
  ('2027-02-06', 'Isra Mi''raj'),
  ('2027-03-11', 'Hari Raya Nyepi'),
  ('2027-03-18', 'Idul Fitri'),
  ('2027-03-19', 'Idul Fitri'),
  ('2027-03-20', 'Cuti Bersama Idul Fitri'),
  ('2027-03-21', 'Cuti Bersama Idul Fitri'),
  ('2027-03-26', 'Wafat Isa Al-Masih'),
  ('2027-05-01', 'Hari Buruh'),
  ('2027-05-06', 'Kenaikan Isa Al-Masih'),
  ('2027-05-16', 'Hari Raya Waisak'),
  ('2027-05-26', 'Idul Adha'),
  ('2027-06-01', 'Hari Lahir Pancasila'),
  ('2027-06-16', 'Tahun Baru Hijriyah'),
  ('2027-08-17', 'Hari Kemerdekaan RI'),
  ('2027-08-25', 'Maulid Nabi Muhammad'),
  ('2027-12-25', 'Hari Natal');
