
-- Fix: delivery_comments already in realtime, just ensure delivery_comment_reads table exists
-- (table was created in previous migration, this is a no-op fix)
SELECT 1;
