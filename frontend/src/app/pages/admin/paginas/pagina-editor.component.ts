import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AlertasService } from '../../../services/alertas.service';
import { PaginasService } from '../../../services/paginas.service';
import {
  BlocoBotaoConfig,
  BlocoCarrosselConfig,
  BlocoImagemConfig,
  BlocoTextoConfig,
  PaginaBloco,
  StatusPagina,
  TipoBloco,
} from '../../../models/pagina.model';
import { slugValido, tituloParaSlug } from '../../../utils/pagina-slug.util';
import { PaginaBlocosCanvasComponent } from './blocos/pagina-blocos-canvas.component';
import { BlocoInspetorComponent } from './blocos/bloco-inspetor.component';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { PaginaBlocosRendererComponent } from '../../../shared/paginas/pagina-blocos-renderer.component';

function novoBloco(tipo: TipoBloco, ordem: number): PaginaBloco {
  const id = crypto.randomUUID();
  switch (tipo) {
    case 'texto':
      return { id, tipo, ordem, config: { html: '<p></p>' } as BlocoTextoConfig };
    case 'imagem':
      return { id, tipo, ordem, config: { url: '' } as BlocoImagemConfig };
    case 'carrossel':
      return {
        id,
        tipo,
        ordem,
        config: { slides: [{ url: '', alt: '' }], autoplay: false, intervaloMs: 5000 } as BlocoCarrosselConfig,
      };
    case 'botao':
      return {
        id,
        tipo,
        ordem,
        config: {
          label: 'Saiba mais',
          url: '/inicio',
          estilo: 'primario',
          alinhamento: 'center',
        } as BlocoBotaoConfig,
      };
  }
}

