-- Enable realtime for remaining tables using DO block to handle already existing
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_adjustments;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Already exists, ignore
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_batches;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_transactions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;