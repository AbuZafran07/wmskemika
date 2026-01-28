import React, { useState } from 'react';
import { ExternalLink, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ImagePreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null | undefined;
  alt: string;
}

/**
 * Reusable component for displaying product images in a popup/modal.
 * Features:
 * - Full-size image preview with max height 70vh
 * - "Open Image" button to open in new tab
 * - Error handling with placeholder fallback
 * - Closable via ESC or clicking outside
 */
export function ImagePreviewDialog({
  isOpen,
  onOpenChange,
  imageUrl,
  alt,
}: ImagePreviewDialogProps) {
  const [imageError, setImageError] = useState(false);

  const handleOpenInNewTab = () => {
    if (imageUrl) {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Reset error state when dialog opens with new image
  React.useEffect(() => {
    if (isOpen) {
      setImageError(false);
    }
  }, [isOpen, imageUrl]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate max-w-[400px]">{alt}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center p-4">
          {imageUrl && !imageError ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex items-center justify-center w-full bg-muted/30 rounded-lg p-2">
                <img
                  src={imageUrl}
                  alt={alt}
                  className="max-h-[70vh] max-w-full object-contain rounded"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
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
  imageUrl: string | null | undefined;
  alt: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Clickable product thumbnail component with lazy loading and error handling.
 * Uses URL-based images (no file upload).
 */
export function ProductThumbnail({
  imageUrl,
  alt,
  className = 'w-10 h-10',
  onClick,
}: ProductThumbnailProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset error state when imageUrl changes
  React.useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [imageUrl]);

  if (!imageUrl || imageError) {
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

  return (
    <div 
      className={`${className} rounded border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View ${alt}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {!imageLoaded && (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <ImageIcon className="w-5 h-5 text-muted-foreground animate-pulse" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full object-cover ${imageLoaded ? '' : 'hidden'}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImageError(true)}
        onLoad={() => setImageLoaded(true)}
      />
    </div>
  );
}
