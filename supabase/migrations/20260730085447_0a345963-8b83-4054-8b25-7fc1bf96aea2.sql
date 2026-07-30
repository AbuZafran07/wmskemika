DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calibration_tracker_comments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calibration_document_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
ALTER TABLE public.calibration_tracker_comments REPLICA IDENTITY FULL;
ALTER TABLE public.calibration_document_logs REPLICA IDENTITY FULL;