import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DocCatIconeService } from './doc-cat-icone.service';

@Component({
  selector: 'app-doc-cat-icone',
  standalone: true,
  template: `
    @if (resolvido().segmento === 'custom') {
      <img
        [src]="customUrl()"
        [width]="size()"
        [height]="size()"
        alt=""
        aria-hidden="true"
      />
    } @else {
      <svg
        [attr.width]="size()"
        [attr.height]="size()"
        [style.color]="cor()"
        aria-hidden="true"
        focusable="false"
      >
        <use [attr.href]="href()" [attr.xlink:href]="href()" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--ink-soft, #48536a);
    }
    svg,
    img {
      display: block;
      object-fit: contain;
    }
  `,
})
export class DocCatIconeComponent {
  private readonly iconeService = inject(DocCatIconeService);

  readonly nome = input<string | null | undefined>(null);
  readonly size = input(20);

  private readonly pronto = signal(false);

  readonly resolvido = computed(() => this.iconeService.resolve(this.nome()));

  readonly href = computed(() => {
    const sprite = this.iconeService.spriteUrlFor(this.nome());
    const id = this.iconeService.symbolIdFor(this.nome());
    return `${sprite}#${id}`;
  });

  readonly customUrl = computed(() => this.iconeService.customIconUrl(this.nome()));

  readonly cor = computed(() => {
    const r = this.resolvido();
    if (r.segmento === 'brand') {
      return this.iconeService.brandColor(this.nome()) ?? 'currentColor';
    }
    return 'currentColor';
  });

  constructor() {
    effect(() => {
      const n = this.nome();
      void this.iconeService.ensureSpriteFor(n).then(() => this.pronto.set(true));
    });
  }
}
