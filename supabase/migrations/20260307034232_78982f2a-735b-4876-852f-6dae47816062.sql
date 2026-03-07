ALTER TABLE public.delivery_requests DROP CONSTRAINT IF EXISTS valid_board_status;

ALTER TABLE public.delivery_requests
ADD CONSTRAINT valid_board_status
CHECK (
  board_status = ANY (
    ARRAY[
      'new_order'::text,
      'checking'::text,
      'on_hold_delivery'::text,
      'approval_delivery'::text,
      'pengiriman_senin'::text,
      'pengiriman_selasa'::text,
      'pengiriman_rabu'::text,
      'pengiriman_kamis'::text,
      'pengiriman_jumat'::text,
      'delivered'::text,
      'delivered_sample'::text,
      'archived'::text
    ]
  )
);