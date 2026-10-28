import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, computed, signal } from '@angular/core';
import { DeckSlide } from './day-deck';

// Apresentação em tela cheia dos slides montados (← → navegam, Esc sai).
@Component({
  selector: 'app-deck-viewer',
  standalone: true,
  template: `
    <div class="pv" role="dialog" aria-modal="true" [attr.aria-label]="'Apresentação: ' + (slides[0]?.title || '')">
      <div class="pv-stage">
        @if (cur(); as s) {
          @switch (s.kind) {
            @case ('cover') {
              <div class="pv-slide pv-cover">
                <div class="pv-cover__brand">TaskHub</div>
                <h1 class="pv-cover__title">{{ $any(s).title }}</h1>
                <div class="pv-cover__meta">{{ $any(s).subtitle }}</div>
                <div class="pv-cover__meta" style="color:#fff">{{ $any(s).meta }}</div>
              </div>
            }
            @case ('kpis') {
              <div class="pv-slide"><h2>{{ s.title }}</h2>
                <div class="pv-cards" [style.grid-template-columns]="'repeat(' + $any(s).items.length + ', minmax(0, 1fr))'">
                  @for (it of $any(s).items; track it.label) {
                    <div class="pv-card" [class.pv-card--warn]="it.tone === 'late'" [class.pv-card--amber]="it.tone === 'warn'"><span>{{ it.label }}</span><b>{{ it.value }}</b><small>{{ it.sub }}</small></div>
                  }
                </div>
                @if ($any(s).note) { <p>{{ $any(s).note }}</p> }
              </div>
            }
            @case ('periods') {
              <div class="pv-slide"><h2>{{ s.title }}</h2>
                <div class="pv-periods">
                  @for (c of $any(s).columns; track c.title) {
                    <div class="pv-period" [class.pv-period--now]="c.now">
                      <b>{{ c.title }}@if (c.now) { · agora }</b><small>{{ c.sub }}</small>
                      @for (r of c.rows.slice(0, 9); track $index) {
                        <div class="pv-pi" [class.done]="r.done" [class.pv-amber]="r.tone === 'warn' && !r.done"><i>{{ r.done ? '✓' : '○' }}</i><span>{{ r.cells[0] }}</span></div>
                      } @empty { <div class="pv-pi pv-muted">Nada neste período.</div> }
                      @if (c.rows.length > 9) { <small>+{{ c.rows.length - 9 }} itens</small> }
                    </div>
                  }
                </div>
              </div>
            }
            @case ('table') {
              <div class="pv-slide"><h2>{{ s.title }}</h2>
                @if ($any(s).rows.length) {
                  <table class="pv-table"><thead><tr>@for (h of $any(s).head; track h) { <th>{{ h }}</th> }</tr></thead>
                    <tbody>@for (r of $any(s).rows.slice(0, 10); track $index) {
                      <tr>@for (c of r.cells; track $index) { <td [class.pv-red]="r.tone === 'late' && ($index === 0 || $index === 3)" [class.pv-amber]="r.tone === 'warn' && $index === 0">{{ c }}</td> }</tr>
                    }</tbody></table>
                } @else { <p class="pv-empty">{{ $any(s).empty }}</p> }
              </div>
            }
            @case ('lists') {
              <div class="pv-slide"><h2>{{ s.title }}</h2>
                <div class="pv-cols">
                  @for (l of $any(s).lists; track l.title) {
                    <div><h3 [class]="'pv-tone-' + l.tone">{{ l.title }}</h3>
                      @for (r of l.rows; track $index) { <div class="pv-li"><b>{{ r.main }}</b><span>{{ r.sub }}</span></div> }
                      @empty { <p class="pv-muted" style="font-size: 1.6cqw">{{ l.empty }}</p> }
                    </div>
                  }
                </div>
              </div>
            }
          }
          @if (s.kind !== 'cover') { <div class="pv-foot"><span>{{ footer }}</span><span>{{ index() + 1 }} / {{ slides.length }}</span></div> }
        }
      </div>
      <div class="pv-bar">
        <button (click)="prev()" [disabled]="index() === 0" aria-label="Slide anterior">‹</button>
        <span>{{ index() + 1 }} de {{ slides.length }} · {{ cur()?.title }}</span>
        <button (click)="next()" [disabled]="index() === slides.length - 1" aria-label="Próximo slide">›</button>
        <button class="pv-exit" (click)="close.emit()">Sair (Esc)</button>
      </div>
    </div>
  `,
})
export class DeckViewerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) slides: DeckSlide[] = [];
  @Input() footer = 'TaskHub';
  @Output() close = new EventEmitter<void>();
  index = signal(0);
  cur = computed(() => this.slides[this.index()]);
  private wasFull = false;

  ngOnInit() { document.documentElement.requestFullscreen?.().catch(() => {}); }
  ngOnDestroy() { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }
  prev() { this.index.update(i => Math.max(0, i - 1)); }
  next() { this.index.update(i => Math.min(this.slides.length - 1, i + 1)); }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.next(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prev(); }
    if (e.key === 'Home') this.index.set(0);
    if (e.key === 'End') this.index.set(this.slides.length - 1);
    if (e.key === 'Escape') this.close.emit();
  }
  @HostListener('document:fullscreenchange')
  onFs() { if (!document.fullscreenElement && this.wasFull) this.close.emit(); this.wasFull = !!document.fullscreenElement; }
}
