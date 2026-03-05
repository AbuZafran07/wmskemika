
-- Update delivery_labels policies: only super_admin can create/update/delete labels
DROP POLICY IF EXISTS "insert_labels" ON public.delivery_labels;
DROP POLICY IF EXISTS "update_labels" ON public.delivery_labels;
DROP POLICY IF EXISTS "delete_labels" ON public.delivery_labels;

CREATE POLICY "insert_labels" ON public.delivery_labels
FOR INSERT WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "update_labels" ON public.delivery_labels
FOR UPDATE USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "delete_labels" ON public.delivery_labels
FOR DELETE USING (has_role(auth.uid(), 'super_admin'::app_role));
