import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { PdfFileEntry, PdfToolsError, SplitMode } from './pdf-tools.model';
import { PdfToolsService } from './pdf-tools.service';

type TabMode = 'merge' | 'split';

interface DownloadResult {
  url: string;
  filename: string;
  text: string;
}

@Component({
  selector: 'app-pdf-tools',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, FormsModule, DragDropModule],
  providers: [PdfToolsService],
  templateUrl: './pdf-tools.component.html',
  styleUrl: './pdf-tools.component.scss',
})
export class PdfToolsComponent implements OnDestroy {
  private readonly pdfTools = inject(PdfToolsService);

  readonly activeTab = signal<TabMode>('merge');
  readonly processando = signal(false);

  readonly mergeFiles = signal<PdfFileEntry[]>([]);
  readonly mergeInputKey = signal(0);
  readonly mergeLoading = signal(false);
  readonly mergeDragOver = signal(false);
  readonly mergeStatus = signal('');
  readonly mergeStatusErr = signal(false);
  readonly mergeResult = signal<DownloadResult | null>(null);

  readonly splitFile = signal<PdfFileEntry | null>(null);
  readonly splitInputKey = signal(0);
  readonly splitLoading = signal(false);
  readonly splitDragOver = signal(false);
  readonly splitMode = signal<SplitMode>('extract');
  readonly pageRange = signal('');
  readonly pagesPerChunk = signal(1);
  readonly splitStatus = signal('');
  readonly splitStatusErr = signal(false);
  readonly splitResult = signal<DownloadResult | null>(null);

  readonly podeUnir = computed(
    () => this.mergeFiles().length >= 2 && !this.processando() && !this.mergeLoading()
  );

  readonly podeDividir = computed(
    () => !!this.splitFile() && !this.processando() && !this.splitLoading()
  );

  readonly splitRangeHint = computed(() => {
    const entry = this.splitFile();
    if (!entry) return 'Intervalos e páginas soltas, separados por vírgula.';
    return `Intervalos e páginas soltas (1 a ${entry.pageCount}), separados por vírgula.`;
  });

  ngOnDestroy(): void {
    this.revokeMergeResult();
    this.revokeSplitResult();
  }

  setTab(tab: TabMode): void {
    this.activeTab.set(tab);
  }

