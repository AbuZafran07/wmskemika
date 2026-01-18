-- Drop the existing overly permissive SELECT policy for attachments
DROP POLICY IF EXISTS "Authorized users can view attachments" ON public.attachments;

-- Create context-aware SELECT policy for attachments
-- Users can only view attachments if they have access to the parent record
CREATE POLICY "Users can view attachments for accessible records"
ON public.attachments
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Super admin and admin can view all attachments
    has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role])
    OR
    -- Plan Order attachments: purchasing, warehouse can view
    (
      ref_table = 'plan_order_headers'
      AND has_any_role(auth.uid(), ARRAY['purchasing'::app_role, 'warehouse'::app_role])
      AND EXISTS (
        SELECT 1 FROM public.plan_order_headers poh
        WHERE poh.id = attachments.ref_id
        AND poh.is_deleted = false
      )
    )
    OR
    -- Sales Order attachments: sales, warehouse, finance can view
    (
      ref_table = 'sales_order_headers'
      AND has_any_role(auth.uid(), ARRAY['sales'::app_role, 'warehouse'::app_role, 'finance'::app_role])
      AND EXISTS (
        SELECT 1 FROM public.sales_order_headers soh
        WHERE soh.id = attachments.ref_id
        AND soh.is_deleted = false
      )
    )
    OR
    -- Stock Adjustment attachments: warehouse, finance can view
    (
      ref_table = 'stock_adjustments'
      AND has_any_role(auth.uid(), ARRAY['warehouse'::app_role, 'finance'::app_role])
      AND EXISTS (
        SELECT 1 FROM public.stock_adjustments sa
        WHERE sa.id = attachments.ref_id
        AND sa.is_deleted = false
      )
    )
    OR
    -- Users can always view their own uploaded attachments
    uploaded_by = auth.uid()
  )
);