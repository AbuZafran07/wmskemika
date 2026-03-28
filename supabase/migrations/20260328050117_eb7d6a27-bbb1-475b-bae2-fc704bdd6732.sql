
-- Allow all authenticated users to read the stock_alert_schedule setting
CREATE POLICY "All authenticated users can read stock alert schedule"
ON public.settings
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND key = 'stock_alert_schedule');
