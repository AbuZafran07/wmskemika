-- Internal app: reads require an assigned internal role, not merely a signed-in session.

-- national_holidays
DROP POLICY IF EXISTS "All authenticated users can read holidays" ON public.national_holidays;
CREATE POLICY "Users with an assigned role can read holidays"
ON public.national_holidays FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[]));

-- attachments
DROP POLICY IF EXISTS "All authenticated users can view attachments" ON public.attachments;
CREATE POLICY "Users with an assigned role can view attachments"
ON public.attachments FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[]));

-- profiles
DROP POLICY IF EXISTS "All authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users with an assigned role can view profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[])
);

-- storage: product photos
DROP POLICY IF EXISTS "Authenticated users can view product photos" ON storage.objects;
CREATE POLICY "Roled users can view product photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-photos'
  AND public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[])
);

-- storage: avatars (own file always, otherwise requires an assigned role)
DROP POLICY IF EXISTS "Authenticated users can view avatars" ON storage.objects;
CREATE POLICY "Roled users can view avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    owner = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin','finance','purchasing','warehouse','sales','viewer']::app_role[])
  )
);