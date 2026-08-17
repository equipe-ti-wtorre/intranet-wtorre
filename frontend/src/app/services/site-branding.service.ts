import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MenuService } from './menu.service';

const DEFAULT_FAVICON = 'favicon.ico';
const DEFAULT_FAVICON_TYPE = 'image/x-icon';

@Injectable({ providedIn: 'root' })
export class SiteBrandingService {
  private readonly menuService = inject(MenuService);

  async init(): Promise<void> {
    if (typeof document === 'undefined') return;

    try {
      const config = await firstValueFrom(this.menuService.getLoginPublic());
      this.applyFavicon(config.favicon_url);
    } catch {
      this.applyFavicon(null);
    }
  }

  applyFavicon(url: string | null | undefined): void {
    if (typeof document === 'undefined') return;

    const head = document.head;
    head
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((el) => el.remove());

    const link = document.createElement('link');
    link.rel = 'icon';

    const trimmed = url?.trim();
    if (trimmed) {
      link.href = withCacheBust(trimmed);
      link.type = faviconMimeFromUrl(trimmed);
    } else {
      link.href = withCacheBust(DEFAULT_FAVICON);
      link.type = DEFAULT_FAVICON_TYPE;
    }

    head.appendChild(link);
  }
}

function withCacheBust(url: string): string {
  const stamp = Date.now();
  return url.includes('?') ? `${url}&v=${stamp}` : `${url}?v=${stamp}`;
}

function faviconMimeFromUrl(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.ico')) return 'image/x-icon';
  return DEFAULT_FAVICON_TYPE;
}

export function siteBrandingInitializer(branding: SiteBrandingService): () => Promise<void> {
  return () => branding.init();
}
