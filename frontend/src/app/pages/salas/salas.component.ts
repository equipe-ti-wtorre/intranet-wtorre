import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { SalasService } from '../../services/salas.service';
import { AlertasService } from '../../services/alertas.service';
import { AuthService } from '../../services/auth.service';
import {
  BookingsResponse,
  Reserva,
  Sala,
  SalaComOcupacao,
  SalasTab,
  SalasUiConfig,
  SalasView,
  ScheduleItem,
  ScheduleResponse,
  TimeSlot,
} from '../../models/salas.model';
import { SalasDashboardComponent } from './salas-dashboard.component';
import { SalasAgendaComponent } from './salas-agenda.component';
import { SalasBookingModalComponent } from './salas-booking-modal.component';
import {
  agruparEmailsPorLocalidade,
  applyRoomDisplayNames,
  buildDayTimeSlots,
  buildSlotPeriods,
  calcOccupancyPercent,
  dayBoundsUtc,
  filtrarReservasDoDia,
  isoDateOnly,
  localidadesDasSalas,
  resolveApiLocalidade,
  resolveRoomTab,
  salasPorAba,
  sortRoomsByTabOrder,
  todasLocalidadesGraph,
  reservaEventId,
  reservaOrganizer,
} from './salas.utils';

const RESERVAS_TAB_ID = '__reservas__';

interface CarregarAbaOptions {
  forceRefresh?: boolean;
  background?: boolean;
}

@Component({
  selector: 'app-salas',
  standalone: true,
  imports: [
    PublicChromeComponent,
    FooterComponent,
    SalasDashboardComponent,
    SalasAgendaComponent,
    SalasBookingModalComponent,
  ],
  templateUrl: './salas.component.html',
  styleUrl: './salas.component.scss',
})
export class SalasComponent implements OnInit, OnDestroy {
  private readonly salasService = inject(SalasService);
  private readonly alertas = inject(AlertasService);
  private readonly auth = inject(AuthService);

  private salasCarregadas = false;
  private readonly abasAgendaCarregadas = new Set<string>();
  private readonly reservasLocalidadesCarregadas = new Set<string>();
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly view = signal<SalasView>('dashboard');
  readonly tabs = signal<SalasTab[]>([]);
  readonly abaAtivaTabId = signal('');
  readonly uiConfig = signal<SalasUiConfig | null>(null);
  readonly todasSalas = signal<Sala[]>([]);
  readonly dataIso = signal(isoDateOnly(new Date()));
  readonly scheduleMap = signal<Record<string, ScheduleItem[]>>({});
  readonly reservas = signal<Reserva[]>([]);
  readonly salaSelecionada = signal<Sala | null>(null);
  readonly carregandoInicial = signal(true);
  readonly atualizando = signal(false);
  readonly erro = signal('');
  readonly naoConfigurado = signal(false);
  readonly modalAberto = signal(false);
  readonly slotSelecionado = signal<TimeSlot | null>(null);

  readonly usuarioEmail = computed(() => this.auth.usuario()?.email ?? '');

  readonly modoReservas = computed(() => this.abaAtivaTabId() === RESERVAS_TAB_ID);

  readonly abaAtiva = computed(() => {
    const tabId = this.abaAtivaTabId();
    const idx = this.tabs().findIndex((t) => (t.id || t.value) === tabId);
    return idx >= 0 ? idx : 0;
  });

  readonly localidadeLabel = computed(() => {
    const tab = this.tabs().find((t) => (t.id || t.value) === this.abaAtivaTabId());
    return tab?.label || '';
  });

  readonly salasDaAba = computed(() => {
    const cfg = this.uiConfig();
    const tabId = this.abaAtivaTabId();
    if (!cfg || !tabId || this.modoReservas()) return [];
    const filtered = salasPorAba(tabId, cfg, this.todasSalas());
    return applyRoomDisplayNames(sortRoomsByTabOrder(filtered, tabId, cfg), cfg);
  });

  readonly roomsParaExibicao = computed(() => {
    const cfg = this.uiConfig();
    const rooms = this.todasSalas();
    if (!cfg) return rooms;
    return applyRoomDisplayNames(rooms, cfg);
  });

  readonly salasComOcupacao = computed<SalaComOcupacao[]>(() => {
    const map = this.scheduleMap();
    const day = this.dataIso();
    const reservas = this.reservasDoDia();
    return this.salasDaAba().map((sala) => ({
      ...sala,
      occupancyPercent: calcOccupancyPercent(
        map[sala.email.toLowerCase()] || [],
        day,
        reservas.filter((r) => r.roomEmail?.toLowerCase() === sala.email.toLowerCase())
      ),
    }));
  });

