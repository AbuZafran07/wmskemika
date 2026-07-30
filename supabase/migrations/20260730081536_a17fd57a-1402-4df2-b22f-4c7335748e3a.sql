DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calibration_tracker_checklists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calibration_tracker_checklists;
  END IF;
END $$;