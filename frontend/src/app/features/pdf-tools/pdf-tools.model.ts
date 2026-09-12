import { PDFDocument } from 'pdf-lib';

export type SplitMode = 'extract' | 'everyN' | 'individual';

export interface PdfFileEntry {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  document: PDFDocument;
}

export interface MergeResult {
  blob: Blob;
  pageCount: number;
  filename: string;
}

export interface SplitResult {
  blob: Blob;
  filename: string;
  fileCount: number;
  pageCount: number;
}

export class PdfToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfToolsError';
  }
}
