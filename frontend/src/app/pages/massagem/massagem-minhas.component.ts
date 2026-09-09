import { Component, OnInit, ViewEncapsulation, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MassagemService } from '../../services/massagem.service';
import { AlertasService } from '../../services/alertas.service';
import { MassagemReservaItem } from '../../models/massagem.model';
import { MsgIconComponent } from './shared/msg-icon.component';
import { MassagemSubnavComponent } from './shared/massagem-subnav.component';

const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DURACAO_MIN = 50;

@Component({
  selector: 'app-massagem-minhas',
  standalone: true,
  imports: [RouterLink, MsgIconComponent, MassagemSubnavComponent],
  templateUrl: './massagem-minhas.component.html',
  styleUrl: './massagem-minhas.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MassagemMinhasComponent implements OnInit {
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);

  readonly proximas = signal<MassagemReservaItem[]>([]);
  readonly historico = signal<MassagemReservaItem[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api.minhasReservas().subscribe({
      next: (res) => {
        this.proximas.set(res.proximas);
        this.historico.set(res.historico);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar reservas');
      },
    });
  }

  private parse(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  mesAbrev(iso: string): string {
    return MESES_ABR[this.parse(iso).getMonth()];
  }

  ano(iso: string): number {
    return this.parse(iso).getFullYear();
  }

  dia(iso: string): string {
    return String(this.parse(iso).getDate()).padStart(2, '0');
  }

  diaSemana(iso: string): string {
    return DIAS_FULL[this.parse(iso).getDay()];
  }

  horaFim(hora: string): string {
    const [hr, mn] = hora.split(':').map(Number);
    const total = hr * 60 + mn + DURACAO_MIN;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  statusClass(status: string): string {
    if (status === 'presente') return 'ms-pres';
    if (status === 'falta') return 'ms-falta';
    if (status === 'ok') return 'ms-conf';
    return 'ms-pend';
  }

  statusIcon(status: string): string {
    if (status === 'presente') return 'check';
    if (status === 'falta') return 'x';
    if (status === 'ok') return 'check-circle';
    return 'clock';
  }

  statusText(status: string): string {
    if (status === 'presente') return 'Realizado';
    if (status === 'falta') return 'Falta';
    if (status === 'ok') return 'Confirmado';
    return 'Aguardando';
  }

  async cancelar(r: MassagemReservaItem): Promise<void> {
    const ok = await this.alertas.confirmar({
      titulo: 'Cancelar reserva?',
      texto: 'Cancelar esta reserva? A fila de espera será notificada.',
      confirmar: 'Cancelar reserva',
      icon: 'warning',
    });
    if (!ok) return;
    this.api.cancelarReserva(r.chave).subscribe({
      next: () => {
        this.alertas.sucesso('Reserva cancelada');
        this.reload();
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao cancelar'),
    });
  }
}
