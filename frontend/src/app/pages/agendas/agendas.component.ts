import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { AdminModalComponent } from '../../shared/admin/admin-modal/admin-modal.component';
import { EventosService } from '../../services/eventos.service';
import { Evento } from '../../models/evento.model';
import {
  EventoMarca,
  eventoMarca,
  fonteExibicao,
  marcaCssClass,
  marcaLabel,
} from '../../utils/evento-marca.util';
import {
  diaMesAbrev,
  extrairHora,
  formatarDiaSelecionado,
  formatarIntervaloCurto,
  formatarMesAno,
  hojeIso,
  intervaloProximos30Dias,
  isoFromParts,
  parseIso,
} from '../../utils/evento-data.util';

interface CalCell {
  day: number;
  iso: string | null;
  out: boolean;
  today: boolean;
  selected: boolean;
  marcas: EventoMarca[];
}

interface GrupoDiaEventos {
  iso: string;
  titulo: string;
  eventos: Evento[];
}

type ModoCalendario = 'mes' | 'proximos30';

const GRADIENTES = ['g1', 'g2', 'g3'];
const SYNC_MS = 60 * 60 * 1000;

@Component({
  selector: 'app-agendas',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, AdminModalComponent],
  templateUrl: './agendas.component.html',
  styleUrl: './agendas.component.scss',
})
export class AgendasComponent implements OnInit, OnDestroy {
  private readonly eventosService = inject(EventosService);

  readonly miniaturas30d = signal<Evento[]>([]);
  readonly eventosMes = signal<Evento[]>([]);
  readonly carregandoMiniaturas = signal(true);
  readonly carregandoMes = signal(true);
  readonly erro = signal('');
  readonly atualizadoEm = signal<string | null>(null);
  readonly slideAtivo = signal(0);
  readonly imagemFalhou = signal<Set<string>>(new Set());
  readonly eventoModal = signal<Evento | null>(null);

  private readonly hoje = hojeIso();
  private readonly hojeParts = parseIso(this.hoje);
  private readonly intervalo30d = intervaloProximos30Dias();

  readonly calAno = signal(this.hojeParts.year);
  readonly calMes = signal(this.hojeParts.month);
  readonly diaSelecionado = signal(this.hoje);
  readonly modoCalendario = signal<ModoCalendario>('mes');

  private carouselTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private pausado = false;

  readonly carregando = computed(() => this.carregandoMiniaturas() && this.carregandoMes());

  readonly destaques = computed(() => this.selecionarDestaques(this.miniaturas30d()));

  readonly eventosPorDia = computed(() => {
    const map = new Map<string, Evento[]>();
    for (const ev of this.eventosMes()) {
      if (!ev.dataIso) continue;
      const list = map.get(ev.dataIso) || [];
      list.push(ev);
      map.set(ev.dataIso, list);
    }
    return map;
  });

  readonly eventosDoDia = computed(() => {
    const iso = this.diaSelecionado();
    return this.eventosPorDia().get(iso) || [];
  });

  readonly tituloDiaSelecionado = computed(() => formatarDiaSelecionado(this.diaSelecionado()));

  readonly tituloMes = computed(() => formatarMesAno(this.calAno(), this.calMes()));

  readonly calCells = computed(() => this.gerarCalendario());

  readonly modalEventoAberto = computed(() => this.eventoModal() != null);

  readonly modoProximos30 = computed(() => this.modoCalendario() === 'proximos30');

  readonly subtituloIntervalo30d = computed(() =>
    formatarIntervaloCurto(this.intervalo30d.de, this.intervalo30d.ate)
  );

