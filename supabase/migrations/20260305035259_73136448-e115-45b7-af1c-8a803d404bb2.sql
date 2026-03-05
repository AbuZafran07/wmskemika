
-- Fix delivery_comments: change to PERMISSIVE policies
DROP POLICY IF EXISTS "insert_comments" ON public.delivery_comments;
DROP POLICY IF EXISTS "read_comments" ON public.delivery_comments;
DROP POLICY IF EXISTS "update_comments" ON public.delivery_comments;
DROP POLICY IF EXISTS "delete_comments" ON public.delivery_comments;

CREATE POLICY "read_comments" ON public.delivery_comments
FOR SELECT TO authenticated USING (true);

CREATE POLICY "insert_comments" ON public.delivery_comments
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_comments" ON public.delivery_comments
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "delete_comments" ON public.delivery_comments
FOR DELETE TO authenticated USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'super_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix attachments: add PERMISSIVE policy for delivery_requests attachments visibility
DROP POLICY IF EXISTS "Users can view attachments for accessible records" ON public.attachments;

CREATE POLICY "Users can view attachments for accessible records" ON public.attachments
FOR SELECT TO authenticated USING (
  has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role])
  OR (ref_table = 'plan_order_headers' AND has_any_role(auth.uid(), ARRAY['purchasing'::app_role, 'warehouse'::app_role]) AND EXISTS (
    SELECT 1 FROM plan_order_headers poh WHERE poh.id = attachments.ref_id AND poh.is_deleted = false
  ))
  OR (ref_table = 'sales_order_headers' AND has_any_role(auth.uid(), ARRAY['sales'::app_role, 'warehouse'::app_role, 'finance'::app_role]) AND EXISTS (
    SELECT 1 FROM sales_order_headers soh WHERE soh.id = attachments.ref_id AND soh.is_deleted = false
  ))
  OR (ref_table = 'stock_adjustments' AND has_any_role(auth.uid(), ARRAY['warehouse'::app_role, 'finance'::app_role]) AND EXISTS (
    SELECT 1 FROM stock_adjustments sa WHERE sa.id = attachments.ref_id AND sa.is_deleted = false
  ))
  OR (ref_table = 'delivery_requests' AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'sales'::app_role, 'warehouse'::app_role]))
  OR uploaded_by = auth.uid()
);

-- Fix attachments INSERT/UPDATE/DELETE to be PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON public.attachments;
DROP POLICY IF EXISTS "Uploaders and admins can delete attachments" ON public.attachments;
DROP POLICY IF EXISTS "Uploaders and admins can update attachments" ON public.attachments;

CREATE POLICY "Authenticated users can upload attachments" ON public.attachments
FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

CREATE POLICY "Uploaders and admins can delete attachments" ON public.attachments
FOR DELETE TO authenticated USING (
  uploaded_by = auth.uid() OR has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role])
);

CREATE POLICY "Uploaders and admins can update attachments" ON public.attachments
FOR UPDATE TO authenticated USING (
  uploaded_by = auth.uid() OR has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role])
);
