-- Add new_expired_date column to stock_adjustment_items table for tracking expiry date changes
ALTER TABLE public.stock_adjustment_items
ADD COLUMN new_expired_date DATE NULL;