  preventDragDefault(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDragEnter(zone: 'merge' | 'split'): void {
    if (zone === 'merge') this.mergeDragOver.set(true);
    else this.splitDragOver.set(true);
  }

  onDragLeave(zone: 'merge' | 'split', event: DragEvent): void {
    const current = event.currentTarget as HTMLElement;
    if (current.contains(event.relatedTarget as Node)) return;
    if (zone === 'merge') this.mergeDragOver.set(false);
    else this.splitDragOver.set(false);
  }

  // --- Unir ---

  onMergeDrop(event: DragEvent): void {
    this.preventDragDefault(event);
    this.mergeDragOver.set(false);
    if (this.processando() || this.mergeLoading()) return;
    const files = event.dataTransfer?.files;
    if (files?.length) {
      void this.addMergeFiles(Array.from(files));
    }
  }

  onMergeFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files?.length) {
      void this.addMergeFiles(Array.from(files));
    }
    this.mergeInputKey.update((k) => k + 1);
  }

  openMergeFilePicker(input: HTMLInputElement): void {
    if (this.processando() || this.mergeLoading()) return;
    input.click();
  }

  onMergeDropzoneKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openMergeFilePicker(input);
    }
  }

  async addMergeFiles(files: File[]): Promise<void> {
    const pdfs = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (!pdfs.length) {
      this.setMergeStatus('Selecione apenas arquivos PDF.', true);
      return;
    }

    this.mergeLoading.set(true);
    this.revokeMergeResult();
    this.setMergeStatus('Lendo arquivos…', false);

    try {
      const loaded: PdfFileEntry[] = [];
      for (const file of pdfs) {
        try {
          loaded.push(await this.pdfTools.loadPdfFile(file));
        } catch (err) {
          this.setMergeStatus(
            `Não consegui abrir "${file.name}" (arquivo corrompido ou protegido).`,
            true
          );
        }
      }
      if (loaded.length) {
        this.mergeFiles.update((list) => [...list, ...loaded]);
        this.setMergeStatus('', false);
      }
    } finally {
      this.mergeLoading.set(false);
    }
  }

  onMergeReorder(event: CdkDragDrop<PdfFileEntry[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.mergeFiles.update((list) => {
      const copy = [...list];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return copy;
    });
    this.revokeMergeResult();
  }

  removeMergeFile(id: string): void {
    this.mergeFiles.update((list) => list.filter((f) => f.id !== id));
    this.revokeMergeResult();
  }

  async mergePdfs(): Promise<void> {
    if (!this.podeUnir()) return;

    this.processando.set(true);
    this.revokeMergeResult();
    this.setMergeStatus('Unindo…', false);

    try {
      const result = await this.pdfTools.mergePdfs(this.mergeFiles());
      const count = this.mergeFiles().length;
      this.mergeResult.set({
        url: URL.createObjectURL(result.blob),
        filename: result.filename,
        text: `Pronto! ${count} arquivo${count === 1 ? '' : 's'} unido${count === 1 ? '' : 's'} · ${result.pageCount} página${result.pageCount === 1 ? '' : 's'}.`,
      });
      this.setMergeStatus('', false);
    } catch (err) {
      this.setMergeStatus(`Erro ao unir: ${this.extractError(err)}`, true);
    } finally {
      this.processando.set(false);
    }
  }

  // --- Dividir ---

  onSplitDrop(event: DragEvent): void {
    this.preventDragDefault(event);
    this.splitDragOver.set(false);
    if (this.processando() || this.splitLoading()) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.loadSplitFile(file);
    }
  }

  onSplitFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.loadSplitFile(file);
    }
    this.splitInputKey.update((k) => k + 1);
  }

  openSplitFilePicker(input: HTMLInputElement): void {
    if (this.processando() || this.splitLoading()) return;
    input.click();
  }

  onSplitDropzoneKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openSplitFilePicker(input);
    }
  }

  async loadSplitFile(file: File): Promise<void> {
    this.splitLoading.set(true);
    this.revokeSplitResult();
    this.setSplitStatus('Lendo…', false);

    try {
      const entry = await this.pdfTools.loadPdfFile(file);
      this.splitFile.set(entry);
      this.setSplitStatus('', false);
    } catch (err) {
      this.splitFile.set(null);
      this.setSplitStatus(
        'Não consegui abrir o PDF (corrompido ou protegido por senha).',
        true
      );
    } finally {
      this.splitLoading.set(false);
    }
  }

  clearSplitFile(): void {
    this.splitFile.set(null);
    this.revokeSplitResult();
    this.setSplitStatus('', false);
  }

  setSplitMode(mode: SplitMode): void {
    this.splitMode.set(mode);
    this.revokeSplitResult();
  }

  async splitPdf(): Promise<void> {
    const entry = this.splitFile();
    if (!entry || !this.podeDividir()) return;

    this.processando.set(true);
    this.revokeSplitResult();
    this.setSplitStatus('Processando…', false);

    try {
      const result = await this.pdfTools.splitPdf(entry, this.splitMode(), {
        pageRange: this.pageRange(),
        pagesPerChunk: this.pagesPerChunk(),
      });

      const text =
        result.fileCount === 1
          ? `Pronto! ${result.pageCount} página${result.pageCount === 1 ? '' : 's'} extraída${result.pageCount === 1 ? '' : 's'}.`
          : `Pronto! ${result.fileCount} arquivos gerados no .zip.`;

      this.splitResult.set({
        url: URL.createObjectURL(result.blob),
        filename: result.filename,
        text,
      });
      this.setSplitStatus('', false);
    } catch (err) {
      this.setSplitStatus(`Erro: ${this.extractError(err)}`, true);
    } finally {
      this.processando.set(false);
    }
  }

  formatSize(bytes: number): string {
    return this.pdfTools.formatFileSize(bytes);
  }

  private setMergeStatus(text: string, isErr: boolean): void {
    this.mergeStatus.set(text);
    this.mergeStatusErr.set(isErr);
  }

  private setSplitStatus(text: string, isErr: boolean): void {
    this.splitStatus.set(text);
    this.splitStatusErr.set(isErr);
  }

  private revokeMergeResult(): void {
    const current = this.mergeResult();
    if (current?.url) {
      URL.revokeObjectURL(current.url);
    }
    this.mergeResult.set(null);
  }

  private revokeSplitResult(): void {
    const current = this.splitResult();
    if (current?.url) {
      URL.revokeObjectURL(current.url);
    }
    this.splitResult.set(null);
  }

  private extractError(err: unknown): string {
    if (err instanceof PdfToolsError) return err.message;
    if (err instanceof Error && err.message) return err.message;
    return 'Ocorreu um erro ao processar o PDF.';
  }
}
