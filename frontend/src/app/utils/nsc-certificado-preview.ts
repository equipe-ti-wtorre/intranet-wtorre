import * as pdfjsLib from 'pdfjs-dist';

let workerReady = false;

function configureWorker(): void {
  if (workerReady || typeof Worker === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
    new URL('../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' }
  );
  workerReady = true;
}

export async function previewCertificadoBlob(blob: Blob): Promise<string> {
  if (blob.type.startsWith('image/')) {
    return URL.createObjectURL(blob);
  }

  configureWorker();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.8, 1400 / Math.max(base.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    doc.cleanup();
  }
}
