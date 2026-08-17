import { PdfToolsError } from './pdf-tools.model';

const SEGMENT_RE = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/;

/**
 * Converte texto como "1-3, 5, 8-10" em índices de página 0-based,
 * deduplicados e ordenados. Valida limites [1..totalPages].
 */
export function parsePageRange(input: string, totalPages: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PdfToolsError('Informe ao menos uma página (ex.: 1-3, 5, 8-10).');
  }

  const segments = trimmed.split(',');
  const pages = new Set<number>();

  for (const segment of segments) {
    const part = segment.trim();
    if (!part) {
      throw new PdfToolsError(
        'Intervalo inválido: trecho vazio (use formato 1-3, 5, 8-10).'
      );
    }

    const match = SEGMENT_RE.exec(part);
    if (!match) {
      throw new PdfToolsError(
        `Intervalo inválido: "${part}" (use formato 1-3, 5, 8-10).`
      );
    }

    const start = Number(match[1]);
    const end = match[2] != null ? Number(match[2]) : start;

    if (start < 1 || end < 1) {
      throw new PdfToolsError(
        `Intervalo inválido: "${part}" (páginas devem ser ≥ 1).`
      );
    }

    if (start > end) {
      throw new PdfToolsError(
        `Intervalo inválido: "${part}" (a página inicial deve ser ≤ a final).`
      );
    }

    if (end > totalPages) {
      throw new PdfToolsError(
        `Intervalo inválido: "${part}" (o PDF tem apenas ${totalPages} página${totalPages === 1 ? '' : 's'}).`
      );
    }

    for (let p = start; p <= end; p++) {
      pages.add(p - 1);
    }
  }

  return [...pages].sort((a, b) => a - b);
}
