INSERT INTO public.settings (key, value)
VALUES (
  'gdrive_backup_config',
  '{"enabled": false, "last_backup_at": null, "last_backup_file": null, "last_backup_records": 0, "gdrive_file_id": null}'::jsonb
)
ON CONFLICT (key) DO NOTHING;