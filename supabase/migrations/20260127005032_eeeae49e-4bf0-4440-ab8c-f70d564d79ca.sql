-- Create user_signatures table
CREATE TABLE public.user_signatures (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    signature_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;

-- Users can view their own signature
CREATE POLICY "Users can view their own signature"
ON public.user_signatures
FOR SELECT
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Users can insert their own signature
CREATE POLICY "Users can insert their own signature"
ON public.user_signatures
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Users can update their own signature
CREATE POLICY "Users can update their own signature"
ON public.user_signatures
FOR UPDATE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Users can delete their own signature
CREATE POLICY "Users can delete their own signature"
ON public.user_signatures
FOR DELETE
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Super admin can view all signatures (for PDF rendering)
CREATE POLICY "Super admin can view all signatures"
ON public.user_signatures
FOR SELECT
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'super_admin'::app_role));

-- Admin can view all signatures (for PDF rendering)
CREATE POLICY "Admin can view all signatures"
ON public.user_signatures
FOR SELECT
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- Authorized users can view signatures for PDF approval rendering
CREATE POLICY "Authorized users can view signatures for approvals"
ON public.user_signatures
FOR SELECT
USING (
    auth.uid() IS NOT NULL 
    AND has_any_role(auth.uid(), ARRAY['purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'finance'::app_role])
);

-- Create storage bucket for signatures
INSERT INTO storage.buckets (id, name, public) 
VALUES ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for signatures bucket
-- Users can view their own signatures
CREATE POLICY "Users can view own signatures"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'signatures' 
    AND auth.uid() IS NOT NULL 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can upload their own signatures
CREATE POLICY "Users can upload own signatures"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'signatures' 
    AND auth.uid() IS NOT NULL 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own signatures
CREATE POLICY "Users can update own signatures"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'signatures' 
    AND auth.uid() IS NOT NULL 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own signatures
CREATE POLICY "Users can delete own signatures"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'signatures' 
    AND auth.uid() IS NOT NULL 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Authorized users can view all signatures (for PDF approval rendering)
CREATE POLICY "Authorized users can view all signatures"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'signatures' 
    AND auth.uid() IS NOT NULL 
    AND has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'purchasing'::app_role, 'warehouse'::app_role, 'sales'::app_role, 'finance'::app_role])
);

-- Create trigger for updated_at
CREATE TRIGGER update_user_signatures_updated_at
BEFORE UPDATE ON public.user_signatures
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();