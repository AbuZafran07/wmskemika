
-- Update attachments delete policy: only super_admin
DROP POLICY IF EXISTS "Uploaders and admins can delete attachments" ON public.attachments;

CREATE POLICY "Only super_admin can delete attachments" ON public.attachments
FOR DELETE TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role));
