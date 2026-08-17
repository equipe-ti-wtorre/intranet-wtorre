import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  input,
  output,
} from '@angular/core';
import { DatePipe, DecimalPipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { BidVencedorTicketData } from '../../../models/bid.model';

registerLocaleData(localePt);

const BID_APP_URL = 'https://bid.nubankparque.com/';
const CONFETE_CORES = ['#ffd76a', '#ffffff', '#7aa2ff', '#5eead4', '#f9a8d4'];
const CONFETE_QTD = 20;

interface ConfeteParticula {
  id: number;
  left: number;
  cor: string;
  duration: number;
  delay: number;
  size: number;
}

function lanceFormato(lance: number): string {
  return Number.isInteger(lance) ? '1.0-0' : '1.0-2';
}

function gerarConfete(): ConfeteParticula[] {
  return Array.from({ length: CONFETE_QTD }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    cor: CONFETE_CORES[i % CONFETE_CORES.length],
    duration: 2.6 + Math.random() * 2.4,
    delay: Math.random() * 3,
    size: 5 + Math.random() * 5,
  }));
}

@Component({
  selector: 'app-bid-vencedor-ticket',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  providers: [{ provide: LOCALE_ID, useValue: 'pt-BR' }],
  templateUrl: './bid-vencedor-ticket.component.html',
  styleUrl: './bid-vencedor-ticket.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.bid-vencedor-ticket-host--compact]': 'compact()',
  },
})
export class BidVencedorTicketComponent {
  readonly data = input.required<BidVencedorTicketData>();
  readonly compact = input(false);
  readonly showDismiss = input(false);
  readonly showConfete = input(false);

  readonly confeteParticulas = computed(() => {
    if (!this.showConfete()) return [];
    return gerarConfete();
  });

  readonly dismiss = output<void>();

  readonly lanceFormato = lanceFormato;

  ctaUrl(): string {
    return BID_APP_URL;
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
