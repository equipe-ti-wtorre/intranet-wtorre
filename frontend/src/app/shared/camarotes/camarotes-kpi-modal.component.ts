import { DatePipe } from '@angular/common';
import { Component, HostListener, Input, inject, output, signal } from '@angular/core';
import { CamaroteUnidade } from '../../models/camarote.model';
import { AlertasService } from '../../services/alertas.service';
import { formatarAndar } from '../../utils/camarote-andar.util';
import { exportCamarotesModalPdf } from '../../utils/camarotes-pdf-export.util';

export type KpiModalModo = 'vago' | 'contrato' | 'pack30' | 'vvip';

@Component({
  selector: 'app-camarotes-kpi-modal',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './camarotes-kpi-modal.component.html',
  styleUrl: './camarotes-kpi-modal.component.scss',
})
export class CamarotesKpiModalComponent {
  @Input({ required: true }) aberto = false;
  @Input({ required: true }) titulo = '';
  @Input() subtitulo = '';
  @Input() carregando = false;
  @Input() erro = '';
  @Input() unidades: CamaroteUnidade[] = [];
  @Input() modo: KpiModalModo = 'contrato';

  readonly fechar = output<void>();
  readonly exportando = signal(false);

  private readonly alertas = inject(AlertasService);

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.aberto) this.fechar.emit();
  }

  moeda(valor: number | null | undefined): string {
    if (valor == null) return '—';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  texto(valor: string | null | undefined): string {
    return valor?.trim() || '—';
  }

  formatDiasRestantes(dias: number | null | undefined): string {
    if (dias == null || !Number.isFinite(Number(dias))) return '—';
    const n = Number(dias);
    if (n > 1) return `${n} dias`;
    if (n === 1) return '1 dia';
    if (n === 0) return 'Vence hoje';
    const abs = Math.abs(n);
    return abs === 1 ? 'Vencido há 1 dia' : `Vencido há ${abs} dias`;
  }

  formatarAndar = formatarAndar;

  onBackdropClick(): void {
    this.fechar.emit();
  }

  onCloseClick(): void {
    this.fechar.emit();
  }

  podeExportar(): boolean {
    return !this.carregando && !this.erro && this.unidades.length > 0 && !this.exportando();
  }

  exportarPdf(): void {
    if (!this.podeExportar()) return;

    this.exportando.set(true);
    try {
      exportCamarotesModalPdf({
        titulo: this.titulo,
        subtitulo: this.subtitulo,
        modo: this.modo,
        unidades: this.unidades,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao exportar PDF.';
      this.alertas.erro(msg);
    } finally {
      this.exportando.set(false);
    }
  }
}
