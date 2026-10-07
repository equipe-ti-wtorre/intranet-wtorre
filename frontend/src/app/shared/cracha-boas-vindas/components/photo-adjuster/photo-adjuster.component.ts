import { DecimalPipe } from '@angular/common';
import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FotoAjuste } from '../../models/colaborador-cracha.model';
import { standalonePhotoSVG } from '../../utils/render.util';
import { clampPan, normalizeRotation, novaFotoAjuste, resizeImageFile } from '../../utils/photo.util';

/**
 * Componente reutilizavel de upload + ajuste de foto (zoom, rotacao e posicionamento por arraste).
 * Usado tanto na ferramenta standalone de Cracha/Boas-vindas quanto na Solicitacao de Colaborador
 * (geracao automatica), pra nao duplicar a logica de drag/zoom/rotacao em dois lugares.
 */
@Component({
  selector: 'app-photo-adjuster',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './photo-adjuster.component.html',
  styleUrl: './photo-adjuster.component.scss',
})
export class PhotoAdjusterComponent {
  @Input() foto: FotoAjuste | null = null;
  @Input() strokeColor = '#01679E';
  // O anel/slider/botões usam a mesma cor do stroke da foto (--accent), pra não ficar com um
  // anel duplo (borda CSS azul fixa + stroke do SVG na cor da marca) quando a marca não é azul.
  @HostBinding('style.--accent') get accentVar(): string {
    return this.strokeColor;
  }
  @Input() diameter = 96;
  // false quando o upload já acontece em outro campo da tela (ex.: Solicitação de Colaborador,
  // que tem sua própria dropzone de "Foto") — aqui só entram os controles de ajuste.
  @Input() mostrarUpload = true;
  @Output() fotoChange = new EventEmitter<FotoAjuste | null>();

  readonly circleId = 'adj' + Math.random().toString(36).slice(2, 8);

  private dragOrigin: { x: number; y: number; panX: number; panY: number } | null = null;

  constructor(private readonly sanitizer: DomSanitizer) {}

  get previewSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      standalonePhotoSVG(this.diameter, this.foto, this.strokeColor, 3, this.circleId)
    );
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const resized = await resizeImageFile(file, 900);
    this.foto = novaFotoAjuste(resized.dataUrl, resized.width, resized.height);
    this.fotoChange.emit(this.foto);
  }

  removerFoto(): void {
    this.foto = null;
    this.fotoChange.emit(null);
  }

  onZoom(value: number): void {
    if (!this.foto) return;
    this.foto.zoom = value / 100;
    clampPan(this.foto);
    this.fotoChange.emit(this.foto);
  }

  onRotate(value: number): void {
    if (!this.foto) return;
    this.foto.rotation = value;
    clampPan(this.foto);
    this.fotoChange.emit(this.foto);
  }

  girar(delta: number): void {
    if (!this.foto) return;
    this.foto.rotation = normalizeRotation((this.foto.rotation || 0) + delta);
    clampPan(this.foto);
    this.fotoChange.emit(this.foto);
  }

  onDragStart(event: MouseEvent | TouchEvent): void {
    if (!this.foto) return;
    const point = 'touches' in event ? event.touches[0] : event;
    this.dragOrigin = { x: point.clientX, y: point.clientY, panX: this.foto.panX, panY: this.foto.panY };
    if (event instanceof MouseEvent) event.preventDefault();
  }

  onDragMove(event: MouseEvent | TouchEvent): void {
    if (!this.dragOrigin || !this.foto) return;
    const point = 'touches' in event ? event.touches[0] : event;
    if (!point) return;
    this.foto.panX = this.dragOrigin.panX + (point.clientX - this.dragOrigin.x) / this.diameter;
    this.foto.panY = this.dragOrigin.panY + (point.clientY - this.dragOrigin.y) / this.diameter;
    clampPan(this.foto);
    this.fotoChange.emit(this.foto);
  }

  onDragEnd(): void {
    this.dragOrigin = null;
  }
}
