import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { ToastComponent } from '../../shared/toast/toast.component';
import { ToastService } from '../../shared/toast/toast.service';
import {
  ActiveDrag,
  LogoFitMode,
  PLAQUINHA_LABELS,
  PlaquinhaMode,
  PlaquinhaState,
  applyDragDelta,
  clearImageCache,
  configurePdfWorker,
  createDefaultPlaquinhaState,
  exportPlaquinhasPdf,
  fileToDataURL,
  getPlaquinhaSrc,
  placaSizeLabel,
  renderPlaquinhaSheet,
  snapOffsetsAfterDrag,
} from '../../utils/plaquinhas-camarote.engine';

interface UploadSlotState {
  loading: boolean;
  fileName: string | null;
  preview: string | null;
  error: string | null;
}

interface ConverterState {
  loading: boolean;
  done: boolean;
  error: string | null;
  preview: string | null;
  fileName: string | null;
}

const PRIMARY_CELL_INDEX = 0;

@Component({
  selector: 'app-plaquinhas-camarote',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, ToastComponent, FormsModule],
  templateUrl: './plaquinhas-camarote.component.html',
  styleUrl: './plaquinhas-camarote.component.scss',
})
export class PlaquinhasCamaroteComponent implements AfterViewInit, OnDestroy {
  private readonly toast = inject(ToastService);

  readonly labels = PLAQUINHA_LABELS;
  readonly placaSizeLabel = placaSizeLabel;
  readonly acceptFiles = '.png,.jpg,.jpeg,.webp,.svg,.pdf,.ai';

  readonly state = signal<PlaquinhaState>(createDefaultPlaquinhaState());
  readonly exporting = signal(false);

  readonly singleUpload = signal<UploadSlotState>({
    loading: false,
    fileName: null,
    preview: null,
    error: null,
  });

  readonly cellUploads = signal<UploadSlotState[]>([
    { loading: false, fileName: null, preview: null, error: null },
    { loading: false, fileName: null, preview: null, error: null },
    { loading: false, fileName: null, preview: null, error: null },
  ]);

  readonly converter = signal<ConverterState>({
    loading: false,
    done: false,
    error: null,
    preview: null,
    fileName: null,
  });

  readonly singleInputKey = signal(0);
  readonly cellInputKeys = signal([0, 0, 0]);
  readonly convInputKey = signal(0);
  readonly highlightedCell = signal<number | null>(null);

  private activeDrag: ActiveDrag | null = null;

