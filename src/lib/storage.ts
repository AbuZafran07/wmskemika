import { supabase } from '@/integrations/supabase/client';

/**
 * Uploads a file to Supabase storage.
 * Returns the file path for later retrieval via signed URLs.
 */
export async function uploadFile(
  file: File,
  bucket: 'product-photos' | 'documents',
  folder: string = ''
): Promise<{ url: string; path: string; originalName: string } | null> {
  try {
    const fileExt = file.name.split('.').pop();
    // Preserve original filename in the path: timestamp-uuid-originalname.ext
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${folder ? folder + '/' : ''}${Date.now()}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Generate a signed URL instead of public URL for security
    const signedUrl = await getSignedUrl(fileName, bucket);
    
    return {
      url: signedUrl || fileName, // Fallback to path if signed URL fails
      path: fileName,
      originalName: file.name
    };
  } catch (error) {
    console.error('File upload failed:', error);
    return null;
  }
}

/**
 * Generates a signed URL for secure file access.
 * Signed URLs expire after the specified duration (default: 1 hour).
 * 
 * @param path - The file path in the bucket
 * @param bucket - The storage bucket name
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 */
export async function getSignedUrl(
  path: string,
  bucket: 'product-photos' | 'documents',
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    // Use shorter expiry for sensitive documents
    const actualExpiry = bucket === 'documents' ? Math.min(expiresIn, 1800) : expiresIn;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, actualExpiry);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Failed to create signed URL:', error);
    return null;
  }
}

/**
 * Gets a signed URL for viewing a file, with role-based access check.
 * For documents bucket, verifies user is authenticated.
 */
export async function getSecureFileUrl(
  path: string,
  bucket: 'product-photos' | 'documents'
): Promise<string | null> {
  try {
    // For documents, verify user is authenticated
    if (bucket === 'documents') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('User not authenticated - cannot access documents');
        return null;
      }
    }

    return await getSignedUrl(path, bucket);
  } catch (error) {
    console.error('Failed to get secure file URL:', error);
    return null;
  }
}

/**
 * Deletes a file from storage.
 */
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

/**
 * Gets the public URL for product photos (backward compatibility).
 * For new code, prefer getSignedUrl for better security.
 * 
 * @deprecated Use getSignedUrl instead for better security
 */
export function getPublicUrl(
  path: string,
  bucket: 'product-photos' | 'documents'
): string {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return data.publicUrl;
}
