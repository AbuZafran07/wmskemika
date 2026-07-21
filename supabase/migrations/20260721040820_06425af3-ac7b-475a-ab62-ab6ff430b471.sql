
DELETE FROM public.stock_transactions
WHERE reference_type = 'stock_out'
  AND reference_id = 'e010a58f-bea3-4e11-b931-11fe175d3b8b';

DELETE FROM public.stock_out_items
WHERE stock_out_id = 'e010a58f-bea3-4e11-b931-11fe175d3b8b';

DELETE FROM public.stock_out_headers
WHERE id = 'e010a58f-bea3-4e11-b931-11fe175d3b8b';

UPDATE public.inventory_batches
SET qty_on_hand = qty_on_hand + 79,
    updated_at = now()
WHERE id = '9efdd973-03ed-4940-b7e4-d7348022120e';

UPDATE public.sales_order_items
SET qty_delivered = 79
WHERE sales_order_id = '0a86f44f-82d5-405e-8009-0b0ccbe6ac41'
  AND product_id = 'c23f03d3-1bf5-458e-a869-bf21021eb908';
