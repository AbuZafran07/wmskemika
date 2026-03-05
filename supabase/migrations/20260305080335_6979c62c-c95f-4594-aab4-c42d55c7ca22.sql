-- Allow warehouse role to update checklists (for upload checklist items)
DROP POLICY IF EXISTS "update_checklists" ON public.delivery_checklists;
CREATE POLICY "update_checklists" ON public.delivery_checklists
  FOR UPDATE USING (
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'purchasing'::app_role, 'finance'::app_role, 'warehouse'::app_role])
  );

-- Allow warehouse role to insert checklists (for auto-created upload checklists)
DROP POLICY IF EXISTS "insert_checklists" ON public.delivery_checklists;
CREATE POLICY "insert_checklists" ON public.delivery_checklists
  FOR INSERT WITH CHECK (
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role])
  );