  readonly reservasDoDia = computed(() => {
    const day = this.dataIso();
    if (this.modoReservas()) {
      return filtrarReservasDoDia(this.reservas(), day);
    }
    const emails = this.salasDaAba().map((s) => s.email);
    return filtrarReservasDoDia(this.reservas(), day, emails);
  });

  readonly agendaItems = computed(() => {
    const sala = this.salaSelecionada();
    if (!sala) return [];
    return this.scheduleMap()[sala.email.toLowerCase()] || [];
  });

  readonly agendaBookings = computed(() => {
    const sala = this.salaSelecionada();
    if (!sala) return [];
    return this.reservasDoDia().filter(
      (r) => r.roomEmail?.toLowerCase() === sala.email.toLowerCase()
    );
  });

  readonly agendaRoomSlots = computed(() =>
    buildDayTimeSlots(this.dataIso(), this.agendaItems(), this.agendaBookings())
  );

  readonly agendaPeriods = computed(() =>
    buildSlotPeriods(this.dataIso(), this.agendaItems(), this.agendaBookings())
  );

  readonly agendaOcupacao = computed(() =>
    calcOccupancyPercent(this.agendaItems(), this.dataIso(), this.agendaBookings())
  );

  readonly apiLocalidadeSalaSelecionada = computed(() => {
    const sala = this.salaSelecionada();
    if (!sala) return '';
    return this.apiLocalidadeDaSala(sala);
  });

  ngOnInit(): void {
    document.body.classList.add('pagina-salas');
    this.carregarUiConfig();
  }

  ngOnDestroy(): void {
    document.body.classList.remove('pagina-salas');
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
  }

  private carregarUiConfig(): void {
    this.carregandoInicial.set(true);
    this.erro.set('');
    this.naoConfigurado.set(false);

    this.salasService.getUiConfig().subscribe({
      next: (cfg) => {
        const locTabs = (cfg.tabs || []).filter((t) => t.label.toLowerCase() !== 'reservas');
        if (!locTabs.length) {
          this.naoConfigurado.set(true);
          this.erro.set(
            'A integração de reserva de salas ainda não foi configurada. Solicite ao administrador da intranet.'
          );
          this.tabs.set([]);
          this.carregandoInicial.set(false);
          return;
        }

        const tabs: SalasTab[] = [
          ...locTabs,
          { id: RESERVAS_TAB_ID, label: 'Reservas', localidade: '' },
        ];

        this.uiConfig.set(cfg);
        this.tabs.set(tabs);

        const padraoId = cfg.localidadePadrao || locTabs[0]?.id || locTabs[0]?.value || '';
        const padraoExiste = locTabs.some((t) => (t.id || t.value) === padraoId);
        this.abaAtivaTabId.set(padraoExiste ? padraoId : locTabs[0]?.id || locTabs[0]?.value || '');
        this.view.set('dashboard');
        this.recarregarCompleto({ forceRefresh: false });
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoInicial.set(false);
        if (err.status === 503) {
          this.naoConfigurado.set(true);
          this.erro.set(
            err.error?.mensagem ||
              'A integração de reserva de salas não está disponível. Solicite ao administrador da intranet.'
          );
          this.tabs.set([]);
          return;
        }
        this.erro.set(err.error?.mensagem || 'Falha ao carregar configuração das salas.');
        this.tabs.set([]);
      },
    });
  }

  selecionarAba(idx: number): void {
    const tab = this.tabs()[idx];
    if (!tab) return;
    const tabId = tab.id || tab.value || '';
    this.abaAtivaTabId.set(tabId);
    if (tabId === RESERVAS_TAB_ID) {
      this.view.set('reservas');
    } else {
      this.view.set('dashboard');
    }
    this.salaSelecionada.set(null);
    this.ensureAbaCarregada(tabId);
    this.prefetchAbaAdjacente();
  }

  onDataChange(iso: string): void {
    this.dataIso.set(iso);
    this.abasAgendaCarregadas.clear();
    this.reservasLocalidadesCarregadas.clear();
    this.reservas.set([]);
    this.scheduleMap.set({});
    this.salasService.invalidateScheduleAndBookingsCache(iso);
    this.carregarAgendaEReservasDaAba(this.abaAtivaTabId(), { forceRefresh: true });
  }

  atualizar(): void {
    this.recarregarCompleto({ forceRefresh: true });
  }

  abrirSala(sala: Sala): void {
    this.salaSelecionada.set(sala);
    this.view.set('agenda');
  }

  voltarDashboard(): void {
    this.salaSelecionada.set(null);
    this.view.set(this.modoReservas() ? 'reservas' : 'dashboard');
  }

  abrirModal(slot: TimeSlot): void {
    this.slotSelecionado.set(slot);
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.slotSelecionado.set(null);
  }

