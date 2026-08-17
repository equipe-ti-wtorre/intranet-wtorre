import { Injectable } from '@angular/core';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import {
  MergeResult,
  PdfFileEntry,
  PdfToolsError,
  SplitMode,
  SplitResult,
} from './pdf-tools.model';
import { parsePageRange } from './pdf-page-range.util';

let entryIdSeq = 0;

function nextEntryId(): string {
  entryIdSeq += 1;
  return `pdf-${entryIdSeq}`;
}

function sanitizeBaseName(name: string): string {
  const withoutExt = name.replace(/\.pdf$/i, '');
  const sanitized = withoutExt
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w.\-()+áàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ]/g, '');
  return sanitized || 'documento';
}

function toPdfBlob(bytes: Uint8Array): Blob {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/pdf' });
}

function toZipBlob(bytes: Uint8Array): Blob {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/zip' });
}

function mapPdfLoadError(err: unknown): PdfToolsError {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (
    msg.includes('password') ||
    msg.includes('encrypted') ||
    msg.includes('encrypt')
  ) {
    return new PdfToolsError(
      'Este PDF está protegido por senha e não pode ser processado.'
    );
  }

  return new PdfToolsError(
    'Não foi possível ler o PDF. Verifique se o arquivo está íntegro.'
  );
}

@Injectable()
export class PdfToolsService {
  async loadPdfFile(file: File): Promise<PdfFileEntry> {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      throw new PdfToolsError('Selecione apenas arquivos PDF.');
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      throw new PdfToolsError(
        'Não foi possível ler o arquivo. Tente selecioná-lo novamente.'
      );
    }

    let document: PDFDocument;
    try {
      document = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (err) {
      throw mapPdfLoadError(err);
    }

    if (document.isEncrypted) {
      throw new PdfToolsError(
        'Este PDF está protegido por senha e não pode ser processado.'
      );
    }

    const pageCount = document.getPageCount();
    if (pageCount === 0) {
      throw new PdfToolsError('O PDF não contém páginas.');
    }

    return {
      id: nextEntryId(),
      file,
      name: file.name,
      size: file.size,
      pageCount,
      document,
    };
  }

  async mergePdfs(entries: PdfFileEntry[]): Promise<MergeResult> {
    if (entries.length < 2) {
      throw new PdfToolsError('Selecione ao menos 2 PDFs para unir.');
    }

    const merged = await PDFDocument.create();
    let totalPages = 0;

    for (const entry of entries) {
      const pageIndices = entry.document.getPageIndices();
      const copied = await merged.copyPages(entry.document, pageIndices);
      for (const page of copied) {
        merged.addPage(page);
      }
      totalPages += entry.pageCount;
    }

    const pdfBytes = await merged.save();
    const blob = toPdfBlob(pdfBytes);

    return {
      blob,
      pageCount: totalPages,
      filename: 'unido.pdf',
    };
  }

  async splitPdf(
    entry: PdfFileEntry,
    mode: SplitMode,
    options: { pageRange?: string; pagesPerChunk?: number }
  ): Promise<SplitResult> {
    const base = sanitizeBaseName(entry.name);
    const totalPages = entry.pageCount;

    switch (mode) {
      case 'extract':
        return this.splitExtract(entry, base, totalPages, options.pageRange ?? '');
      case 'everyN':
        return this.splitEveryN(entry, base, totalPages, options.pagesPerChunk ?? 0);
      case 'individual':
        return this.splitIndividual(entry, base, totalPages);
      default:
        throw new PdfToolsError('Modo de divisão inválido.');
    }
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private async splitExtract(
    entry: PdfFileEntry,
    base: string,
    totalPages: number,
    pageRange: string
  ): Promise<SplitResult> {
    const indices = parsePageRange(pageRange, totalPages);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(entry.document, indices);
    for (const page of copied) {
      out.addPage(page);
    }

    const pdfBytes = await out.save();
    return {
      blob: toPdfBlob(pdfBytes),
      filename: `${base}-extrair.pdf`,
      fileCount: 1,
      pageCount: indices.length,
    };
  }

  private async splitEveryN(
    entry: PdfFileEntry,
    base: string,
    totalPages: number,
    pagesPerChunk: number
  ): Promise<SplitResult> {
    if (!Number.isInteger(pagesPerChunk) || pagesPerChunk < 1) {
      throw new PdfToolsError('Informe um número válido de páginas por bloco (≥ 1).');
    }

    const zip = new JSZip();
    let fileCount = 0;
    let totalOutPages = 0;

    for (let start = 0; start < totalPages; start += pagesPerChunk) {
      const end = Math.min(start + pagesPerChunk, totalPages);
      const indices = Array.from({ length: end - start }, (_, i) => start + i);

      const chunk = await PDFDocument.create();
      const copied = await chunk.copyPages(entry.document, indices);
      for (const page of copied) {
        chunk.addPage(page);
      }

      const pdfBytes = await chunk.save();
      const filename = `${base}-p${start + 1}-${end}.pdf`;
      zip.file(filename, pdfBytes);
      fileCount += 1;
      totalOutPages += indices.length;
    }

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    return {
      blob: toZipBlob(zipBytes),
      filename: `${base}-dividido.zip`,
      fileCount,
      pageCount: totalOutPages,
    };
  }

  private async splitIndividual(
    entry: PdfFileEntry,
    base: string,
    totalPages: number
  ): Promise<SplitResult> {
    const zip = new JSZip();

    for (let i = 0; i < totalPages; i++) {
      const single = await PDFDocument.create();
      const [page] = await single.copyPages(entry.document, [i]);
      single.addPage(page);
      const pdfBytes = await single.save();
      zip.file(`${base}-p${i + 1}.pdf`, pdfBytes);
    }

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    return {
      blob: toZipBlob(zipBytes),
      filename: `${base}-paginas.zip`,
      fileCount: totalPages,
      pageCount: totalPages,
    };
  }
}
