import { supabase } from '@/integrations/supabase/client';

export async function uploadFile(
  file: File,
  bucket: 'product-photos' | 'documents',
  folder: string = ''
): Promise<{ url: string; path: string } | null> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder ? folder + '/' : ''}${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return {
      url: data.publicUrl,
      path: fileName
    };
  } catch (error) {
    console.error('File upload failed:', error);
    return null;
  }
}

export async function deleteFile(
  path: string,
  bucket: 'product-photos' | 'documents'
): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('File delete failed:', error);
    return false;
  }
}
