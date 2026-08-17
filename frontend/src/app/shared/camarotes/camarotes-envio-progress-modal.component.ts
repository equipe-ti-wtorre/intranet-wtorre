import {
  Component,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  EnvioAlertaFilaItem,
  EnvioAlertaProgressItem,
  EnvioAlertaProgressState,
} from '../../models/camarote.model';

@Component({
  selector: 'app-camarotes-envio-progress-modal',
  standalone: true,
  imports: [],
  templateUrl: './camarotes-envio-progress-modal.component.html',
  styleUrl: './camarotes-envio-progress-modal.component.scss',
})
export class CamarotesEnvioProgressModalComponent implements OnInit, OnDestroy {
  @Input({ required: true }) aberto = false;
  @Input({ required: true }) estado!: EnvioAlertaProgressState;
  @Input() titulo = 'Envio de alertas';

  readonly fechar = output<void>();
  readonly copiarErro = output<string>();

  readonly agora = signal(Date.now());
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.countdownTimer = setInterval(() => this.agora.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.aberto && this.podeFechar()) this.fechar.emit();
  }

  get progressoPct(): number {
    if (!this.estado?.total) return 0;
    return Math.round((this.estado.concluidos / this.estado.total) * 100);
  }

  get itemAtual(): EnvioAlertaProgressItem | undefined {
    return this.estado?.itens.find((i) => i.status === 'enviando');
  }

  get itensProcessados(): EnvioAlertaProgressItem[] {
    return (this.estado?.itens ?? []).filter((i) => i.status !== 'pendente' && i.status !== 'enviando');
  }

  get itensFalha(): EnvioAlertaProgressItem[] {
    return (this.estado?.itens ?? []).filter((i) => i.status === 'falha');
  }

  get filaVisivel(): boolean {
    return (
      !!this.estado?.fila?.length &&
      (this.estado.fase === 'enviando' || this.estado.fase === 'concluido')
    );
  }

  get filaResumoLabel(): string {
    const r = this.estado?.filaResumo;
    if (!r) return '';
    const partes: string[] = [];
    if (r.na_fila > 0) partes.push(`${r.na_fila} na fila`);
    if (r.enviando > 0) partes.push(`${r.enviando} enviando`);
    if (r.enviado > 0) partes.push(`${r.enviado} enviados`);
    if (r.falha > 0) partes.push(`${r.falha} falha(s)`);
    if (r.pendente > 0) partes.push(`${r.pendente} pendente(s)`);
    return partes.join(' · ');
  }

  podeFechar(): boolean {
    return this.estado?.fase === 'concluido' || this.estado?.fase === 'erro';
  }

  labelGatilho(dias: number): string {
    if (dias === 0) return 'Hoje / vencidos';
    return `${dias} dias`;
  }

  labelStatus(status: EnvioAlertaProgressItem['status']): string {
    switch (status) {
      case 'sucesso':
        return 'Enviado';
      case 'falha':
        return 'Falha';
      case 'ignorado':
        return 'Ignorado';
      default:
        return status;
    }
  }

  labelFilaStatus(status: EnvioAlertaFilaItem['status']): string {
    switch (status) {
      case 'pendente':
        return 'Pendente';
      case 'na_fila':
        return 'Na fila';
      case 'enviando':
        return 'Enviando';
      case 'enviado':
        return 'Enviado';
      case 'falha':
        return 'Falha';
      default:
        return status;
    }
  }

  badgeClass(status: EnvioAlertaProgressItem['status']): string {
    switch (status) {
      case 'sucesso':
        return 'sbadge-ok';
      case 'falha':
        return 'sbadge-danger';
      case 'ignorado':
        return 'sbadge-pend';
      default:
        return 'sbadge-pend';
    }
  }

  badgeClassFila(status: EnvioAlertaFilaItem['status']): string {
    switch (status) {
      case 'enviado':
        return 'sbadge-ok';
      case 'falha':
        return 'sbadge-danger';
      case 'na_fila':
        return 'sbadge-warn';
      case 'enviando':
        return 'sbadge-info';
      default:
        return 'sbadge-pend';
    }
  }

  filaRowClass(item: EnvioAlertaFilaItem): string {
    return item.status === 'enviando' ? 'fila-row-enviando' : '';
  }

  tempoRestante(item: EnvioAlertaFilaItem): string {
    if (item.status === 'enviado') return '—';
    if (item.status === 'falha') return '—';
    if (item.status === 'enviando') return 'Enviando agora…';
    if (item.status === 'pendente') return 'Aguardando';
    if (item.status === 'na_fila' && item.enviar_em) {
      const diff = new Date(item.enviar_em).getTime() - this.agora();
      if (diff <= 0) return 'Em breve…';
      const sec = Math.ceil(diff / 1000);
      if (sec < 60) return `Envio em ~${sec}s`;
      const min = Math.ceil(sec / 60);
      return `Envio em ~${min} min`;
    }
    return '—';
  }

  onBackdropClick(): void {
    if (this.podeFechar()) this.fechar.emit();
  }

  onCloseClick(): void {
    if (this.podeFechar()) this.fechar.emit();
  }

  onCopiar(texto: string | undefined | null): void {
    if (texto) this.copiarErro.emit(texto);
  }
}