@Component({
  selector: 'app-pagina-editor',
  standalone: true,
  imports: [
    RouterLink,
    PaginaBlocosCanvasComponent,
    BlocoInspetorComponent,
    AdminModalComponent,
    PaginaBlocosRendererComponent,
  ],
  templateUrl: './pagina-editor.component.html',
  styleUrl: './pagina-editor.component.scss',
})
export class PaginaEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly paginasService = inject(PaginasService);
  private readonly alertas = inject(AlertasService);

  readonly paginaId = signal<number | null>(null);
  readonly titulo = signal('');
  readonly slug = signal('');
  readonly slugManual = signal(false);
  readonly descricao = signal('');
  readonly status = signal<StatusPagina>('rascunho');
  readonly blocos = signal<PaginaBloco[]>([]);
  readonly selecionadoId = signal<string | null>(null);
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly previewAberto = signal(false);
  readonly uploadProgress = signal(0);
  readonly mensagem = signal('');
  readonly erro = signal('');

  readonly blocoSelecionado = computed(() => {
    const id = this.selecionadoId();
    return this.blocos().find((b) => b.id === id) ?? null;
  });

  readonly tituloPagina = computed(() => (this.paginaId() ? 'Editar página' : 'Nova página'));

  constructor() {
    effect(() => {
      const msg = this.mensagem();
      if (msg) this.alertas.sucesso(msg);
    });
    effect(() => {
      const err = this.erro();
      if (err) this.alertas.erro(err);
    });

    effect(() => {
      if (this.slugManual()) return;
      const t = this.titulo();
      if (t) this.slug.set(tituloParaSlug(t));
    });
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam && idParam !== 'nova') {
      const id = Number(idParam);
      this.paginaId.set(id);
      this.carregar(id);
    } else {
      this.carregando.set(false);
    }
  }

  carregar(id: number): void {
    this.carregando.set(true);
    this.paginasService.obter(id).subscribe({
      next: (p) => {
        this.titulo.set(p.titulo);
        this.slug.set(p.slug);
        this.slugManual.set(true);
        this.descricao.set(p.descricao || '');
        this.status.set(p.status);
        this.blocos.set(p.blocos || []);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar página.');
        this.carregando.set(false);
      },
    });
  }

  onTituloInput(value: string): void {
    this.titulo.set(value);
  }

  onSlugInput(value: string): void {
    this.slugManual.set(true);
    this.slug.set(value);
  }

  adicionarBloco(tipo: TipoBloco): void {
    const list = [...this.blocos()];
    const bloco = novoBloco(tipo, list.length);
    list.push(bloco);
    this.blocos.set(list);
    this.selecionadoId.set(bloco.id);
  }

  onBlocosChange(list: PaginaBloco[]): void {
    this.blocos.set(list);
  }

  onBlocoChange(bloco: PaginaBloco): void {
    this.blocos.set(this.blocos().map((b) => (b.id === bloco.id ? bloco : b)));
  }

  duplicarBloco(id: string): void {
    const src = this.blocos().find((b) => b.id === id);
    if (!src) return;
    const copy: PaginaBloco = {
      ...src,
      id: crypto.randomUUID(),
      config: JSON.parse(JSON.stringify(src.config)),
    };
    const list = [...this.blocos()];
    const idx = list.findIndex((b) => b.id === id);
    list.splice(idx + 1, 0, copy);
    this.blocos.set(list.map((b, i) => ({ ...b, ordem: i })));
    this.selecionadoId.set(copy.id);
  }

  removerBloco(id: string): void {
    const list = this.blocos().filter((b) => b.id !== id).map((b, i) => ({ ...b, ordem: i }));
    this.blocos.set(list);
    if (this.selecionadoId() === id) {
      this.selecionadoId.set(list[0]?.id ?? null);
    }
  }

  validarLocal(): boolean {
    if (!this.titulo().trim()) {
      this.erro.set('Informe o título da página.');
      return false;
    }
    if (!slugValido(this.slug())) {
      this.erro.set('Slug inválido. Use apenas letras minúsculas, números e hífens.');
      return false;
    }
    for (const bloco of this.blocos()) {
      if (bloco.tipo === 'carrossel') {
        const slides = (bloco.config as BlocoCarrosselConfig).slides?.filter((s) => s.url?.trim()) ?? [];
        if (!slides.length) {
          this.erro.set('O carrossel precisa de ao menos uma imagem.');
          return false;
        }
      }
    }
    return true;
  }

  private blocosParaSalvar(): PaginaBloco[] {
    return this.blocos().map((bloco) => {
      if (bloco.tipo !== 'carrossel') return bloco;
      const cfg = bloco.config as BlocoCarrosselConfig;
      const slides = (cfg.slides ?? []).filter((s) => s.url?.trim());
      return { ...bloco, config: { ...cfg, slides } };
    });
  }

  salvar(publicar = false): void {
    if (!this.validarLocal()) return;

    const payload = {
      titulo: this.titulo().trim(),
      slug: this.slug().trim(),
      descricao: this.descricao().trim() || null,
      blocos: this.blocosParaSalvar(),
      status: (publicar ? 'publicada' : this.status()) as StatusPagina,
    };

    if (publicar) {
      payload.status = 'publicada';
    }

    this.salvando.set(true);
    const id = this.paginaId();

    const req = id
      ? this.paginasService.atualizar(id, payload)
      : this.paginasService.criar(payload);

    req.subscribe({
      next: (p) => {
        this.salvando.set(false);
        this.status.set(p.status);
        if (!id) {
          this.paginaId.set(p.id);
          this.router.navigate(['/admin/paginas', p.id, 'editar'], { replaceUrl: true });
        }
        this.mensagem.set(publicar ? 'Página publicada.' : 'Página salva.');
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar a página.');
      },
    });
  }

  publicar(): void {
    this.salvar(true);
  }

  abrirPreview(): void {
    this.previewAberto.set(true);
  }

  fecharPreview(): void {
    this.previewAberto.set(false);
  }

  voltar(): void {
    this.router.navigate(['/admin/paginas']);
  }
}
