import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CipaEvento } from '../../models/cipa.model';
import { CipaService } from '../../services/cipa.service';
import { layoutImagemEvento } from '../../utils/cipa-card-layout.util';
import { FooterComponent } from '../../shared/footer/footer.component';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';

@Component({
  selector: 'app-cipa-lista',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, FormsModule, RouterLink],
  templateUrl: './cipa-lista.component.html',
  styleUrl: './cipa-lista.component.scss',
})
export class CipaListaComponent implements OnInit, OnDestroy {
  private readonly api = inject(CipaService);
  private readonly blobUrls = new Map<string, string>();

  readonly carregando = signal(true);
  readonly erro = signal('');
  readonly eventos = signal<CipaEvento[]>([]);
  readonly categoria = signal('');
  readonly dataFiltro = signal('');
  readonly imagens = signal<Record<string, string>>({});

  readonly categorias = computed(() => {
    const set = new Set(
      this.eventos()
        .map((e) => e.categoria)
        .filter(Boolean)
    );
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  readonly filtrados = computed(() => {
    const cat = this.categoria();
    const data = this.dataFiltro();
    return this.eventos().filter((e) => {
      if (cat && e.categoria !== cat) return false;
      if (data && e.data !== data) return false;
      return true;
    });
  });

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    for (const url of this.blobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api.listar().subscribe({
      next: (lista) => {
        this.eventos.set(lista);
        this.carregando.set(false);
        this.carregarImagens(lista);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Não foi possível carregar os eventos da Agenda RH.');
        this.carregando.set(false);
      },
    });
  }

  carregarImagens(lista: CipaEvento[]): void {
    for (const url of this.blobUrls.values()) URL.revokeObjectURL(url);
    this.blobUrls.clear();
    this.imagens.set({});
    for (const ev of lista) {
      if (!ev.tem_imagem) continue;
      this.api.imagem(ev.codigo, ev.atualizado_em).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.blobUrls.set(ev.codigo, url);
          this.imagens.update((m) => ({ ...m, [ev.codigo]: url }));
        },
        error: () => {
          /* card sem imagem */
        },
      });
    }
  }

  formatarData(iso: string): string {
    const [y, m, d] = String(iso || '').split('-');
    if (!d) return iso || '';
    return `${d}/${m}/${y}`;
  }

  posicaoImagem(ev: CipaEvento): string {
    return layoutImagemEvento(ev).posicao;
  }

  escalaImagem(ev: CipaEvento): string {
    return layoutImagemEvento(ev).escala;
  }
}
