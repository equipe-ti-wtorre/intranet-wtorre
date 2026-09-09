import {
  Component,
  DestroyRef,
  OnInit,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, interval, of, startWith, switchMap } from 'rxjs';
import { TabletAuthService } from '../../services/tablet-auth.service';
import { AlertasService } from '../../services/alertas.service';
import { MassagemTabletDay } from '../../models/massagem.model';
import { MsgIconComponent } from '../massagem/shared/msg-icon.component';

export type FiltroLista = 'aguardando' | 'presente' | 'falta';

const FALTA_CARENCIA_MIN = 5;
const GRACE_ENCERRAMENTO_MIN = 10;

@Component({
  selector: 'app-tablet-checkin',
  standalone: true,
  imports: [MsgIconComponent],
  templateUrl: './tablet-checkin.component.html',
  styleUrl: './tablet-checkin.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class TabletCheckinComponent implements OnInit {
  private readonly api = inject(TabletAuthService);
  private readonly alertas = inject(AlertasService);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventoId = signal('');
  readonly data = signal('');
  readonly day = signal<MassagemTabletDay | null>(null);
  readonly bootError = signal(false);
  readonly filtro = signal<FiltroLista>('aguardando');
  readonly duracaoMin = signal(50);
  readonly agora = signal(Date.now());

  readonly tituloEvento = computed(() => this.day()?.evento?.nm || 'Lista do dia');

  readonly dataLonga = computed(() => this.formatDataLonga(this.data() || this.day()?.data || ''));

  readonly dataCurta = computed(() => this.formatDataCurta(this.data() || this.day()?.data || ''));

  readonly progressoPct = computed(() => {
    const s = this.day()?.stats;
    if (!s) return 0;
    const done = s.presentes + s.faltas;
    const total = done + s.confirmados;
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
  });

  readonly itensFiltrados = computed(() => {
    const items = this.day()?.items ?? [];
    const f = this.filtro();
    const statusMap: Record<FiltroLista, string> = {
      aguardando: 'ok',
      presente: 'presente',
      falta: 'falta',
    };
    const status = statusMap[f];
    return items.filter((i) => i.nome && i.status === status);
  });

  readonly contagemFiltro = computed(() => this.itensFiltrados().length);

  readonly tituloSecao = computed(() => {
    switch (this.filtro()) {
      case 'presente':
        return 'Presença confirmada';
      case 'falta':
        return 'Faltas registradas';
      default:
        return 'Aguardando confirmação';
    }
  });

  readonly emptyMsg = computed(() => {
    switch (this.filtro()) {
      case 'presente':
        return 'Nenhum presente registrado';
      case 'falta':
        return 'Nenhuma falta registrada';
      default:
        return 'Todos os colaboradores foram confirmados';
    }
  });

  ngOnInit(): void {
    this.api.listEventos().subscribe({
      next: (list) => {
        const ev = list[0];
        if (!ev) {
          this.bootError.set(true);
          this.alertas.erro('Nenhum evento ativo para esta empresa.');
          return;
        }
        this.eventoId.set(ev.id);
        this.data.set(ev.data);
        this.duracaoMin.set(ev.duracaoMin || 50);
        this.startClock();
        this.startPolling();
      },
      error: () => {
        this.bootError.set(true);
        this.alertas.erro('Não foi possível carregar o evento');
      },
    });
  }

  startClock(): void {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.agora.set(Date.now()));
  }

  startPolling(): void {
    interval(5000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.api.listaDia(this.eventoId(), this.data()).pipe(catchError(() => of(null)))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        if (res) this.day.set(res);
      });
  }

  setFiltro(f: FiltroLista): void {
    this.filtro.set(f);
  }

  horaFim(hora: string): string {
    const duracao = this.duracaoMin();
    const [hr, mn] = hora.split(':').map(Number);
    if (Number.isNaN(hr) || Number.isNaN(mn)) return '';
    const t = hr * 60 + mn + duracao;
    const h = Math.floor(t / 60) % 24;
    const m = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  noHorario(hora: string): boolean {
    const janela = this.janelaSlot(hora);
    if (!janela) return false;
    const now = this.agora();
    return now >= janela.start && now < janela.end;
  }

  podeFalta(hora: string): boolean {
    const janela = this.janelaSlot(hora);
    if (!janela) return false;
    const now = this.agora();
    const inicioFalta = janela.start + FALTA_CARENCIA_MIN * 60 * 1000;
    return now >= inicioFalta && now < janela.end;
  }

  onDateChange(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    if (!v) return;
    this.data.set(v);
    this.api
      .listaDia(this.eventoId(), v)
      .pipe(
        catchError(() => {
          this.alertas.erro('Erro ao carregar a data selecionada');
          return of(null);
        })
      )
      .subscribe((res) => {
        if (res) this.day.set(res);
      });
  }

  marcar(chave: string, status: 'presente' | 'falta', hora: string): void {
    if (status === 'falta' ? !this.podeFalta(hora) : !this.noHorario(hora)) return;
    this.api.presenca(chave, status).subscribe({
      next: () => {
        if (status === 'falta') {
          this.alertas.sucesso('Falta registrada');
        } else {
          this.alertas.sucesso('Presença registrada');
        }
        this.api.listaDia(this.eventoId(), this.data()).subscribe((d) => this.day.set(d));
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao registrar'),
    });
  }

  private janelaSlot(hora: string): { start: number; end: number } | null {
    const data = this.data() || this.day()?.data || '';
    const [y, m, d] = data.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;
    const start = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
    const end = start + (this.duracaoMin() + GRACE_ENCERRAMENTO_MIN) * 60 * 1000;
    return { start, end };
  }

  private formatDataLonga(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    const date = new Date(y, m - 1, d);
    const raw = date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  private formatDataCurta(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }
}
