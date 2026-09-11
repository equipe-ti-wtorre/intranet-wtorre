import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';
import { TreinamentosService } from '../../../services/treinamentos.service';
import { ContainersService } from '../../../services/containers.service';
import { DocumentosService } from '../../../services/documentos.service';
import { TreinamentoAdmin } from '../../../models/treinamento.model';
import { StorageContainer } from '../../../models/storage-container.model';
import {
  CategoriaDocumento,
  DocumentoPagina,
  DocumentoSetor,
  VisibilidadeEntidade,
  VisibilidadeEntidadeInput,
} from '../../../models/documento.model';
import { formatarDuracao, parseDuracaoInput } from '../../../utils/treinamento-categoria.util';
import { ConteudoEntidadesEditorComponent } from '../../../shared/admin/conteudo-entidades-editor/conteudo-entidades-editor.component';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';

@Component({
  selector: 'app-treinamentos-admin',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AdminModalComponent,
    ConteudoEntidadesEditorComponent,
    DocCatIconeComponent,
  ],
  templateUrl: './treinamentos-admin.component.html',
  styleUrl: './treinamentos-admin.component.scss',
})
export class TreinamentosAdminComponent implements OnInit {
  private readonly treinamentosService = inject(TreinamentosService);
  private readonly containersService = inject(ContainersService);
  private readonly documentosService = inject(DocumentosService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly paginas = signal<DocumentoPagina[]>([]);
  readonly setores = signal<DocumentoSetor[]>([]);
  readonly filtroPaginaId = signal<number | null>(null);

  readonly treinamentos = signal<TreinamentoAdmin[]>([]);
  readonly containers = signal<StorageContainer[]>([]);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly uploadProgress = signal(0);
  readonly editandoId = signal<number | null>(null);
  readonly modalAberto = signal(false);
  readonly visibilidadesTreino = signal<VisibilidadeEntidade[]>([]);
  readonly visibilidadesTreinoInput = signal<VisibilidadeEntidadeInput[]>([]);

  private videoFile: File | null = null;
  private thumbFile: File | null = null;
  private thumbObjectUrl: string | null = null;
  private editandoThumbObjectUrl: string | null = null;
  removerThumb = false;
  editandoTemThumb = false;
  videoFileName: string | null = null;

  get thumbPreviewUrl(): string | null {
    if (this.removerThumb) return null;
    if (this.thumbObjectUrl) return this.thumbObjectUrl;
    return this.editandoThumbObjectUrl;
  }

  readonly form = this.fb.nonNullable.group({
    titulo: ['', Validators.required],
    descricao: [''],
    setor_id: ['' as string | number],
    duracao: [''],
    destaque: [false],
    container: [''],
    ativo: [true],
  });

  readonly treinamentosFiltrados = computed(() => this.treinamentos());

  constructor() {
    effect(() => {
      const msg = this.mensagem();
      if (msg) this.alertas.sucesso(msg);
    });
    effect(() => {
      const err = this.erro();
      if (err) this.alertas.erro(err);
    });
  }

  ngOnInit(): void {
    this.carregarPaginas();
    this.carregarSetores();
    this.carregar();
    this.carregarContainers();
  }

  carregarPaginas(): void {
    this.documentosService.listarPaginasAdmin().subscribe({
      next: (list) => this.paginas.set(list.filter((p) => p.ativo)),
      error: () => {},
    });
  }

  carregarSetores(): void {
    this.documentosService.listarSetores().subscribe({
      next: (list) => this.setores.set(list.filter((s) => s.ativo !== false)),
      error: () => {},
    });
  }

  carregar(): void {
    const paginaId = this.filtroPaginaId();
    this.treinamentosService.listarAdmin(paginaId ?? undefined).subscribe({
      next: (list) => this.treinamentos.set(list),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar treinamentos.'),
    });
  }

  onFiltroPaginaChange(raw: string): void {
    const id = raw === '' ? null : Number(raw);
    this.filtroPaginaId.set(id && Number.isFinite(id) ? id : null);
    this.carregar();
  }

  carregarContainers(): void {
    this.containersService.listar().subscribe({
      next: (list) => {
        const ativos = list.filter((c) => c.ativo && c.id != null);
        this.containers.set(ativos);
        const padrao = ativos.find((c) => c.padrao);
        if (padrao && !this.form.controls.container.value) {
          this.form.patchValue({ container: padrao.nome });
        }
      },
      error: () => {},
    });
  }

  onVisibilidadesTreinoChange(v: VisibilidadeEntidadeInput[]): void {
    this.visibilidadesTreinoInput.set(v);
    const prev = new Map(this.visibilidadesTreino().map((item) => [Number(item.pagina_id), item]));
    this.visibilidadesTreino.set(
      v.map((item) => {
        const pag = this.paginas().find((p) => p.id === item.pagina_id);
        const existing = prev.get(Number(item.pagina_id));
        return {
          pagina_id: item.pagina_id,
          pagina_nome: pag?.nome ?? existing?.pagina_nome,
          pagina_slug: pag?.slug ?? existing?.pagina_slug,
          categoria_id: item.categoria_id,
          categoria_nome:
            existing?.categoria_id === item.categoria_id ? existing?.categoria_nome : undefined,
          categoria_slug:
            existing?.categoria_id === item.categoria_id ? existing?.categoria_slug : undefined,
        };
      })
    );
  }

  novo(): void {
    this.cancelar();
    const padrao = this.containers().find((c) => c.padrao);
    const filtro = this.filtroPaginaId();
    const pagina = filtro != null ? this.paginas().find((p) => p.id === filtro) : this.paginas()[0];
    if (pagina) {
      this.visibilidadesTreino.set([{ pagina_id: pagina.id, pagina_nome: pagina.nome, pagina_slug: pagina.slug, categoria_id: null }]);
    }
    this.form.patchValue({ container: padrao?.nome ?? '' });
    this.modalAberto.set(true);
  }

  editar(t: TreinamentoAdmin): void {
    this.editandoId.set(t.id);
    this.form.patchValue({
      titulo: t.titulo,
      descricao: t.descricao ?? '',
      setor_id: t.setorId ?? '',
      duracao: formatarDuracao(t.duracaoSeg),
      destaque: t.destaque,
      container: t.container,
      ativo: t.ativo,
    });
    this.visibilidadesTreino.set(t.visibilidades ?? []);
    this.visibilidadesTreinoInput.set(
      (t.visibilidades ?? [])
        .filter((v) => v.categoria_id != null)
        .map((v) => ({
          pagina_id: Number(v.pagina_id),
          categoria_id: Number(v.categoria_id),
        }))
    );
    this.videoFile = null;
    this.videoFileName = null;
    this.thumbFile = null;
    this.removerThumb = false;
    this.revokeThumbObjectUrl();
    this.revokeEditandoThumbUrl();
    this.editandoTemThumb = t.temThumb;
    if (t.temThumb) {
      this.treinamentosService.carregarThumb(t.id).subscribe({
        next: (blob) => {
          if (!blob) {
            this.editandoTemThumb = false;
            return;
          }
          this.editandoThumbObjectUrl = URL.createObjectURL(blob);
        },
        error: () => {
          this.editandoTemThumb = false;
        },
      });
    }
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.cancelar();
  }

  cancelar(): void {
    this.editandoId.set(null);
    this.videoFile = null;
    this.videoFileName = null;
    this.thumbFile = null;
    this.removerThumb = false;
    this.editandoTemThumb = false;
    this.revokeThumbObjectUrl();
    this.revokeEditandoThumbUrl();
    this.uploadProgress.set(0);
    this.visibilidadesTreino.set([]);
    this.visibilidadesTreinoInput.set([]);
    this.form.reset({
      destaque: false,
      ativo: true,
      container: this.containers().find((c) => c.padrao)?.nome ?? '',
    });
  }

  tituloModal(): string {
    return this.editandoId() ? 'Editar treinamento' : 'Novo treinamento';
  }

  subtituloModal(): string {
    return this.editandoId()
      ? 'Atualize os dados; envie novo vídeo ou thumb apenas se quiser substituir.'
      : 'Envie um vídeo de capacitação para a biblioteca.';
  }

  onVideoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.videoFile = input.files?.[0] ?? null;
    this.videoFileName = this.videoFile?.name ?? null;
  }

  onThumbSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.revokeThumbObjectUrl();
    this.thumbFile = file;
    this.removerThumb = false;
    if (file) {
      this.thumbObjectUrl = URL.createObjectURL(file);
    }
  }

  marcarRemoverThumb(): void {
    this.removerThumb = true;
    this.thumbFile = null;
    this.revokeThumbObjectUrl();
  }

  private revokeThumbObjectUrl(): void {
    if (this.thumbObjectUrl) {
      URL.revokeObjectURL(this.thumbObjectUrl);
      this.thumbObjectUrl = null;
    }
  }

  private revokeEditandoThumbUrl(): void {
    if (this.editandoThumbObjectUrl) {
      URL.revokeObjectURL(this.editandoThumbObjectUrl);
      this.editandoThumbObjectUrl = null;
    }
  }

  salvar(): void {
    if (this.form.invalid) return;
    const editId = this.editandoId();
    if (!editId && !this.videoFile) {
      this.erro.set('Selecione um arquivo de vídeo.');
      return;
    }
    const vis = this.visibilidadesTreinoInput();
    if (!vis.length) {
      this.erro.set('Marque ao menos uma entidade com categoria.');
      return;
    }

    const raw = this.form.getRawValue();
    const formData = new FormData();
    formData.append('titulo', raw.titulo.trim());
    formData.append('descricao', raw.descricao.trim());
    formData.append('visibilidades', JSON.stringify(vis));
    if (raw.setor_id !== '' && raw.setor_id != null) {
      formData.append('setor_id', String(raw.setor_id));
    }
    const dur = parseDuracaoInput(raw.duracao);
    if (dur != null) formData.append('duracao_seg', String(dur));
    formData.append('destaque', raw.destaque ? 'true' : 'false');
    if (raw.container) formData.append('container', raw.container);
    if (editId) formData.append('ativo', raw.ativo ? 'true' : 'false');
    if (this.videoFile) formData.append('video', this.videoFile);
    if (this.thumbFile) formData.append('thumb', this.thumbFile);
    if (this.removerThumb) formData.append('remover_thumb', 'true');

    this.salvando.set(true);
    this.uploadProgress.set(0);
    this.erro.set('');
    this.mensagem.set('');

    const req = editId
      ? this.treinamentosService.atualizar(editId, formData)
      : this.treinamentosService.criar(formData);

    req.subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
        } else if (event.type === HttpEventType.Response) {
          this.mensagem.set(editId ? 'Treinamento atualizado.' : 'Treinamento criado.');
          this.salvando.set(false);
          this.uploadProgress.set(0);
          this.modalAberto.set(false);
          this.cancelar();
          this.carregar();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar treinamento.');
        this.salvando.set(false);
        this.uploadProgress.set(0);
      },
    });
  }

  async excluir(t: TreinamentoAdmin): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Remover o treinamento "${t.titulo}"? O vídeo será apagado do storage.`,
    });
    if (!ok) return;
    this.treinamentosService.remover(t.id).subscribe({
      next: () => {
        this.mensagem.set('Treinamento removido.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao excluir treinamento.'),
    });
  }

  duracaoLabel(t: TreinamentoAdmin): string {
    return formatarDuracao(t.duracaoSeg);
  }

  entidadesBadges(t: TreinamentoAdmin): string[] {
    const vis = t.visibilidades ?? [];
    if (vis.length) {
      return vis.map((v) => v.pagina_nome ?? v.pagina_slug ?? `Entidade ${v.pagina_id}`);
    }
    return t.paginaNome ? [t.paginaNome] : [t.paginaSlug];
  }

  setorLabel(t: TreinamentoAdmin): string {
    return t.setor?.nome ?? '—';
  }

  categoriaPorEntidade(t: TreinamentoAdmin): string {
    const filtro = this.filtroPaginaId();
    const vis = t.visibilidades ?? [];
    if (filtro != null) {
      const match = vis.find((v) => v.pagina_id === filtro);
      if (match?.categoria_nome) return match.categoria_nome;
    }
    if (vis.length === 1 && vis[0].categoria_nome) return vis[0].categoria_nome;
    if (vis.length > 1) return `${vis.length} categorias`;
    return t.categoriaNome ?? 'Sem categoria';
  }

  previewTitulo(): string {
    return this.form.controls.titulo.value?.trim() || 'Sem título';
  }

  previewDescricao(): string {
    return this.form.controls.descricao.value?.trim() || '';
  }

  previewDuracao(): string {
    const raw = this.form.controls.duracao.value?.trim();
    return raw || '—';
  }

  previewCoverWords(): string[] {
    return this.previewTitulo().split(/\s+/).filter(Boolean).slice(0, 2);
  }

  previewSetor(): DocumentoSetor | null {
    const raw = this.form.controls.setor_id.value;
    const id = Number(raw);
    if (!id) return null;
    return this.setores().find((s) => s.id === id) ?? null;
  }

  hexAlpha(hex: string, alpha: number): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return `rgba(29, 84, 230, ${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
