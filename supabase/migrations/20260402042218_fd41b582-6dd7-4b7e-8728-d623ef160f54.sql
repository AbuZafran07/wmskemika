DROP POLICY "Authorized users can create delivery orders" ON public.delivery_orders;

CREATE POLICY "Authorized users can create delivery orders"
ON public.delivery_orders FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY[
    'super_admin'::app_role,
    'admin'::app_role,
    'finance'::app_role,
    'purchasing'::app_role
  ])
);