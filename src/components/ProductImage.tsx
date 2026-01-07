import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { getProductPhotoUrl } from '@/lib/storage';

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

  if (!photoUrl || error) {
    return (
      <div className={fallbackClassName}>
        <ImageIcon className="w-5 h-5 text-muted-foreground" />
      </div>
    );
  }

  if (loading && showLoader) {
    return (
      <div className={fallbackClassName}>
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (signedUrl) {
    return (
      <img 
        src={signedUrl} 
        alt={alt}
        className={className}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div className={fallbackClassName}>
      <ImageIcon className="w-5 h-5 text-muted-foreground" />
    </div>
  );
}