  onReservado(): void {
    this.fecharModal();
    this.invalidarAgendaDoDia();
    this.carregarAgendaEReservasDaAba(this.abaAtivaTabId(), { forceRefresh: true });
  }

  onRoomConflict(): void {
    this.invalidarAgendaDoDia();
    this.carregarAgendaEReservasDaAba(this.abaAtivaTabId(), { forceRefresh: true });
  }

  async cancelarReserva(r: Reserva): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: 'Deseja cancelar esta reserva?',
    });
    if (!ok) return;

    const eventId = reservaEventId(r);
    if (!eventId) {
      this.alertas.erro('Não foi possível identificar a reserva.');
      return;
    }

    const loc = r.roomEmail ? this.apiLocalidadeDaSala(r.roomEmail) : '';
    if (!loc) {
      this.alertas.erro('Não foi possível identificar o tenant da reserva.');
      return;
    }

    const bounds = dayBoundsUtc(this.dataIso());
    this.salasService
      .cancelBooking(loc, eventId, {
        start: bounds.start,
        end: bounds.end,
        roomEmail: r.roomEmail,
        title: r.title || r.subject,
        organizer: reservaOrganizer(r),
      })
      .subscribe({
        next: () => {
          this.alertas.sucesso('Reserva cancelada.');
          this.invalidarAgendaDoDia();
          this.carregarAgendaEReservasDaAba(this.abaAtivaTabId(), { forceRefresh: true });
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Falha ao cancelar reserva.');
        },
      });
  }

  private apiLocalidadeDaSala(salaOrEmail: Sala | string): string {
    const email = typeof salaOrEmail === 'string' ? salaOrEmail : salaOrEmail.email;
    const room = this.todasSalas().find((r) => r.email.toLowerCase() === email.toLowerCase());
    if (room?.apiLocalidade) return room.apiLocalidade;
    const cfg = this.uiConfig();
    return cfg ? resolveApiLocalidade(email, cfg) || '' : '';
  }

  private abaCacheKey(tabId: string): string {
    return `${tabId}:${this.dataIso()}`;
  }

  private ensureAbaCarregada(tabId: string): void {
    if (this.abasAgendaCarregadas.has(this.abaCacheKey(tabId))) return;
    this.carregarAgendaEReservasDaAba(tabId, {
      background: this.salasCarregadas && this.todasSalas().length > 0,
    });
  }

  private invalidarAgendaDoDia(): void {
    const day = this.dataIso();
    this.salasService.invalidateScheduleAndBookingsCache(day);
    for (const key of [...this.abasAgendaCarregadas]) {
      if (key.endsWith(`:${day}`)) this.abasAgendaCarregadas.delete(key);
    }
    for (const key of [...this.reservasLocalidadesCarregadas]) {
      if (key.endsWith(`:${day}`)) this.reservasLocalidadesCarregadas.delete(key);
    }
  }

  private recarregarCompleto(options: { forceRefresh: boolean }): void {
    const cfg = this.uiConfig();
    if (!cfg) {
      this.carregandoInicial.set(false);
      return;
    }

    this.erro.set('');

    if (options.forceRefresh) {
      this.salasService.invalidateCache();
      this.abasAgendaCarregadas.clear();
      this.reservasLocalidadesCarregadas.clear();
      this.reservas.set([]);
      this.scheduleMap.set({});
      this.salasCarregadas = false;
    }

    if (this.salasCarregadas && !options.forceRefresh) {
      this.carregarAgendaEReservasDaAba(this.abaAtivaTabId(), options);
      return;
    }

    if (this.todasSalas().length === 0) {
      this.carregandoInicial.set(true);
    } else {
      this.atualizando.set(true);
    }

    this.carregarSalas(options.forceRefresh).subscribe({
      next: (salas) => {
        this.todasSalas.set(salas);
        this.salasCarregadas = true;
        this.carregarAgendaEReservasDaAba(this.abaAtivaTabId(), options);
      },
      error: (err: HttpErrorResponse) => {
        this.finalizarCarregamento();
        this.erro.set(err.error?.mensagem || 'Falha ao carregar salas.');
      },
    });
  }

  private carregarSalas(forceRefresh: boolean): Observable<Sala[]> {
    const cfg = this.uiConfig();
    const localidades = cfg ? todasLocalidadesGraph(cfg) : [];
    if (!localidades.length) return of([]);

    const roomRequests = localidades.map((loc) =>
      this.salasService.getRooms(loc, { forceRefresh }).pipe(
        map((res) =>
          (res.rooms || []).map((room) => ({
            ...room,
            apiLocalidade: loc,
          }))
        ),
        catchError(() => of([] as Sala[]))
      )
    );

    return forkJoin(roomRequests).pipe(
      map((roomGroups) => {
        const byEmail = new Map<string, Sala>();
        for (const room of roomGroups.flat()) {
          byEmail.set(room.email.toLowerCase(), room);
        }
        return [...byEmail.values()];
      })
    );
  }

  private carregarAgendaEReservasDaAba(tabId: string, options: CarregarAbaOptions = {}): void {
    const cfg = this.uiConfig();
    if (!cfg || !tabId) {
      this.finalizarCarregamento();
      return;
    }

    const cacheKey = this.abaCacheKey(tabId);
    if (!options.forceRefresh && this.abasAgendaCarregadas.has(cacheKey)) {
      return;
    }

    const day = this.dataIso();
    const bounds = dayBoundsUtc(day);
    const background = options.background ?? false;

    if (!background && !this.todasSalas().length && tabId !== RESERVAS_TAB_ID) {
      this.carregandoInicial.set(true);
    } else if (!background) {
      this.atualizando.set(true);
    }

    let localidades: string[];
    let scheduleGroups: [string, string[]][];

    if (tabId === RESERVAS_TAB_ID) {
      localidades = todasLocalidadesGraph(cfg);
      scheduleGroups = [];
    } else {
      const roomsForTab = salasPorAba(tabId, cfg, this.todasSalas());
      localidades = localidadesDasSalas(roomsForTab);
      if (!localidades.length) {
        localidades = todasLocalidadesGraph(cfg);
      }
      scheduleGroups = [...agruparEmailsPorLocalidade(roomsForTab).entries()];
    }

    const scheduleRequests = scheduleGroups.map(([loc, emails]) =>
      this.salasService
        .getSchedule(
          loc,
          { rooms: emails, start: bounds.start, end: bounds.end },
          { forceRefresh: options.forceRefresh }
        )
        .pipe(catchError(() => of({ schedule: [] } as ScheduleResponse)))
    );

    const bookingLocsToFetch = localidades.filter(
      (loc) => options.forceRefresh || !this.reservasLocalidadesCarregadas.has(`${loc}:${day}`)
    );

    const bookingRequests = bookingLocsToFetch.map((loc) =>
      this.salasService
        .getBookings(loc, bounds.start, bounds.end, { forceRefresh: options.forceRefresh })
        .pipe(catchError(() => of({ bookings: [] } as BookingsResponse)))
    );

    const requests: Observable<ScheduleResponse | BookingsResponse>[] = [
      ...scheduleRequests,
      ...bookingRequests,
    ];

    if (!requests.length) {
      this.abasAgendaCarregadas.add(cacheKey);
      this.finalizarCarregamento();
      if (!background) this.prefetchAbaAdjacente();
      return;
    }

    forkJoin(requests).subscribe({
      next: (results) => {
        const schedResults = results.slice(0, scheduleRequests.length) as ScheduleResponse[];
        const bookResults = results.slice(scheduleRequests.length) as BookingsResponse[];

        if (schedResults.length) {
          this.scheduleMap.update((map) => {
            const next = { ...map };
            for (const sched of schedResults) {
              for (const item of sched.schedule || []) {
                next[item.roomEmail.toLowerCase()] = item.scheduleItems || [];
              }
            }
            return next;
          });
        }

        if (bookResults.length) {
          this.reservas.update((existing) => {
            const merged = [...existing];
            const seen = new Set(
              merged.map((r) => `${r.eventId || r.id || ''}:${r.roomEmail || ''}:${r.start}`)
            );
            for (const res of bookResults) {
              for (const booking of res.bookings || []) {
                const key = `${booking.eventId || booking.id || ''}:${booking.roomEmail || ''}:${booking.start}`;
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(booking);
              }
            }
            return merged;
          });
          for (const loc of bookingLocsToFetch) {
            this.reservasLocalidadesCarregadas.add(`${loc}:${day}`);
          }
        }

        this.abasAgendaCarregadas.add(cacheKey);
        this.finalizarCarregamento();
        if (!background) this.prefetchAbaAdjacente();
      },
      error: (err: HttpErrorResponse) => {
        this.finalizarCarregamento();
        this.erro.set(err.error?.mensagem || 'Falha ao carregar agenda.');
      },
    });
  }

  private prefetchAbaAdjacente(): void {
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
    this.prefetchTimer = setTimeout(() => {
      const idx = this.abaAtiva();
      const tabs = this.tabs();
      for (const offset of [1, -1]) {
        const adj = tabs[idx + offset];
        if (!adj) continue;
        const tabId = adj.id || adj.value || '';
        if (!tabId || this.abasAgendaCarregadas.has(this.abaCacheKey(tabId))) continue;
        this.carregarAgendaEReservasDaAba(tabId, { background: true });
        break;
      }
    }, 500);
  }

  private finalizarCarregamento(): void {
    this.carregandoInicial.set(false);
    this.atualizando.set(false);
  }
}
