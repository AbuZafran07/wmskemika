
-- Add UPDATE policy for finance on stock_adjustments
DROP POLICY IF EXISTS "Finance can update draft adjustments" ON public.stock_adjustments;
CREATE POLICY "Finance can update draft adjustments"
ON public.stock_adjustments
FOR UPDATE
TO public
USING (
  auth.uid() IS NOT NULL
  AND has_role(auth.uid(), 'finance'::app_role)
  AND status = 'draft'
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_role(auth.uid(), 'finance'::app_role)
);

-- Add INSERT policy for finance on stock_adjustment_items
DROP POLICY IF EXISTS "Finance can insert adjustment items" ON public.stock_adjustment_items;
CREATE POLICY "Finance can insert adjustment items"
ON public.stock_adjustment_items
FOR INSERT
TO public
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_role(auth.uid(), 'finance'::app_role)
);

-- Add UPDATE policy for finance on stock_adjustment_items
DROP POLICY IF EXISTS "Finance can update adjustment items" ON public.stock_adjustment_items;
CREATE POLICY "Finance can update adjustment items"
ON public.stock_adjustment_items
FOR UPDATE
TO public
USING (
  auth.uid() IS NOT NULL
  AND has_role(auth.uid(), 'finance'::app_role)
);

-- Add DELETE policy for finance on stock_adjustment_items (needed when editing items)
DROP POLICY IF EXISTS "Finance can delete adjustment items" ON public.stock_adjustment_items;
CREATE POLICY "Finance can delete adjustment items"
ON public.stock_adjustment_items
FOR DELETE
TO public
USING (
  auth.uid() IS NOT NULL
  AND has_role(auth.uid(), 'finance'::app_role)
);
