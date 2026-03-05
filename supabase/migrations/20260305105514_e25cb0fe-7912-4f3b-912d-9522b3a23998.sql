-- Allow all authenticated users to read board background setting
CREATE POLICY "All authenticated users can read board settings"
  ON public.settings FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL 
    AND key IN ('delivery_board_bg')
  );