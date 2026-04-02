

## Diagnosis

Error: **"new row violates row-level security policy for table 'delivery_orders'"**

The INSERT policy on `delivery_orders` only allows roles: `super_admin`, `admin`, `sales`, `warehouse`.

However, based on the project's design (memory: delivery-order-system), DO generation should also be allowed for `finance` and `purchasing` roles. The user triggering "Generate DO" likely has a `finance` or `purchasing` role, which is blocked by the current RLS policy.

## Plan

### Step 1: Update RLS INSERT policy on `delivery_orders`

Add `finance` and `purchasing` roles to the INSERT policy:

```sql
DROP POLICY "Authorized users can create delivery orders" ON public.delivery_orders;

CREATE POLICY "Authorized users can create delivery orders"
ON public.delivery_orders FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND has_any_role(auth.uid(), ARRAY[
    'super_admin'::app_role,
    'admin'::app_role,
    'sales'::app_role,
    'warehouse'::app_role,
    'finance'::app_role,
    'purchasing'::app_role
  ])
);
```

### Step 2: Also ensure `created_by` is set

The insert code already sets `created_by: user?.id` — verify user is authenticated when generating DO (already guarded by `if (!card) return`).

No code changes needed — only the database migration to fix the RLS policy.

