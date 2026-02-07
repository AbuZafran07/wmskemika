-- Drop the existing unique constraint on sku
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_key;

-- Create a partial unique index that only applies to non-deleted products
-- This allows the same SKU to exist if one is soft-deleted
CREATE UNIQUE INDEX products_sku_unique_active 
ON products (sku) 
WHERE deleted_at IS NULL AND sku IS NOT NULL AND sku != '';