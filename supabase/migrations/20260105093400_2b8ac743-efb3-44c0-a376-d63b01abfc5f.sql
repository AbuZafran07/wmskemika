-- Fix data inconsistency: Update qty_received in plan_order_items based on actual stock_in_items
-- (qty_remaining is a generated column, so it will auto-update)
UPDATE plan_order_items poi
SET qty_received = COALESCE((
    SELECT SUM(sii.qty_received)
    FROM stock_in_items sii
    WHERE sii.plan_order_item_id = poi.id
  ), 0);

-- Fix data inconsistency: Update qty_delivered in sales_order_items based on actual stock_out_items
-- (qty_remaining is a generated column, so it will auto-update)
UPDATE sales_order_items soi
SET qty_delivered = COALESCE((
    SELECT SUM(soo.qty_out)
    FROM stock_out_items soo
    WHERE soo.sales_order_item_id = soi.id
  ), 0);

-- Update plan_order_headers status based on items fulfillment
UPDATE plan_order_headers poh
SET status = CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM plan_order_items poi 
    WHERE poi.plan_order_id = poh.id AND COALESCE(poi.qty_remaining, poi.planned_qty) > 0
  ) THEN 'received'
  WHEN EXISTS (
    SELECT 1 FROM plan_order_items poi 
    WHERE poi.plan_order_id = poh.id AND COALESCE(poi.qty_received, 0) > 0
  ) THEN 'partial'
  ELSE poh.status
END
WHERE poh.status IN ('approved', 'partial');

-- Update sales_order_headers status based on items fulfillment
UPDATE sales_order_headers soh
SET status = CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM sales_order_items soi 
    WHERE soi.sales_order_id = soh.id AND COALESCE(soi.qty_remaining, soi.ordered_qty) > 0
  ) THEN 'delivered'
  WHEN EXISTS (
    SELECT 1 FROM sales_order_items soi 
    WHERE soi.sales_order_id = soh.id AND COALESCE(soi.qty_delivered, 0) > 0
  ) THEN 'partial'
  ELSE soh.status
END
WHERE soh.status IN ('approved', 'partial');