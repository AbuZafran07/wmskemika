// Image compression and validation utilities

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB before compression
export const TARGET_FILE_SIZE = 100 * 1024; // 100KB after compression

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImageFile(file: File, language: 'en' | 'id' = 'en'): ImageValidationResult {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: language === 'en' 
        ? 'Only JPG, PNG, WebP, and GIF formats are allowed' 
        : 'Hanya format JPG, PNG, WebP, dan GIF yang diizinkan'
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: language === 'en' 
        ? 'Image must be less than 5MB' 
        : 'Gambar harus kurang dari 5MB'
    };
  }

  return { valid: true };
}

export function createImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function compressImage(
  canvas: HTMLCanvasElement,
  targetSize: number = TARGET_FILE_SIZE,
  format: 'image/jpeg' | 'image/webp' = 'image/jpeg'
): Promise<Blob> {
  let quality = 0.9;
  let blob: Blob | null = null;

  // Try to compress to target size
  while (quality > 0.1) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, format, quality);
    });

    if (blob && blob.size <= targetSize) {
      break;
    }

    quality -= 0.1;
  }

  // If still too large, just use lowest quality
  if (!blob) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, format, 0.1);
    });
  }

  if (!blob) {
    throw new Error('Failed to compress image');
  }

  return blob;
}

export function getCroppedCanvas(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
  outputSize: number = 256
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Set output size (square for avatar)
  canvas.width = outputSize;
  canvas.height = outputSize;

  // Calculate scale factors
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Draw cropped and resized image
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    outputSize,
    outputSize
  );

  return canvas;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
