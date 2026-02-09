import { useState, useEffect } from 'react';
import { ExternalLink, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getProductPhotoUrl } from '@/lib/storage';

interface ImagePreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  photoPath: string | null | undefined;
  alt: string;
}

/**
 * Reusable component for displaying product images in a popup/modal.
 * Supports both direct URLs and storage paths (with signed URL generation).
 * Features:
 * - Full-size image preview with max height 70vh
 * - "Open Image" button to open in new tab
 * - Error handling with placeholder fallback
 * - Closable via ESC or clicking outside
 */
export function ImagePreviewDialog({
  isOpen,
  onOpenChange,
  photoPath,
  alt,
}: ImagePreviewDialogProps) {
  const [imageError, setImageError] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch signed URL when dialog opens
  useEffect(() => {
    if (isOpen && photoPath) {
      setImageError(false);
      setLoading(true);
      getProductPhotoUrl(photoPath)
        .then(url => {
          setSignedUrl(url);
          setLoading(false);
        })
        .catch(() => {
          setImageError(true);
          setLoading(false);
        });
    } else {
      setSignedUrl(null);
    }
  }, [isOpen, photoPath]);

  const handleOpenInNewTab = () => {
    if (signedUrl) {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate max-w-[400px]">{alt}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-12 h-12 mb-4 animate-spin" />
              <p className="text-sm">Loading image...</p>
            </div>
          ) : signedUrl && !imageError ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex items-center justify-center w-full bg-muted/30 rounded-lg p-2">
                <img
                  src={signedUrl}
                  alt={alt}
                  className="max-h-[70vh] max-w-full object-contain rounded"
                  loading="lazy"
                  onError={() => setImageError(true)}
                />
              </div>
              <Button
                variant="outline"
                onClick={handleOpenInNewTab}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open Image
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-sm">
                {imageError ? 'Failed to load image' : 'No image available'}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ProductThumbnailProps {
  photoPath: string | null | undefined;
  alt: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Clickable product thumbnail component with lazy loading and error handling.
 * Uses public URLs from Supabase storage for product images.
 * Product-photos bucket is public for better performance.
 */
export function ProductThumbnail({
  photoPath,
  alt,
  className = 'w-10 h-10',
  onClick,
}: ProductThumbnailProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Get public URL when photoPath changes
  useEffect(() => {
    if (photoPath) {
      setImageError(false);
      setImageLoaded(false);
      setImageUrl(null);
      
      // getProductPhotoUrl returns a Promise with the public URL
      getProductPhotoUrl(photoPath)
        .then(url => {
          if (url) {
            setImageUrl(url);
          } else {
            setImageError(true);
          }
        })
        .catch(() => {
          setImageError(true);
        });
    } else {
      setImageUrl(null);
      setImageError(false);
    }
  }, [photoPath]);

  // Show placeholder when no photo or error
  if (!photoPath || imageError) {
    return (
      <div 
        className={`${className} rounded border border-border bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors`}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={`View ${alt}`}
        onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      >
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  // Show loading spinner while getting URL
  if (!imageUrl) {
    return (
      <div 
        className={`${className} rounded border border-border bg-muted flex items-center justify-center`}
      >
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div 
      className={`${className} rounded border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all relative`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View ${alt}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {!imageLoaded && (
        <div className="absolute inset-0 w-full h-full bg-muted flex items-center justify-center">
          <ImageIcon className="w-5 h-5 text-muted-foreground animate-pulse" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onError={() => setImageError(true)}
        onLoad={() => setImageLoaded(true)}
      />
    </div>
  );
}
