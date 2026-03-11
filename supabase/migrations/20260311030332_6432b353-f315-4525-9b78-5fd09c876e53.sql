
-- Add approval workflow columns to delivery_comments
ALTER TABLE public.delivery_comments 
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejected_reason text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS label_request_id uuid DEFAULT NULL;

-- Add comment about column meanings
COMMENT ON COLUMN public.delivery_comments.approval_status IS 'null=normal comment, pending=awaiting approval, approved=approved, rejected=rejected';
COMMENT ON COLUMN public.delivery_comments.label_request_id IS 'References the delivery_labels.id that was requested';

-- Allow warehouse and finance to update approval_status on delivery_comments
DROP POLICY IF EXISTS "update_comments" ON public.delivery_comments;
CREATE POLICY "update_comments" ON public.delivery_comments
  FOR UPDATE USING (
    auth.uid() = user_id 
    OR has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'warehouse'::app_role, 'finance'::app_role])
  );
