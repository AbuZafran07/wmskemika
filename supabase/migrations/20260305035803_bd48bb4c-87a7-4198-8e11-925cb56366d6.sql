
-- Update delivery_comments delete policy: only super_admin
DROP POLICY IF EXISTS "delete_comments" ON public.delivery_comments;

CREATE POLICY "delete_comments" ON public.delivery_comments
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));
