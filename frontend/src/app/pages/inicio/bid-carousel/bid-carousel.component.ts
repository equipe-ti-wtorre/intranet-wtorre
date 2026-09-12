import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BidService } from '../../../services/bid.service';
import { BidEventoCarrossel, BidVencedorTicketData } from '../../../models/bid.model';
import { BidVencedorTicketComponent } from '../bid-vencedor-ticket/bid-vencedor-ticket.component';

const COUNTDOWN_MS = 1000;
const AUTOPLAY_MS = 6000;
const BID_APP_URL = 'https://bid.nubankparque.com/';
const BID_HISTORICO_URL = 'https://bid.nubankparque.com/historico';

interface CountdownInfo {
  texto: string;
  urgente: boolean;
}

function cardsPorLargura(largura: number): number {
  if (largura <= 600) return 1;
  if (largura <= 900) return 2;
  return 3;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

@Component({
  selector: 'app-bid-carousel',
  standalone: true,
  imports: [BidVencedorTicketComponent],
  templateUrl: './bid-carousel.component.html',
  styleUrl: './bid-carousel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BidCarouselComponent implements OnDestroy {
  private readonly bidService = inject(BidService);

  readonly bidAppUrl = BID_APP_URL;

  readonly eventos = signal<BidEventoCarrossel[]>([]);
  readonly carregando = signal(true);
  readonly visivel = signal(false);
  readonly paginaAtual = signal(0);
  readonly cardsPorPagina = signal(cardsPorLargura(typeof window !== 'undefined' ? window.innerWidth : 1080));
  readonly agora = signal(Date.now());
  readonly transicaoAtiva = signal(true);

  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private autoplayTimer: ReturnType<typeof setInterval> | null = null;
  private autoplayPausado = false;

  readonly total = computed(() => this.eventos().length);
  readonly totalPaginas = computed(() => {
    const total = this.total();
    if (total === 0) return 0;
    return Math.ceil(total / this.cardsPorPagina());
  });
  readonly eventosLoop = computed(() => {
    const lista = this.eventos();
    if (lista.length === 0) return [];
    if (this.totalPaginas() <= 1) return lista;
    return [...lista, ...lista];
  });
  readonly loopInfinito = computed(() => this.totalPaginas() > 1);
  readonly trackOffset = computed(() => `translateX(-${this.paginaAtual() * 100}%)`);
  readonly paginaLogicaAtual = computed(() => {
    const paginas = this.totalPaginas();
    if (paginas <= 0) return 0;
    return this.paginaAtual() % paginas;
  });
  readonly multiplasPaginas = computed(() => this.totalPaginas() > 1);
  readonly paginas = computed(() => Array.from({ length: this.totalPaginas() }, (_, i) => i));

  constructor() {
    this.carregar();
    this.countdownTimer = setInterval(() => this.agora.set(Date.now()), COUNTDOWN_MS);
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.pausarAutoplay();
  }

  onCarouselMouseEnter(): void {
    this.autoplayPausado = true;
    this.pausarAutoplay();
  }

  onCarouselMouseLeave(): void {
    this.autoplayPausado = false;
    this.retomarAutoplay();
  }

  @HostListener('window:resize')
  onResize(): void {
    const anterior = this.cardsPorPagina();
    const atual = cardsPorLargura(window.innerWidth);
    if (anterior === atual) return;

    this.cardsPorPagina.set(atual);
    const maxPagina = Math.max(0, this.totalPaginas() - 1);
    if (this.paginaLogicaAtual() > maxPagina) {
      this.paginaAtual.set(maxPagina);
    } else {
      this.paginaAtual.set(this.paginaLogicaAtual());
    }
    this.retomarAutoplay();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.bidService.getEventosAbertos().subscribe({
      next: (res) => {
        const lista = res.eventos ?? [];
        this.eventos.set(lista);
        this.visivel.set(lista.length > 0);
        this.paginaAtual.set(0);
        this.transicaoAtiva.set(true);
        this.carregando.set(false);
        this.retomarAutoplay();
      },
      error: (err: HttpErrorResponse) => {
        this.eventos.set([]);
        this.visivel.set(false);
        this.carregando.set(false);
        this.pausarAutoplay();
        if (err.status !== 503) {
          console.warn('[bid-carousel] Falha ao carregar eventos:', err.error?.mensagem || err.message);
        }
      },
    });
  }

  trackSlot(index: number, ev: BidEventoCarrossel): string {
    return `${ev.id}-${index}`;
  }

  irParaPagina(i: number): void {
    const paginas = this.totalPaginas();
    if (paginas <= 0) return;
    this.transicaoAtiva.set(true);
    this.paginaAtual.set(Math.max(0, Math.min(i, paginas - 1)));
  }

  anterior(): void {
    const paginas = this.totalPaginas();
    if (paginas <= 1) return;

    if (this.paginaAtual() === 0) {
      this.semTransicao(() => this.paginaAtual.set(paginas));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.transicaoAtiva.set(true);
          this.paginaAtual.update((p) => p - 1);
        });
      });
      return;
    }

    this.transicaoAtiva.set(true);
    this.paginaAtual.update((p) => p - 1);
  }

  proximo(): void {
    const paginas = this.totalPaginas();
    if (paginas <= 1) return;

    this.transicaoAtiva.set(true);
    this.paginaAtual.update((p) => p + 1);
  }

  onTrackTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName !== 'transform') return;

    const paginas = this.totalPaginas();
    if (paginas <= 1) return;

    if (this.paginaAtual() >= paginas) {
      this.semTransicao(() => this.paginaAtual.update((p) => p - paginas));
    }
  }

  private proximoAutoplay(): void {
    if (!this.loopInfinito()) return;
    this.proximo();
  }

  private semTransicao(acao: () => void): void {
    this.transicaoAtiva.set(false);
    acao();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.transicaoAtiva.set(true));
    });
  }

  private retomarAutoplay(): void {
    this.pausarAutoplay();
    if (this.autoplayPausado || !this.multiplasPaginas()) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    this.autoplayTimer = setInterval(() => this.proximoAutoplay(), AUTOPLAY_MS);
  }

  private pausarAutoplay(): void {
    if (this.autoplayTimer) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.anterior();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.proximo();
    }
  }

  isAberta(ev: BidEventoCarrossel): boolean {
    return ev.situacao === 'aberta';
  }

  isEncerrada(ev: BidEventoCarrossel): boolean {
    return ev.situacao === 'encerrada';
  }

  isVencedor(ev: BidEventoCarrossel): boolean {
    return ev.situacao === 'vencedor';
  }

  ctaUrl(ev: BidEventoCarrossel): string {
    if (this.isEncerrada(ev)) return BID_HISTORICO_URL;
    return this.bidAppUrl;
  }

  ticketData(ev: BidEventoCarrossel): BidVencedorTicketData {
    return {
      titulo: ev.titulo,
      subtitulo: ev.subtitulo,
      local: ev.local,
      setor_evento_nome: ev.setor_evento_nome,
      imagem_url: ev.imagem_url,
      data_jogo: ev.data_jogo,
      data_aposta: ev.data_aposta ?? null,
      lance: ev.lance_vencedor ?? 0,
      quantidade_ingressos: ev.quantidade_ingressos,
      cta_url: this.ctaUrl(ev),
    };
  }

  formatarDataLinha(ev: BidEventoCarrossel): string {
    if (!ev.data_jogo) return '—';
    const data = new Date(ev.data_jogo).toLocaleString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const local = ev.setor_evento_nome || ev.local;
    return local ? `${data} · ${local}` : data;
  }

  formatarCountdown(iso: string | null): CountdownInfo | null {
    if (!iso) return null;
    void this.agora();

    const diff = new Date(iso).getTime() - this.agora();
    if (diff <= 0) {
      return { texto: '00:00:00', urgente: true };
    }

    const seg = Math.floor(diff / 1000);
    const d = Math.floor(seg / 86400);
    const h = Math.floor((seg % 86400) / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    const urgente = diff < 3 * 3600000;

    const texto = d > 0 ? `${d}d ${pad2(h)}:${pad2(m)}` : `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    return { texto, urgente };
  }

  legendaIngressos(ev: BidEventoCarrossel): string {
    return this.isEncerrada(ev) ? 'ingressos sorteados' : 'ingressos disponíveis';
  }

  textoCta(ev: BidEventoCarrossel): string {
    if (this.isAberta(ev)) return 'FAZER MEU LANCE';
    return 'ACESSAR HISTÓRICO';
  }
}
