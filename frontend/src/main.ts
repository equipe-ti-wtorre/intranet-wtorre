import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

const CHUNK_RELOAD_KEY = 'intranet_chunk_reload';

function isChunkLoadError(reason: unknown): boolean {
  const msg = String(
    (reason as Error)?.message ?? (reason as { message?: string })?.message ?? reason ?? ''
  ).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('mime type') ||
    msg.includes('module script')
  );
}

function registerChunkLoadRecovery(): void {
  window.addEventListener('unhandledrejection', (event) => {
    if (!isChunkLoadError(event.reason)) return;
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    event.preventDefault();
    window.location.reload();
  });
}

registerChunkLoadRecovery();

bootstrapApplication(App, appConfig)
  .then(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY))
  .catch((err) => console.error(err));
