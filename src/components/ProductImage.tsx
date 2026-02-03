import React, { useState, useEffect } from 'react';
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
 * Component that displays product photos using signed URLs.
 * Automatically fetches a signed URL for the product photo.
 * Uses skeleton loader for smooth loading experience.
 */
export function ProductImage({ 
  photoUrl, 
  alt, 
  className = 'w-10 h-10 rounded object-cover',
  fallbackClassName = 'w-10 h-10 rounded bg-muted flex items-center justify-center',
  showLoader = true
}: ProductImageProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchSignedUrl() {
      if (!photoUrl) {
        setSignedUrl(null);
        return;
      }

      setLoading(true);
      setError(false);
      setImageLoaded(false);

      try {
        const url = await getProductPhotoUrl(photoUrl);
        if (mounted) {
          if (url) {
            setSignedUrl(url);
          } else {
            setError(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch signed URL:', err);
        if (mounted) {
          setError(true);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchSignedUrl();

    return () => {
      mounted = false;
    };
  }, [photoUrl]);

  // No photo URL or error - show fallback icon
  if (!photoUrl || error) {
    return (
      <div className={fallbackClassName}>
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  // Loading signed URL - show skeleton
  if (loading && showLoader) {
    return (
      <Skeleton className={cn(className, 'bg-muted')} />
    );
  }

  // Have signed URL - show image with skeleton overlay until loaded
  if (signedUrl) {
    return (
      <div className="relative">
        {!imageLoaded && showLoader && (
          <Skeleton className={cn(className, 'absolute inset-0 bg-muted')} />
        )}
        <img 
          src={signedUrl} 
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
