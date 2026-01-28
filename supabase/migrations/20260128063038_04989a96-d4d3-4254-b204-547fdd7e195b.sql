-- Add image_url column to products table for URL-based product images
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.products.image_url IS 'Direct URL to product image (jpg/png/webp). No file upload - URL only.';