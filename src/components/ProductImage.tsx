import { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { getProductPhotoUrl } from '@/lib/storage';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  photoUrl: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  showLoader?: boolean;
}

/**
 * Component that displays product photos using public URLs.
 * Product-photos bucket is public for better performance.
 * Uses skeleton loader for smooth loading experience.
 */
export function ProductImage({ 
  photoUrl, 
  alt, 
  className = 'w-10 h-10 rounded object-cover',
  fallbackClassName = 'w-10 h-10 rounded bg-muted flex items-center justify-center',
  showLoader = true
}: ProductImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!photoUrl) {
      setImageUrl(null);
      return;
    }

    setError(false);
    setImageLoaded(false);
    
    // Get public URL (synchronous operation now)
    getProductPhotoUrl(photoUrl)
      .then(url => {
        setImageUrl(url);
      })
      .catch(() => {
        setError(true);
      });
  }, [photoUrl]);

  // No photo URL or error - show fallback icon
  if (!photoUrl || error) {
    return (
      <div className={fallbackClassName}>
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  // Waiting for URL - show skeleton
  if (!imageUrl && showLoader) {
    return (
      <Skeleton className={cn(className, 'bg-muted')} />
    );
  }

  // Have URL - show image with skeleton overlay until loaded
  if (imageUrl) {
    return (
      <div className="relative">
        {!imageLoaded && showLoader && (
          <Skeleton className={cn(className, 'absolute inset-0 bg-muted')} />
        )}
        <img 
          src={imageUrl} 
          alt={alt}
          className={cn(
            className,
            'transition-opacity duration-300',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div className={fallbackClassName}>
      <ImageIcon className="w-5 h-5 text-muted-foreground" />
    </div>
  );
}
