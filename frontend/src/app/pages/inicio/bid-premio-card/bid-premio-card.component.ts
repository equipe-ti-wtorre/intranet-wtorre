import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BidService } from '../../../services/bid.service';
import { BidPremio, BidVencedorTicketData } from '../../../models/bid.model';
import { BidVencedorTicketComponent } from '../bid-vencedor-ticket/bid-vencedor-ticket.component';

const BID_APP_URL = 'https://bid.nubankparque.com/';
const DISMISS_PREFIX = 'bid-premio-dismiss-';

function isDismissed(partidaId: number): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(`${DISMISS_PREFIX}${partidaId}`) === '1';
}

@Component({
  selector: 'app-bid-premio-card',
  standalone: true,
  imports: [BidVencedorTicketComponent],
  templateUrl: './bid-premio-card.component.html',
  styleUrl: './bid-premio-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BidPremioCardComponent {
  private readonly bidService = inject(BidService);

  readonly carregando = signal(true);
  readonly premios = signal<BidPremio[]>([]);
  readonly bidAppUrl = BID_APP_URL;

  readonly premiosVisiveis = computed(() =>
    this.premios().filter((p) => !isDismissed(p.partida_id))
  );

  readonly premioExibido = computed(() => {
    const lista = this.premiosVisiveis();
    if (!lista.length) return null;
    return [...lista].sort((a, b) => {
      const da = a.data_apuracao ? Date.parse(a.data_apuracao) : 0;
      const db = b.data_apuracao ? Date.parse(b.data_apuracao) : 0;
      return db - da;
    })[0];
  });

  readonly outrosPremios = computed(() => Math.max(0, this.premiosVisiveis().length - 1));

  readonly visivel = computed(() => !this.carregando() && this.premioExibido() != null);

  constructor() {
    this.carregar();
  }

  ticketData(premio: BidPremio): BidVencedorTicketData {
    return {
      titulo: premio.titulo,
      subtitulo: premio.subtitulo,
      local: premio.local,
      setor_evento_nome: premio.setor_evento_nome,
      imagem_url: premio.imagem_url,
      data_jogo: premio.data_jogo,
      data_aposta: premio.data_aposta,
      lance: premio.lance,
      quantidade_ingressos: premio.quantidade_ingressos,
      cta_url: premio.cta_url || BID_APP_URL,
    };
  }

  dismiss(premio: BidPremio): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${DISMISS_PREFIX}${premio.partida_id}`, '1');
    }
    this.premios.set([...this.premios()]);
  }

  ctaUrl(premio: BidPremio): string {
    return premio.cta_url || BID_APP_URL;
  }

  private carregar(): void {
    this.bidService.getMeusPremios().subscribe({
      next: (res) => {
        this.premios.set(res.premios ?? []);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        console.warn('[bid-premio-card] Falha ao carregar prêmios:', err.message);
        this.premios.set([]);
        this.carregando.set(false);
      },
    });
  }
}
