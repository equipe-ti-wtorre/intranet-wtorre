export type CopyHtmlResult = 'html' | 'text-fallback';

export async function copyAssinaturaHtmlToClipboard(html: string): Promise<CopyHtmlResult> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('Clipboard não disponível neste navegador.');
  }

  if (typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([html], { type: 'text/plain' }),
        }),
      ]);
      return 'html';
    } catch {
      /* fallback abaixo */
    }
  }

  await navigator.clipboard.writeText(html);
  return 'text-fallback';
}
