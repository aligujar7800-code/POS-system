import { useState, useEffect } from 'react';
import { cmd } from './utils';

export function useImageSrc(imagePath: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePath) {
      setSrc(null);
      return;
    }
    
    // If it's a raw base64 data string (e.g., from local state before saving), just use it directly
    if (imagePath.startsWith('data:image')) {
      setSrc(imagePath);
      return;
    }

    const load = async () => {
      try {
        const base64Str = await cmd<string>('get_image_base64', { imagePath });
        setSrc(base64Str);
      } catch (e) {
        console.error("Failed to load image:", e);
        setSrc(null);
      }
    };

    load();
  }, [imagePath]);

  return src;
}
