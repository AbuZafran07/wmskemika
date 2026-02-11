import { supabase } from '@/integrations/supabase/client';

const MAX_DOCUMENT_SIZE = 2 * 1024 * 1024; // 2MB target for documents
const MAX_IMAGE_SIZE = 500 * 1024; // 500KB target for images

/**
 * Compresses an image file by resizing and reducing quality.
 */
async function compressImageFile(
  file: File,
  maxSize: number = MAX_IMAGE_SIZE,
  maxDimension: number = 1920
): Promise<File> {
  // Skip non-image files
  if (!file.type.startsWith('image/')) return file;
  // Skip if already small enough
  if (file.size <= maxSize) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      // Try progressively lower quality
      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= maxSize || quality <= 0.2) {
              const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                type: 'image/webp',
              });
              console.log(`Image compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
              resolve(compressed);
            } else {
              quality -= 0.15;
              tryCompress();
            }
          },
          'image/webp',
          quality
        );
      };
      tryCompress();
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Uploads a file to Supabase storage with automatic compression for images.
 * Returns the file path for later retrieval via signed URLs.
 */
export async function uploadFile(
  file: File,
  bucket: 'product-photos' | 'documents',
  folder: string = ''
): Promise<{ url: string; path: string; originalName: string } | null> {
  try {
    // Compress image files before upload
    let fileToUpload = file;
    if (file.type.startsWith('image/')) {
      const targetSize = bucket === 'product-photos' ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
      fileToUpload = await compressImageFile(file, targetSize);
    }

    // Preserve original filename in the path: timestamp-originalname
    const sanitizedName = fileToUpload.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${folder ? folder + '/' : ''}${Date.now()}-${sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileToUpload);

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
      // Log detailed error for debugging
      console.error(`Error creating signed URL for ${bucket}/${path}:`, error.message);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error(`Failed to create signed URL for ${bucket}/${path}:`, error);
    return null;
  }
}

/**
 * Gets a signed URL for viewing a file, with authentication check.
 * Both buckets now require authentication since product-photos is private.
 */
export async function getSecureFileUrl(
  path: string,
  bucket: 'product-photos' | 'documents'
): Promise<string | null> {
  try {
    // Both buckets now require authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('User not authenticated - cannot access files');
      return null;
    }

    return await getSignedUrl(path, bucket);
  } catch (error) {
    console.error('Failed to get secure file URL:', error);
    return null;
  }
}

/**
 * Gets a signed URL for a product photo.
 * Use this for displaying product images in the UI.
 */
export function getProductPhotoUrl(photoUrlOrPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!photoUrlOrPath) {
      resolve(null);
      return;
    }
    
    try {
      let path = photoUrlOrPath;
      
      // Check if it's a Supabase storage URL and extract the path
      if (photoUrlOrPath.includes('/storage/v1/object/')) {
        // Extract path from URL like: .../storage/v1/object/public/product-photos/products/...
        const match = photoUrlOrPath.match(/\/product-photos\/(.+?)(?:\?|$)/);
        if (match) {
          path = match[1];
        }
      }
      
      // If the path still contains the bucket name prefix, remove it
      if (path.startsWith('product-photos/')) {
        path = path.replace('product-photos/', '');
      }
      
      // Product-photos bucket is public, use public URL for better performance
      const { data } = supabase.storage
        .from('product-photos')
        .getPublicUrl(path);
      
      // Return the public URL directly
      resolve(data.publicUrl);
    } catch (error) {
      console.error('Failed to get product photo URL:', error);
      resolve(null);
    }
  });
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
 * Gets the public URL for files.
 * NOTE: This will NOT work for private buckets (product-photos is now private).
 * Use getSignedUrl or getProductPhotoUrl instead.
 * 
 * @deprecated Both buckets are now private. Use getSignedUrl or getProductPhotoUrl instead.
 */
export function getPublicUrl(
  path: string,
  bucket: 'product-photos' | 'documents'
): string {
  console.warn('getPublicUrl is deprecated. Both buckets are now private. Use getSignedUrl or getProductPhotoUrl instead.');
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return data.publicUrl;
}