  @ViewChild('sheet') sheetRef?: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    configurePdfWorker();
    this.refreshPreview();
  }

  ngOnDestroy(): void {
    this.activeDrag = null;
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    this.handleDragMove(event.clientX, event.clientY);
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    this.finishDrag();
  }

  @HostListener('window:touchmove', ['$event'])
  onWindowTouchMove(event: TouchEvent): void {
    if (!this.activeDrag || !event.touches[0]) return;
    event.preventDefault();
    this.handleDragMove(event.touches[0].clientX, event.touches[0].clientY);
  }

  @HostListener('window:touchend')
  onWindowTouchEnd(): void {
    this.finishDrag();
  }

  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          void this.convertFile(file);
          break;
        }
      }
    }
  }

  setMode(mode: PlaquinhaMode): void {
    this.state.update((s) => ({ ...s, mode }));
    this.refreshPreview();
  }

  setDimension(field: 'width' | 'height' | 'gap', value: number): void {
    this.state.update((s) => ({
      ...s,
      dimensions: { ...s.dimensions, [field]: value },
    }));
    this.refreshPreview();
  }

  isCardLocked(index: number): boolean {
    return this.state().syncAll && index !== PRIMARY_CELL_INDEX;
  }

  isPrimaryCard(index: number): boolean {
    return this.state().syncAll && index === PRIMARY_CELL_INDEX;
  }

  setSyncAll(checked: boolean): void {
    this.state.update((s) => {
      if (!checked) return { ...s, syncAll: false };

      const primaryOffset = { ...s.offsets[PRIMARY_CELL_INDEX] };
      return {
        ...s,
        syncAll: true,
        scales: s.scales.map(() => s.scales[PRIMARY_CELL_INDEX]),
        bgColors: s.bgColors.map(() => s.bgColors[PRIMARY_CELL_INDEX]),
        logoModes: s.logoModes.map(() => s.logoModes[PRIMARY_CELL_INDEX]),
        offsets: s.offsets.map(() => ({ ...primaryOffset })),
      };
    });
    this.refreshPreview();
  }

  setScale(index: number, value: number): void {
    if (this.isCardLocked(index)) return;

    const v = Math.min(200, Math.max(10, value));
    this.state.update((s) => {
      const scales = [...s.scales];
      if (s.syncAll) {
        scales.fill(v);
      } else {
        scales[index] = v;
      }
      return { ...s, scales };
    });
    this.refreshPreview();
  }

  rotateCell(index: number): void {
    if (this.isCardLocked(index)) return;

    this.state.update((s) => {
      const rotations = s.syncAll
        ? s.rotations.map((r) => (r + 90) % 360)
        : s.rotations.map((r, i) => (i === index ? (r + 90) % 360 : r));
      return { ...s, rotations };
    });
    this.refreshPreview();
  }

  centerCell(index: number): void {
    if (this.isCardLocked(index)) return;

    this.state.update((s) => ({
      ...s,
      offsets: s.syncAll
        ? s.offsets.map(() => ({ x: 0, y: 0 }))
        : s.offsets.map((o, i) => (i === index ? { x: 0, y: 0 } : o)),
    }));
    this.refreshPreview();
  }

  setBgColor(index: number, color: string): void {
    if (this.isCardLocked(index)) return;

    this.state.update((s) => {
      const bgColors = s.syncAll
        ? s.bgColors.map(() => color)
        : s.bgColors.map((c, i) => (i === index ? color : c));
      return { ...s, bgColors };
    });
    this.refreshPreview();
  }

  setBgWhite(index: number): void {
    this.setBgColor(index, '#ffffff');
  }

  setLogoMode(index: number, mode: LogoFitMode): void {
    if (this.isCardLocked(index)) return;

    this.state.update((s) => {
      const logoModes = s.syncAll
        ? s.logoModes.map(() => mode)
        : s.logoModes.map((m, i) => (i === index ? mode : m));
      return { ...s, logoModes };
    });
    this.refreshPreview();
  }

  setHighlightedCell(index: number | null): void {
    this.highlightedCell.set(index);
    this.refreshPreview();
  }

  hasSrc(index: number): boolean {
    return !!getPlaquinhaSrc(this.state(), index);
  }

  async onSingleFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.loadSingleFile(file);
    this.singleInputKey.update((k) => k + 1);
  }

  async onCellFileSelected(index: number, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.loadCellFile(index, file);
    this.cellInputKeys.update((keys) => {
      const next = [...keys];
      next[index] += 1;
      return next;
    });
  }

  async onConvFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.convertFile(file);
    this.convInputKey.update((k) => k + 1);
  }

  onSingleDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.loadSingleFile(file);
  }

  onCellDrop(index: number, event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.loadCellFile(index, file);
  }

  onConvDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.convertFile(file);
  }

  preventDragDefault(event: DragEvent): void {
    event.preventDefault();
  }

  downloadConvertedPng(): void {
    const conv = this.converter();
    if (!conv.preview || !conv.fileName) return;
    const a = document.createElement('a');
    a.href = conv.preview;
    a.download = conv.fileName.replace(/\.[^.]+$/, '') + '.png';
    a.click();
  }

  useConvertedPng(): void {
    const conv = this.converter();
    if (!conv.preview) return;

    clearImageCache();
    this.state.update((s) => ({
      ...s,
      mode: 'single',
      singleSrc: conv.preview,
      offsets: s.offsets.map(() => ({ x: 0, y: 0 })),
    }));
    this.singleUpload.set({
      loading: false,
      fileName: conv.fileName,
      preview: conv.preview,
      error: null,
    });
    this.setMode('single');
    this.refreshPreview();
    this.toast.success('Arte convertida aplicada às plaquinhas.');
  }

  async exportPdf(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      await exportPlaquinhasPdf(this.state());
      this.toast.success('PDF gerado com sucesso.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível gerar o PDF.';
      this.toast.error(message);
    } finally {
      this.exporting.set(false);
    }
  }

  private async loadSingleFile(file: File): Promise<void> {
    this.singleUpload.set({ loading: true, fileName: file.name, preview: null, error: null });
    clearImageCache();
    this.state.update((s) => ({
      ...s,
      singleSrc: null,
      offsets: s.offsets.map(() => ({ x: 0, y: 0 })),
    }));

    try {
      const dataUrl = await fileToDataURL(file);
      this.state.update((s) => ({ ...s, singleSrc: dataUrl }));
      this.singleUpload.set({
        loading: false,
        fileName: file.name,
        preview: dataUrl,
        error: null,
      });
      this.refreshPreview();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar arquivo';
      this.singleUpload.set({
        loading: false,
        fileName: file.name,
        preview: null,
        error: message,
      });
      this.toast.error(message);
    }
  }

  private async loadCellFile(index: number, file: File): Promise<void> {
    this.cellUploads.update((slots) => {
      const next = [...slots];
      next[index] = { loading: true, fileName: file.name, preview: null, error: null };
      return next;
    });
    clearImageCache();

    try {
      const dataUrl = await fileToDataURL(file);
      this.state.update((s) => {
        const cellSrcs = [...s.cellSrcs];
        cellSrcs[index] = dataUrl;
        const offsets = [...s.offsets];
        offsets[index] = { x: 0, y: 0 };
        return { ...s, cellSrcs, offsets };
      });
      this.cellUploads.update((slots) => {
        const next = [...slots];
        next[index] = {
          loading: false,
          fileName: file.name,
          preview: dataUrl,
          error: null,
        };
        return next;
      });
      this.refreshPreview();
    } catch {
      this.cellUploads.update((slots) => {
        const next = [...slots];
        next[index] = {
          loading: false,
          fileName: file.name,
          preview: null,
          error: 'Erro ao carregar arquivo',
        };
        return next;
      });
      this.toast.error('Erro ao carregar arquivo');
    }
  }

  private async convertFile(file: File): Promise<void> {
    this.converter.set({
      loading: true,
      done: false,
      error: null,
      preview: null,
      fileName: file.name,
    });

    try {
      const dataUrl = await fileToDataURL(file);
      this.converter.set({
        loading: false,
        done: true,
        error: null,
        preview: dataUrl,
        fileName: file.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro na conversão';
      this.converter.set({
        loading: false,
        done: false,
        error: message,
        preview: null,
        fileName: file.name,
      });
      this.toast.error(message);
    }
  }

  private refreshPreview(): void {
    const sheet = this.sheetRef?.nativeElement;
    if (!sheet) return;
    const state = this.state();
    renderPlaquinhaSheet(
      sheet,
      state,
      (index, event) => this.startDrag(index, event),
      this.highlightedCell()
    );
  }

  private startDrag(index: number, event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    const state = this.state();
    if (!getPlaquinhaSrc(state, index)) return;
    if (state.syncAll && index !== PRIMARY_CELL_INDEX) return;

    const point = 'touches' in event ? event.touches[0] : event;
    this.activeDrag = {
      idx: index,
      sx: point.clientX,
      sy: point.clientY,
      startOffsets: state.offsets.map((o) => ({ ...o })),
    };
  }

  private handleDragMove(clientX: number, clientY: number): void {
    if (!this.activeDrag) return;
    const dx = clientX - this.activeDrag.sx;
    const dy = clientY - this.activeDrag.sy;
    const state = this.state();
    const offsets = applyDragDelta(state, this.activeDrag, dx, dy);
    this.state.update((s) => ({ ...s, offsets }));
    this.refreshPreview();
  }

  private finishDrag(): void {
    if (!this.activeDrag) return;
    const { idx } = this.activeDrag;
    const state = this.state();
    const offsets = snapOffsetsAfterDrag(state, idx);
    this.state.update((s) => ({ ...s, offsets }));
    this.activeDrag = null;
    this.refreshPreview();
  }
}
