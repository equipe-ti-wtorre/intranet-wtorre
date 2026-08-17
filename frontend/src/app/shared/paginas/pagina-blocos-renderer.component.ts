import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  BlocoBotaoConfig,
  BlocoCarrosselConfig,
  BlocoImagemConfig,
  BlocoTextoConfig,
  PaginaBloco,
} from '../../models/pagina.model';
import { PaginaCarrosselComponent } from './pagina-carrossel.component';

@Component({
  selector: 'app-pagina-blocos-renderer',
  standalone: true,
  imports: [PaginaCarrosselComponent],
  templateUrl: './pagina-blocos-renderer.component.html',
  styleUrl: './pagina-blocos-renderer.component.scss',
})
export class PaginaBlocosRendererComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly blocos = input<PaginaBloco[]>([]);
  readonly tituloPagina = input<string>('');

  htmlSeguro(html: string): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, html || '') || '';
  }

  asTexto(config: PaginaBloco['config']): BlocoTextoConfig {
    return config as BlocoTextoConfig;
  }

  asImagem(config: PaginaBloco['config']): BlocoImagemConfig {
    return config as BlocoImagemConfig;
  }

  asCarrossel(config: PaginaBloco['config']): BlocoCarrosselConfig {
    return config as BlocoCarrosselConfig;
  }

  asBotao(config: PaginaBloco['config']): BlocoBotaoConfig {
    return config as BlocoBotaoConfig;
  }
}
