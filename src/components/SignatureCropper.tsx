import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCw, Check, X, FileSignature, Maximize2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { validateImageFile, formatFileSize } from '@/lib/imageUtils';

interface SignatureCropperProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  onCropComplete: (blob: Blob) => void;
}

// Signature canvas ratio (width:height = 2.5:1 landscape) — the signature is
// fitted INSIDE this canvas (contain), never stretched and never cut off.
const SIGNATURE_ASPECT_RATIO = 2.5;
const OUTPUT_WIDTH = 1000;
const OUTPUT_HEIGHT = 400;
// Inner padding so strokes never touch the canvas edge (looks "terpotong" in PDF)
const PADDING_RATIO = 0.04;

/** Extract the selected region at natural resolution. */
function getCropCanvas(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const sx = Math.max(0, Math.round(crop.x * scaleX));
  const sy = Math.max(0, Math.round(crop.y * scaleY));
  const sw = Math.max(1, Math.round(crop.width * scaleX));
  const sh = Math.max(1, Math.round(crop.height * scaleY));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

/**
 * Trim surrounding empty space (transparent or near-white) so the signature
 * uses the whole output area consistently.
 */
function trimCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext('2d');
  if (!ctx) return source;
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, source.width, source.height);
  } catch {
    return source; // tainted canvas — skip trimming
  }

  const { width, height } = source;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data.data[i + 3];
      if (a < 16) continue;
      const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];
      // treat near-white as background
      if (r > 244 && g > 244 && b > 244) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return source; // nothing detected

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(source, minX, minY, w, h, 0, 0, w, h);
  return out;
}

/** Fit (contain) the signature inside the 2.5:1 transparent canvas. */
function fitToSignatureCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.imageSmoothingQuality = 'high';

  const padX = OUTPUT_WIDTH * PADDING_RATIO;
  const padY = OUTPUT_HEIGHT * PADDING_RATIO;
  const boxW = OUTPUT_WIDTH - padX * 2;
  const boxH = OUTPUT_HEIGHT - padY * 2;

  const ratio = Math.min(boxW / source.width, boxH / source.height);
  const drawW = source.width * ratio;
  const drawH = source.height * ratio;
  const dx = (OUTPUT_WIDTH - drawW) / 2;
  const dy = (OUTPUT_HEIGHT - drawH) / 2;

  ctx.drawImage(source, 0, 0, source.width, source.height, dx, dy, drawW, drawH);
  return canvas;
}

/** Rotate an image source by 90° steps and return a new data URL. */
async function rotateImageSrc(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL('image/png');
}

// Compress with transparent background support (PNG)
async function compressSignature(
  canvas: HTMLCanvasElement,
  targetSize: number = 500 * 1024 // 500KB
): Promise<Blob> {
  let quality = 0.9;
  let blob: Blob | null = null;

  // Try PNG first for transparency support
  blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (blob && blob.size <= targetSize) {
    return blob;
  }

  // If PNG is too large, try WebP with compression
  while (quality > 0.1) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality);
    });

    if (blob && blob.size <= targetSize) {
      break;
    }

    quality -= 0.1;
  }

  // Fallback to lowest quality
  if (!blob) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.1);
    });
  }

  if (!blob) {
    throw new Error('Failed to compress signature');
  }

  return blob;
}

export function SignatureCropper({
  open,
  onClose,
  file,
  onCropComplete,
}: SignatureCropperProps) {
  const { language } = useLanguage();
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [imgSrc, setImgSrc] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Load image when file changes
  React.useEffect(() => {
    if (file) {
      const validation = validateImageFile(file, language as 'en' | 'id');
      if (!validation.valid) {
        onClose();
        return;
      }

      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImgSrc(reader.result?.toString() || '');
      });
      reader.readAsDataURL(file);
    } else {
      setImgSrc('');
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
  }, [file, language, onClose]);

  // Default selection = the WHOLE image, so nothing is cut off unless the user
  // deliberately narrows the area.
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    setCompletedCrop({ unit: 'px', x: 0, y: 0, width, height });
  }, []);

  const handleSelectAll = () => {
    const img = imgRef.current;
    if (!img) return;
    setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
    setCompletedCrop({ unit: 'px', x: 0, y: 0, width: img.width, height: img.height });
  };

  const handleRotate = async () => {
    if (!imgSrc) return;
    setIsProcessing(true);
    try {
      const rotated = await rotateImageSrc(imgSrc);
      setCrop(undefined);
      setCompletedCrop(undefined);
      setImgSrc(rotated);
    } catch (error) {
      console.error('Error rotating signature:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = async () => {
    if (!imgRef.current || !completedCrop) return;

    setIsProcessing(true);
    try {
      // 1) take the selected region, 2) trim empty margins,
      // 3) fit it inside the 2.5:1 canvas without stretching or clipping
      const cropped = getCropCanvas(imgRef.current, {
        x: completedCrop.x,
        y: completedCrop.y,
        width: completedCrop.width,
        height: completedCrop.height,
      });
      const trimmed = trimCanvas(cropped);
      const canvas = fitToSignatureCanvas(trimmed);

      const blob = await compressSignature(canvas);
      
      onCropComplete(blob);
      onClose();
    } catch (error) {
      console.error('Error processing signature:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setImgSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" />
            {language === 'en' ? 'Crop Signature' : 'Potong Tanda Tangan'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Cropper */}
          {imgSrc && (
            <div className="flex justify-center bg-muted rounded-lg p-2 overflow-hidden">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                className="max-h-[300px]"
              >
                <img
                  ref={imgRef}
                  alt="Signature preview"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  style={{
                    maxHeight: '300px',
                    maxWidth: '100%'
                  }}
                />
              </ReactCrop>
            </div>
          )}

          {/* Controls */}
          <div className="space-y-3">
            {/* Use whole image */}
            <div className="flex items-center gap-3">
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm min-w-16">
                {language === 'en' ? 'Area' : 'Area'}
              </span>
              <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={!imgSrc}>
                {language === 'en' ? 'Use full image' : 'Gunakan seluruh gambar'}
              </Button>
            </div>

            {/* Rotate Button */}
            <div className="flex items-center gap-3">
              <RotateCw className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm min-w-16">
                {language === 'en' ? 'Rotate' : 'Putar'}
              </span>
              <Button variant="outline" size="sm" onClick={handleRotate} disabled={!imgSrc || isProcessing}>
                +90°
              </Button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>
              {language === 'en' 
                ? '• Drag to reposition the crop area'
                : '• Seret untuk memposisikan area potong'}
            </p>
            <p>
              {language === 'en' 
                ? '• Empty margins are trimmed automatically; the signature is fitted (never stretched or cut)'
                : '• Ruang kosong dipangkas otomatis; tanda tangan disesuaikan (tidak gepeng/terpotong)'}
            </p>
            <p>
              {language === 'en' 
                ? `• Output: ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}px (landscape)`
                : `• Hasil: ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}px (landscape)`}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            <X className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Cancel' : 'Batal'}
          </Button>
          <Button onClick={handleComplete} disabled={isProcessing || !completedCrop}>
            {isProcessing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            {language === 'en' ? 'Apply' : 'Terapkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
