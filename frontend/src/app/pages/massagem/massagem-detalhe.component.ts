import { Component, OnInit, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { MassagemService } from '../../services/massagem.service';
import { AlertasService } from '../../services/alertas.service';
import { AuthService } from '../../services/auth.service';
import { MassagemEvento, MassagemSlot, MassagemSlotsResponse } from '../../models/massagem.model';
import { MsgIconComponent } from './shared/msg-icon.component';
import { MassagemSubnavComponent } from './shared/massagem-subnav.component';
import { formatData, formatDataCurta } from './shared/massagem-ui.utils';

type Modal = 'reserva' | 'opcoes' | 'troca' | 'fila' | null;

const DET_RING = 2 * Math.PI * 21;

@Component({
  selector: 'app-massagem-detalhe',
  standalone: true,
  imports: [RouterLink, MsgIconComponent, MassagemSubnavComponent],
  templateUrl: './massagem-detalhe.component.html',
  styleUrl: './massagem-detalhe.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MassagemDetalheComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);
  private readonly auth = inject(AuthService);

  readonly evento = signal<MassagemEvento | null>(null);
  readonly data = signal('');
  readonly slotsData = signal<MassagemSlotsResponse | null>(null);
  readonly modal = signal<Modal>(null);
  readonly selected = signal<MassagemSlot | null>(null);
  readonly loading = signal(false);
  readonly pageLoading = signal(true);
  readonly notFound = signal(false);

  readonly detRing = DET_RING;

  readonly userNome = computed(
    () => this.auth.usuario()?.nome_completo ?? this.auth.usuario()?.nome ?? ''
  );
  readonly userEmail = computed(() => this.auth.usuario()?.email ?? '');

  readonly manha = computed(() => (this.slotsData()?.slots || []).filter((s) => s.hora < '13:00'));
  readonly tarde = computed(() => (this.slotsData()?.slots || []).filter((s) => s.hora >= '13:00'));
  readonly disponiveisTroca = computed(() =>
    (this.slotsData()?.slots || []).filter((s) => s.estado === 'disponivel')
  );
  readonly temPausa = computed(() =>
    (this.slotsData()?.slots || []).some((s) => s.estado === 'pausa')
  );
  readonly periodoLotado = computed(() => {
    const sessoes = (this.slotsData()?.slots || []).filter((s) => s.estado !== 'pausa');
    const abertos = sessoes.filter((s) => s.estado !== 'encerrado');
    return abertos.length > 0 && abertos.every((s) => s.estado === 'ocupado');
  });
  readonly pct = computed(() => {
    const sessoes = (this.slotsData()?.slots || []).filter((s) => s.estado !== 'pausa');
    if (!sessoes.length) return 0;
    const occ = sessoes.filter((s) => s.estado === 'ocupado' || s.estado === 'minha').length;
    return Math.round((occ / sessoes.length) * 100);
  });
  readonly disponiveis = computed(
    () => (this.slotsData()?.slots || []).filter((s) => s.estado === 'disponivel').length
  );
  readonly ringOffset = computed(() => DET_RING - (this.pct() / 100) * DET_RING);

  private readonly filaElegivel = computed(() => {
    if (this.slotsData()?.minhaChave || this.slotsData()?.jaTemReserva) return false;
    const ds = this.data();
    if (!ds) return false;
    const [y, m, d] = ds.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    day.setHours(0, 0, 0, 0);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return day.getTime() >= hoje.getTime();
  });

  readonly reservaEmOutroEvento = computed(() => {
    const data = this.slotsData();
    return !!(data?.jaTemReserva && data.minhaReserva && !data.minhaChave);
  });

  readonly sessaoDoDiaJaUsada = computed(() => {
    const r = this.slotsData()?.minhaReserva;
    if (!r || !this.reservaEmOutroEvento()) return false;
    if (r.status === 'presente') return true;
    const [y, m, d] = r.data.split('-').map(Number);
    const [hh, mm] = (r.hora || '00:00').split(':').map(Number);
    if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return false;
    return new Date(y, m - 1, d, hh, mm).getTime() < Date.now();
  });

  readonly msgReservaOutro = computed(() => {
    const r = this.slotsData()?.minhaReserva;
    if (!r) return 'Você já possui uma reserva. Só é permitido um horário por dia.';
    const onde = r.unidade || r.eventoNm || 'outro evento';
    if (this.sessaoDoDiaJaUsada()) {
      return `Você já utilizou sua sessão neste dia em ${onde}. Só é permitido um horário por dia.`;
    }
    return `Você já tem reserva em ${onde} em ${formatDataCurta(r.data)} às ${r.hora}. Só é permitido um horário por dia.`;
  });

  readonly showFilaEnter = computed(
    () => this.filaElegivel() && this.periodoLotado() && !this.slotsData()?.naFila
  );
  readonly showFilaActive = computed(() => this.filaElegivel() && !!this.slotsData()?.naFila);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.listEventos().subscribe({
      next: (list) => {
        const ev = list.find((e) => String(e.id) === String(id)) || null;
        this.evento.set(ev);
        this.pageLoading.set(false);
        if (ev) {
          this.data.set(ev.data);
          this.loadSlots();
        } else {
          this.notFound.set(true);
        }
      },
      error: () => {
        this.pageLoading.set(false);
        this.notFound.set(true);
      },
    });
  }

  loadSlots(): void {
    const ev = this.evento();
    if (!ev) return;
    this.api.listSlots(ev.id, this.data()).subscribe({
      next: (res) => this.slotsData.set(res),
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar horários'),
    });
  }

  formatData = formatData;
  formatDataCurta = formatDataCurta;

  slotClass(slot: MassagemSlot): string {
    const map: Record<string, string> = {
      disponivel: 'av',
      minha: 'mn',
      ocupado: 'tk',
      encerrado: 'ps',
      pausa: 'pa',
    };
    const base = map[slot.estado] || 'ps';
    if (slot.estado === 'minha' && slot.status === 'presente') return `${base} mn-pres`;
    if (slot.estado === 'minha' && slot.status === 'falta') return `${base} mn-falta`;
    return base;
  }

  slotLabel(slot: MassagemSlot): string {
    if (slot.estado === 'pausa') return slot.nome || 'Pausa';
    if (slot.estado === 'disponivel') return 'Disponível · Reservar';
    if (slot.estado === 'minha') {
      if (slot.status === 'presente') return 'Presença';
      if (slot.status === 'falta') return 'Falta';
      return 'Minha reserva';
    }
    if (slot.estado === 'ocupado') return 'Indisponível';
    return 'Encerrado';
  }

  slotStatusIcon(slot: MassagemSlot): 'check' | 'x' | null {
    if (slot.estado !== 'minha') return null;
    if (slot.status === 'presente') return 'check';
    if (slot.status === 'falta') return 'x';
    return null;
  }

  slotHora(slot: MassagemSlot): string {
    if (slot.estado === 'pausa' && slot.horaFim) return `${slot.hora}–${slot.horaFim}`;
    return slot.hora;
  }

  isClickable(slot: MassagemSlot): boolean {
    if (this.isPresencaMarcada(slot)) return false;
    return slot.estado === 'disponivel' || slot.estado === 'minha';
  }

  isSlotDisabled(slot: MassagemSlot): boolean {
    return (
      slot.estado === 'ocupado' ||
      slot.estado === 'encerrado' ||
      slot.estado === 'pausa' ||
      this.isPresencaMarcada(slot)
    );
  }

  clickSlot(slot: MassagemSlot): void {
    if (slot.estado === 'disponivel') {
      if (this.reservaEmOutroEvento()) {
        this.alertas.erro(this.msgReservaOutro());
        return;
      }
      this.selected.set(slot);
      this.modal.set('reserva');
    } else if (slot.estado === 'minha') {
      if (this.isPresencaMarcada(slot)) return;
      this.selected.set(slot);
      this.modal.set('opcoes');
    }
  }

  private isPresencaMarcada(slot: MassagemSlot): boolean {
    return slot.estado === 'minha' && (slot.status === 'presente' || slot.status === 'falta');
  }

  confirmarReserva(): void {
    const ev = this.evento();
    const slot = this.selected();
    if (!ev || !slot) return;
    this.loading.set(true);
    this.api
      .createReserva({ eventoId: ev.id, chave: slot.chave, observacao: '' })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.modal.set(null);
          this.alertas.sucesso('Reserva confirmada');
          this.loadSlots();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível reservar');
        },
      });
  }

  abrirTroca(): void {
    this.modal.set('troca');
  }

  confirmarTroca(nova: MassagemSlot): void {
    const atual = this.selected();
    if (!atual) return;
    this.loading.set(true);
    this.api
      .trocarReserva(atual.chave, nova.chave)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.modal.set(null);
          this.alertas.sucesso('Horário trocado');
          this.loadSlots();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Troca não realizada');
        },
      });
  }

  async cancelarReserva(): Promise<void> {
    const slot = this.selected();
    if (!slot) return;
    const ok = await this.alertas.confirmar({
      titulo: 'Cancelar reserva?',
      texto: 'Cancelar sem reservar outro? A fila de espera será notificada.',
      confirmar: 'Cancelar reserva',
      icon: 'warning',
    });
    if (!ok) return;
    this.loading.set(true);
    this.api
      .cancelarReserva(slot.chave)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.modal.set(null);
          this.alertas.sucesso('Reserva cancelada — fila notificada');
          this.loadSlots();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao cancelar');
        },
      });
  }

  abrirFila(): void {
    this.modal.set('fila');
  }

  entrarFila(): void {
    const ev = this.evento();
    if (!ev) return;
    this.loading.set(true);
    this.api
      .entrarFila(ev.id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.modal.set(null);
          this.alertas.sucesso('Você está na fila! Será alertado assim que qualquer vaga abrir.');
          this.loadSlots();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível entrar na fila');
        },
      });
  }

  async sairDaFila(): Promise<void> {
    const id = this.slotsData()?.minhaFilaId;
    if (!id) return;
    const ok = await this.alertas.confirmar({
      titulo: 'Sair da fila?',
      texto: 'Você deixará de receber alertas quando uma vaga abrir neste evento.',
      confirmar: 'Sair da fila',
      icon: 'warning',
    });
    if (!ok) return;
    this.loading.set(true);
    this.api
      .sairFila(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.alertas.sucesso('Você saiu da fila de espera.');
          this.loadSlots();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível sair da fila');
        },
      });
  }

  closeModal(): void {
    this.loading.set(false);
    this.modal.set(null);
  }
}
