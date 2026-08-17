import { Component, input, output } from '@angular/core';
import { Reserva, Sala, SalaComOcupacao } from '../../models/salas.model';
import {
  formatDateTimeBr,
  nomeSalaPorEmail,
  reservaOrganizer,
  reservaTitulo,
} from './salas.utils';

@Component({
  selector: 'app-salas-dashboard',
  standalone: true,
  templateUrl: './salas-dashboard.component.html',
  styleUrl: './salas.component.scss',
})
export class SalasDashboardComponent {
  readonly localidadeLabel = input('');
  readonly salas = input<SalaComOcupacao[]>([]);
  readonly reservas = input<Reserva[]>([]);
  readonly rooms = input<Sala[]>([]);
  readonly dataIso = input('');
  readonly carregando = input(false);
  readonly modoReservas = input(false);
  readonly usuarioEmail = input('');

  readonly salaClick = output<Sala>();
  readonly dataChange = output<string>();
  readonly cancelarReserva = output<Reserva>();

  readonly formatDateTimeBr = formatDateTimeBr;
  readonly reservaTitulo = reservaTitulo;
  readonly reservaOrganizer = reservaOrganizer;

  nomeSala(email?: string): string {
    if (!email) return '—';
    return nomeSalaPorEmail(this.rooms(), email);
  }

  onDataInput(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    if (el.value) this.dataChange.emit(el.value);
  }

  podeCancelar(r: Reserva): boolean {
    const email = this.usuarioEmail().toLowerCase();
    if (!email) return false;
    return reservaOrganizer(r).toLowerCase() === email;
  }
}
