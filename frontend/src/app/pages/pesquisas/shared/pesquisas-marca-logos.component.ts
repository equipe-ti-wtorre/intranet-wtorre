import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MenuService } from '../../../services/menu.service';
import { PesquisasMarcaLogo, pesquisasLogoSrc, pesquisasMarcasOficiais } from './pesquisas-marca.util';

@Component({
  selector: 'app-pesquisas-marca-logos',
  standalone: true,
  template: `
    <div class="canvas-wordmark" [class.has-logo]="!!logo()" [attr.data-marca]="codigo()">
      @if (logo(); as src) {
        <div class="canvas-marca-slot">
          <img class="canvas-wordmark-logo" [src]="src" [alt]="alt()" />
        </div>
      } @else if (wordmark()) {
        <span class="wm-dot"></span>{{ wordmark() }}
      }
    </div>
  `,
})
export class PesquisasMarcaLogosComponent implements OnInit {
  private readonly menu = inject(MenuService);
  readonly codigo = input<string | null>(null);
  readonly wordmark = input<string | null>(null);
  readonly nome = input<string | null>(null);

  readonly marcas = signal<PesquisasMarcaLogo[]>(pesquisasMarcasOficiais());
  readonly logo = computed(() => pesquisasLogoSrc(this.codigo(), this.marcas()));
  readonly alt = computed(() => this.nome() || this.wordmark() || this.codigo() || 'Marca');

  ngOnInit(): void {
    this.menu.getTopbarPublic().subscribe({
      next: (config) => this.marcas.set(pesquisasMarcasOficiais(config.logos)),
    });
  }
}
