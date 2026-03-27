import { Capacitor } from '@capacitor/core';

let Badge: any = null;

async function getBadgePlugin() {
  if (Badge) return Badge;
  
  // Only import on native platforms
  if (Capacitor.isNativePlatform()) {
    try {
      const mod = await import('@capawesome/capacitor-badge');
      Badge = mod.Badge;
      return Badge;
    } catch (e) {
      console.log('Badge plugin not available:', e);
      return null;
    }
  }
  
  // Fallback: Web Badge API
  if ('setAppBadge' in navigator) {
    return {
      set: async ({ count }: { count: number }) => {
        await (navigator as any).setAppBadge(count);
      },
      clear: async () => {
        await (navigator as any).clearAppBadge();
      },
      isSupported: async () => ({ isSupported: true }),
    };
  }
  
  return null;
}

export async function setBadgeCount(count: number): Promise<void> {
  try {
    const badge = await getBadgePlugin();
    if (!badge) return;
    
    if (count > 0) {
      await badge.set({ count });
    } else {
      await badge.clear();
    }
  } catch (error) {
    console.log('Badge update failed:', error);
  }
}

export async function clearBadge(): Promise<void> {
  try {
    const badge = await getBadgePlugin();
    if (!badge) return;
    await badge.clear();
  } catch (error) {
    console.log('Badge clear failed:', error);
  }
}

export async function isBadgeSupported(): Promise<boolean> {
  try {
    const badge = await getBadgePlugin();
    if (!badge) return false;
    
    if (typeof badge.isSupported === 'function') {
      const result = await badge.isSupported();
      return result.isSupported;
    }
    return true;
  } catch {
    return false;
  }
}
