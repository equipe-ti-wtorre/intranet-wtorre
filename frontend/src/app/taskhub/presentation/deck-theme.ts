import { Component, EventEmitter, Input, Output } from '@angular/core';

// Visual das apresentações (tela cheia e PowerPoint). Escolhido no modal de cada apresentação;
// começa na aparência do sistema e o navegador lembra a última escolha.
export type DeckTheme = 'nubank-parque' | 'wtorre';

export const DECK_THEMES: { key: DeckTheme; label: string; hint: string }[] = [
  { key: 'nubank-parque', label: 'Nubank Parque', hint: 'Roxo e verde do guia da marca' },
  { key: 'wtorre', label: 'WTorre', hint: 'Azuis e padrão WT do guia da marca' },
];

// Montserrat e PT Serif (tipografia do guia WTorre) só são carregadas quando uma apresentação abre.
export function ensureBrandFonts() {
  if (typeof document === 'undefined' || document.getElementById('deck-brand-fonts')) return;
  const l = document.createElement('link');
  l.id = 'deck-brand-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&family=PT+Serif:ital@0;1&display=swap';
  document.head.appendChild(l);
}

const KEY = 'taskhub_deck_theme';
export function readDeckTheme(fallback: DeckTheme): DeckTheme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'wtorre' || v === 'nubank-parque' ? v : fallback;
  } catch { return fallback; }
}
export function saveDeckTheme(t: DeckTheme) { try { localStorage.setItem(KEY, t); } catch { /* sem armazenamento */ } }

// Paleta primária do Nubank Parque (Visual Guidelines · Paletas da Marca).
// Purple 1000 (#1E002F) fica de fora: o guia o reserva para a comunicação de Áreas Premium.
export const NP = {
  core: '8D0DE3', p900: '420465', p300: 'CBA5FD', p100: 'ECDFFF',
  g900: '174006', g300: 'A7D296', g200: 'C9E2BF', g100: 'E9F7E4',
} as const;

// Paleta do WTorre (Brand Guidelines 2023): quatro cores principais, branco e preto de apoio.
// Tipografia: Montserrat no conteúdo, PT Serif nos detalhes.
export const WT = { a01: '022B4C', a02: '1F597C', a03: '0071CE', cinza: 'CCCCCC' } as const;

// Cores do PowerPoint por visual (hex sem "#").
export interface PptxTheme {
  brand: string; soft: string; coverBg: string; coverTitle: string; coverMeta: string; coverText: string;
  title: string; ink: string; muted: string; line: string; surf: string; head: string; headInk: string; card: string; cardLine: string; track: string;
  chartA: string; chartB: string; timeBar: string; done: string; stripes: string | null; wtPattern: string | null; mark: string;
  nowBg: string; nowTitle: string; nowText: string; nowSub: string;
  font: string; headFont: string; detailFont: string; titleBold: boolean;
}
export const PPTX_THEMES: Record<DeckTheme, PptxTheme> = {
  wtorre: {
    // Guia: capa em Azul 01 com o padrão "WT" em Azul 02; títulos em Montserrat SemiBold Azul 01,
    // destaque em Azul 03, linhas e apoio em Cinza; detalhes (data) em PT Serif itálico.
    brand: WT.a03, soft: 'FFFFFF', coverBg: WT.a01, coverTitle: 'FFFFFF', coverMeta: WT.cinza, coverText: 'FFFFFF',
    title: WT.a01, ink: WT.a01, muted: WT.a02, line: WT.cinza, surf: 'FFFFFF', head: WT.a01, headInk: 'FFFFFF', card: 'FFFFFF', cardLine: WT.cinza, track: 'E5E5E5',
    chartA: WT.cinza, chartB: WT.a03, timeBar: WT.a02, done: WT.a03, stripes: null, wtPattern: WT.a02, mark: 'WTorre',
    nowBg: WT.a01, nowTitle: 'FFFFFF', nowText: 'FFFFFF', nowSub: WT.cinza,
    font: 'Montserrat', headFont: 'Montserrat SemiBold', detailFont: 'PT Serif', titleBold: false,
  },
  // Guia: capa em Core Purple com título em Green 200; em fundo claro, texto em Purple 900;
  // títulos em peso médio (Nu Sans Display Medium), sem negrito pesado nem caixa alta.
  'nubank-parque': {
    brand: NP.core, soft: NP.p100, coverBg: NP.core, coverTitle: NP.g200, coverMeta: NP.p100, coverText: 'FFFFFF',
    title: NP.p900, ink: NP.p900, muted: '6D6278', line: 'E6E0EE', surf: 'FFFFFF', head: NP.p100, headInk: NP.p900, card: NP.p100, cardLine: NP.p100, track: NP.p100,
    chartA: NP.p300, chartB: NP.core, timeBar: NP.g300, done: '3F8F62', stripes: NP.g200, wtPattern: null, mark: 'Nubank Parque',
    nowBg: NP.core, nowTitle: NP.g200, nowText: 'FFFFFF', nowSub: NP.p100,
    font: 'Segoe UI', headFont: 'Segoe UI Semibold', detailFont: 'Segoe UI', titleBold: false,
  },
};

// Padrão de faixas do guia (lateral direita das capas): colunas que afinam até a borda,
// alternando cheio e vazio, com a faixa do meio invertida. Coordenadas de 0 a 1.
const EDGES = [0, 0.39, 0.566, 0.685, 0.79, 0.84, 0.91, 0.944, 0.965, 1];
export function stripeRects(): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  const rows = [0, 1 / 3, 2 / 3, 1];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < EDGES.length - 1; c++) {
      const filled = (c % 2 === 0) !== (r === 1);
      if (filled) out.push({ x: EDGES[c], y: rows[r], w: EDGES[c + 1] - EDGES[c], h: rows[r + 1] - rows[r] });
    }
  }
  return out;
}

// Escolha do visual dentro do modal da apresentação.
@Component({
  selector: 'app-deck-theme-picker',
  standalone: true,
  template: `
    <div class="field">
      <span class="form-label">Visual</span>
      <div class="deck-themes" role="radiogroup" aria-label="Visual da apresentação">
        @for (t of themes; track t.key) {
          <button type="button" role="radio" class="deck-theme" [class.on]="value === t.key" [attr.aria-checked]="value === t.key" (click)="pick(t.key)">
            <span class="deck-theme__thumb" [class]="'deck-theme__thumb deck-theme__thumb--' + t.key" aria-hidden="true">
              @if (t.key === 'nubank-parque') {
                <svg viewBox="0 0 1 1" preserveAspectRatio="none">@for (r of stripes; track $index) { <rect [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.w" [attr.height]="r.h" /> }</svg>
              } @else { <span class="deck-theme__wt">WT WT<br />WT WT<br />WT WT</span> }
              <i></i>
            </span>
            <span class="deck-theme__txt"><b>{{ t.label }}</b><small>{{ t.hint }}</small></span>
          </button>
        }
      </div>
    </div>
  `,
})
export class DeckThemePickerComponent {
  @Input({ required: true }) value: DeckTheme = 'nubank-parque';
  @Output() valueChange = new EventEmitter<DeckTheme>();
  themes = DECK_THEMES;
  stripes = stripeRects();
  constructor() { ensureBrandFonts(); }
  pick(t: DeckTheme) { saveDeckTheme(t); this.valueChange.emit(t); }
}