  readonly grupos30d = computed(() => {
    const map = new Map<string, Evento[]>();
    for (const ev of this.miniaturas30d()) {
      if (!ev.dataIso) continue;
      const list = map.get(ev.dataIso) || [];
      list.push(ev);
      map.set(ev.dataIso, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, eventos]) => ({
        iso,
        titulo: formatarDiaSelecionado(iso),
        eventos,
      }));
  });

  readonly tempoDesdeSync = computed(() => {
    const raw = this.atualizadoEm();
    if (!raw) return '';
    const diff = Date.now() - new Date(raw).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h`;
  });

  ngOnInit(): void {
    this.carregarTudo();
    this.iniciarCarouselTimer();
    this.syncTimer = setInterval(() => this.sincronizar(), SYNC_MS);
  }

  ngOnDestroy(): void {
    this.pararCarouselTimer();
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  carregarTudo(): void {
    this.erro.set('');
    this.carregarMiniaturas();
    this.carregarMes(this.calAno(), this.calMes());
  }

  carregarMiniaturas(force = false): void {
    this.carregandoMiniaturas.set(true);
    const { de, ate } = this.intervalo30d;
    this.eventosService.listarAgendaIntervalo(de, ate, { force }).subscribe({
      next: (res) => {
        this.miniaturas30d.set(res.eventos);
        this.atualizadoEm.set(res.atualizadoEm);
        this.carregandoMiniaturas.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar eventos.');
        this.carregandoMiniaturas.set(false);
      },
    });
  }

  carregarMes(ano: number, mes: number, force = false): void {
    this.carregandoMes.set(true);
    this.eventosService.listarAgendaMes(ano, mes, { force }).subscribe({
      next: (res) => {
        this.eventosMes.set(res.eventos);
        if (!this.atualizadoEm()) {
          this.atualizadoEm.set(res.atualizadoEm);
        }
        this.carregandoMes.set(false);
        this.ajustarDiaSelecionado(ano, mes, res.eventos);
      },
      error: (err: HttpErrorResponse) => {
        if (!this.erro()) {
          this.erro.set(err.error?.mensagem || 'Erro ao carregar eventos do mês.');
        }
        this.carregandoMes.set(false);
      },
    });
  }

  sincronizar(): void {
    this.eventosService.invalidarCacheAgenda();
    this.carregarMiniaturas(true);
    this.carregarMes(this.calAno(), this.calMes(), true);
  }

  private ajustarDiaSelecionado(ano: number, mes: number, eventos: Evento[]): void {
    const sel = this.diaSelecionado();
    const selParts = parseIso(sel);
    if (selParts.year === ano && selParts.month === mes) return;

    const primeiro = eventos.find((e) => e.dataIso)?.dataIso;
    if (primeiro) {
      this.diaSelecionado.set(primeiro);
      return;
    }
    this.diaSelecionado.set(isoFromParts(ano, mes, 1));
  }

  private selecionarDestaques(lista: Evento[]): Evento[] {
    if (!lista.length) return [];
    const comImagem = lista.filter(
      (e) => e.imagemUrl && !this.imagemFalhou().has(e.titulo + e.dataIso)
    );
    const destaques: Evento[] = [];
    for (const ev of comImagem) {
      if (destaques.length >= 3) break;
      destaques.push(ev);
    }
    for (const ev of lista) {
      if (destaques.length >= 3) break;
      if (!destaques.includes(ev)) destaques.push(ev);
    }
    return destaques.slice(0, 3);
  }

  private gerarCalendario(): CalCell[] {
    const year = this.calAno();
    const month = this.calMes();
    const first = new Date(year, month, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const cells: CalCell[] = [];
    const porDia = this.eventosPorDia();
    const sel = this.diaSelecionado();

    for (let i = 0; i < firstDow; i++) {
      const day = daysInPrev - firstDow + 1 + i;
      cells.push({
        day,
        iso: null,
        out: true,
        today: false,
        selected: false,
        marcas: [],
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoFromParts(year, month, d);
      const evs = porDia.get(iso) || [];
      const marcas = [...new Set(evs.map((e) => eventoMarca(e)))];
      cells.push({
        day: d,
        iso,
        out: false,
        today: iso === this.hoje,
        selected: iso === sel && iso !== this.hoje,
        marcas,
      });
    }

    const rest = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= rest; i++) {
      cells.push({
        day: i,
        iso: null,
        out: true,
        today: false,
        selected: false,
        marcas: [],
      });
    }

    return cells;
  }

  setSlide(i: number): void {
    const total = this.destaques().length;
    if (!total) return;
    this.slideAtivo.set((i + total) % total);
  }

  goSlide(delta: number): void {
    this.setSlide(this.slideAtivo() + delta);
  }

  onCarouselEnter(): void {
    this.pausado = true;
    this.pararCarouselTimer();
  }

  onCarouselLeave(): void {
    this.pausado = false;
    this.iniciarCarouselTimer();
  }

  private iniciarCarouselTimer(): void {
    this.pararCarouselTimer();
    if (this.pausado || this.destaques().length < 2) return;
    this.carouselTimer = setInterval(() => this.goSlide(1), 5000);
  }

  private pararCarouselTimer(): void {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
  }

  mesAnterior(): void {
    let m = this.calMes() - 1;
    let y = this.calAno();
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    this.calMes.set(m);
    this.calAno.set(y);
    this.carregarMes(y, m);
  }

  mesProximo(): void {
    let m = this.calMes() + 1;
    let y = this.calAno();
    if (m > 11) {
      m = 0;
      y += 1;
    }
    this.calMes.set(m);
    this.calAno.set(y);
    this.carregarMes(y, m);
  }

  setModoCalendario(modo: ModoCalendario): void {
    if (this.modoCalendario() === modo) return;
    this.modoCalendario.set(modo);
    if (modo === 'mes') {
      this.carregarMes(this.calAno(), this.calMes());
    }
  }

  selecionarDia(cell: CalCell): void {
    if (!cell.iso || cell.out) return;
    this.diaSelecionado.set(cell.iso);
  }

  abrirEventoModal(ev: Evento): void {
    this.eventoModal.set(ev);
  }

  fecharEventoModal(): void {
    this.eventoModal.set(null);
  }

  abrirEventoExterno(ev: Evento): void {
    if (ev.url) {
      window.open(ev.url, '_blank', 'noopener,noreferrer');
    }
  }

  tituloModal(): string {
    const ev = this.eventoModal();
    return ev?.titulo || 'Evento';
  }

  subtituloModal(): string {
    const ev = this.eventoModal();
    if (!ev) return '';
    return this.fonte(ev);
  }

  marcaNome(ev: Evento): string {
    return marcaLabel(eventoMarca(ev));
  }

  tipoLabel(ev: Evento): string {
    const tipo = ev.tipo?.trim();
    return tipo || 'OUTRO';
  }

  onThumbClick(ev: Evento, event: Event): void {
    if (ev.url) {
      return;
    }
    event.preventDefault();
    if (ev.dataIso) {
      this.diaSelecionado.set(ev.dataIso);
      const p = parseIso(ev.dataIso);
      if (p.year !== this.calAno() || p.month !== this.calMes()) {
        this.calAno.set(p.year);
        this.calMes.set(p.month);
        this.carregarMes(p.year, p.month);
      }
    }
  }

  gradienteClasse(i: number): string {
    return GRADIENTES[i % GRADIENTES.length];
  }

  marcaClass(ev: Evento): string {
    return marcaCssClass(eventoMarca(ev));
  }

  fonte(ev: Evento): string {
    return fonteExibicao(ev);
  }

  hora(ev: Evento): string {
    return extrairHora(ev.dataTexto) || '';
  }

  badge(ev: Evento): { dia: string; mes: string } {
    return diaMesAbrev(ev.dataIso);
  }

  quando(ev: Evento): string {
    const local = ev.subtitulo ? ` — ${ev.subtitulo}` : '';
    return `${ev.dataTexto}${local}`;
  }

  thumbSub(ev: Evento): string {
    const hora = extrairHora(ev.dataTexto);
    return hora ? `${this.fonte(ev)} · ${hora}` : this.fonte(ev);
  }

  mostrarImagem(ev: Evento): boolean {
    return Boolean(ev.imagemUrl) && !this.imagemFalhou().has(ev.titulo + ev.dataIso);
  }

  onImagemErro(ev: Evento): void {
    this.imagemFalhou.update((set) => {
      const next = new Set(set);
      next.add(ev.titulo + ev.dataIso);
      return next;
    });
  }

  slideAtivoFlag(i: number): boolean {
    return this.slideAtivo() === i;
  }

  trackEvento(_i: number, ev: Evento): string {
    return (ev.url || '') + ev.titulo + (ev.dataIso || '');
  }

  marcaEdClass(m: EventoMarca): string {
    if (m === 'novo') return 'ed-an';
    if (m === 'nubank') return 'ed-nb';
    if (m === 'base') return 'ed-bs';
    if (m === 'wtorre') return 'ed-wt';
    return 'ed-wt';
  }
}
