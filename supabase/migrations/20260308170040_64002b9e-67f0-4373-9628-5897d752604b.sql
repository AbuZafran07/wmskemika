
-- Create storage bucket for backups
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 52428800, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: only super_admin can access backups
CREATE POLICY "Super admin can upload backups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'backups' AND
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Super admin can read backups"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'backups' AND
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Super admin can delete backups"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'backups' AND
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
