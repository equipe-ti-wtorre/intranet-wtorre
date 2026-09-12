import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { DocumentosService } from '../../../services/documentos.service';
import {
  ALLOWED_EXTENSIONS,
  CategoriaDocumento,
  Documento,
  DocumentoPagina,
  DocumentoSetor,
  ICONE_PADRAO,
  MAX_UPLOAD_MB,
  VisibilidadeEntidade,
  VisibilidadeEntidadeInput,
} from '../../../models/documento.model';
import { DocAdminNodeAction, DocAdminNodeComponent } from './doc-admin-node.component';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AdminDropzoneComponent } from '../../../shared/admin/admin-dropzone/admin-dropzone.component';
import { ConteudoEntidadesEditorComponent } from '../../../shared/admin/conteudo-entidades-editor/conteudo-entidades-editor.component';
import { AlertasService } from '../../../services/alertas.service';
import { DocCatIconePickerComponent } from '../../../shared/documentos/doc-cat-icone-picker.component';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';
import { DocEntidadeLogoPickerComponent } from '../../../shared/documentos/doc-entidade-logo-picker.component';
import { DocCatIconeService } from '../../../shared/documentos/doc-cat-icone.service';
import { AuthService } from '../../../services/auth.service';
import { TreinamentosAdminComponent } from '../treinamentos-admin/treinamentos-admin.component';

type AdminTab = 'paginas' | 'setores' | 'categorias' | 'treinamentos';

interface PaiOption {
  id: number;
  label: string;
  depth: number;
}

@Component({
  selector: 'app-documentos-admin',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DocAdminNodeComponent,
    AdminModalComponent,
    AdminDropzoneComponent,
    DocCatIconePickerComponent,
    DocCatIconeComponent,
    DocEntidadeLogoPickerComponent,
    ConteudoEntidadesEditorComponent,
    TreinamentosAdminComponent,
  ],
  templateUrl: './documentos-admin.component.html',
  styleUrl: './documentos-admin.component.scss',
})
export class DocumentosAdminComponent implements OnInit {
  readonly MAX_UPLOAD_MB = MAX_UPLOAD_MB;
  readonly uploadAccept = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(',');
  private readonly documentosService = inject(DocumentosService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);
  private readonly iconeService = inject(DocCatIconeService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly abaAtiva = signal<AdminTab>('categorias');
  readonly paginas = signal<DocumentoPagina[]>([]);
  readonly setores = signal<DocumentoSetor[]>([]);
  readonly paginaSelecionadaId = signal<number | null>(null);
  readonly categorias = signal<CategoriaDocumento[]>([]);
  readonly documentos = signal<Documento[]>([]);
  readonly categoriaSelecionada = signal<CategoriaDocumento | null>(null);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly editandoCatId = signal<number | null>(null);
  readonly editandoDocId = signal<number | null>(null);
  readonly editandoPaginaId = signal<number | null>(null);
  readonly editandoSetorId = signal<number | null>(null);
  readonly uploadProgress = signal(0);
  readonly uploadando = signal(false);
  readonly modalCatAberto = signal(false);
  readonly modalIconeAberto = signal(false);
  readonly iconTemp = signal(ICONE_PADRAO);
  readonly modalDocAberto = signal(false);
  readonly modalPaginaAberto = signal(false);
  readonly modalSetorAberto = signal(false);

  readonly catForm = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    descricao: [''],
    icone: [ICONE_PADRAO],
    parent_id: ['' as string | number],
    ordem: [0],
    ativo: [true],
  });

  readonly docForm = this.fb.nonNullable.group({
    titulo: ['', Validators.required],
    descricao: [''],
    setor_id: ['' as string | number, Validators.required],
    destaque: [false],
  });

  readonly visibilidadesDoc = signal<VisibilidadeEntidade[]>([]);
  readonly visibilidadesDocInput = signal<VisibilidadeEntidadeInput[]>([]);

  readonly paginaForm = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    slug: [''],
    descricao: [''],
    logo_url: [''],
    ordem: [0],
    ativo: [true],
    exibir_menu_treinamento: [false],
  });

  readonly setorForm = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    slug: [''],
    cor: ['#1d54e6'],
    ordem: [0],
    ativo: [true],
  });

  selectedFile: File | null = null;
  selectedThumbFile: File | null = null;
  editandoDocMeta: { extensao: string; nome: string; tamanho: number } | null = null;

  readonly removerThumb = signal(false);
  readonly thumbCarregando = signal(false);
  private readonly thumbObjectUrl = signal<string | null>(null);
  private readonly editandoThumbObjectUrl = signal<string | null>(null);

  readonly thumbPreviewUrl = computed(() => {
    if (this.removerThumb()) return null;
    return this.thumbObjectUrl() ?? this.editandoThumbObjectUrl();
  });

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
    this.abaAtiva.set(this.abaInicial());
    if (this.mostrarAbaDocumentos()) {
      this.carregarPaginas();
      this.carregarSetores();
    }
  }

  mostrarAbaDocumentos(): boolean {
    return this.auth.hasModulo('documentos');
  }

  mostrarAbaTreinamentos(): boolean {
    return this.auth.hasModulo('treinamentos');
  }

  selecionarAba(aba: AdminTab): void {
    if (!this.abaPermitida(aba)) return;
    this.abaAtiva.set(aba);
  }

  private abaInicial(): AdminTab {
    const qp = this.route.snapshot.queryParamMap.get('aba');
    if (qp === 'treinamentos' && this.mostrarAbaTreinamentos()) {
      return 'treinamentos';
    }
    if (this.mostrarAbaDocumentos()) {
      return 'categorias';
    }
    if (this.mostrarAbaTreinamentos()) {
      return 'treinamentos';
    }
    return 'categorias';
  }

  private abaPermitida(aba: AdminTab): boolean {
    switch (aba) {
      case 'paginas':
      case 'setores':
      case 'categorias':
        return this.mostrarAbaDocumentos();
      case 'treinamentos':
        return this.mostrarAbaTreinamentos();
      default:
        return false;
    }
  }

  carregarPaginas(): void {
    this.documentosService.listarPaginasAdmin().subscribe({
      next: (items) => {
        this.paginas.set(items);
        if (!this.paginaSelecionadaId() && items.length) {
          this.selecionarPaginaAdmin(items[0].id);
        } else if (this.paginaSelecionadaId()) {
          this.carregarCategorias();
        }
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar páginas.'),
    });
  }

  carregarSetores(): void {
    this.documentosService.listarSetoresAdmin().subscribe({
      next: (items) => this.setores.set(items),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar setores.'),
    });
  }

  selecionarPaginaAdmin(id: number): void {
    this.paginaSelecionadaId.set(id);
    this.categoriaSelecionada.set(null);
    this.documentos.set([]);
    this.carregarCategorias();
  }

  carregarCategorias(): void {
    const paginaId = this.paginaSelecionadaId();
    if (!paginaId) return;
    this.documentosService.listarCategoriasAdmin(paginaId).subscribe({
      next: (tree) => this.categorias.set(tree),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar categorias.'),
    });
  }

  carregarDocumentos(cat: CategoriaDocumento): void {
    this.categoriaSelecionada.set(cat);
    const pag = this.paginaSelecionada();
    if (!pag) return;
    this.documentosService.listarDocumentos(cat.slug, null, pag.slug).subscribe({
      next: (docs) => this.documentos.set(docs),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar documentos.'),
    });
  }

  paginaSelecionada(): DocumentoPagina | null {
    const id = this.paginaSelecionadaId();
    return this.paginas().find((p) => p.id === id) ?? null;
  }

  paisDisponiveis(): PaiOption[] {
    const editId = this.editandoCatId();
    const exclude = new Set<number>();
    if (editId != null) {
      exclude.add(editId);
      this.collectDescendants(editId, this.categorias(), exclude);
    }
    return this.flattenTreeOptions(this.categorias()).filter((n) => !exclude.has(n.id));
  }

  onNodeAction(event: DocAdminNodeAction): void {
    switch (event.type) {
      case 'select':
        this.carregarDocumentos(event.item);
        break;
      case 'edit':
        this.editarCategoria(event.item);
        break;
      case 'remove':
        this.excluirCategoria(event.item);
        break;
    }
  }

  novaPagina(): void {
    this.editandoPaginaId.set(null);
    this.paginaForm.reset({
      nome: '',
      slug: '',
      descricao: '',
      logo_url: '',
      ordem: 0,
      ativo: true,
      exibir_menu_treinamento: false,
    });
    this.modalPaginaAberto.set(true);
  }

  editarPagina(item: DocumentoPagina): void {
    this.editandoPaginaId.set(item.id);
    this.paginaForm.patchValue({
      nome: item.nome,
      slug: item.slug,
      descricao: item.descricao || '',
      logo_url: item.logo_url || '',
      ordem: item.ordem ?? 0,
      ativo: item.ativo !== false,
      exibir_menu_treinamento: item.exibir_menu_treinamento === true,
    });
    this.modalPaginaAberto.set(true);
  }

  fecharModalPagina(): void {
    this.modalPaginaAberto.set(false);
    this.editandoPaginaId.set(null);
  }

  salvarPagina(): void {
    if (this.paginaForm.invalid) return;
    this.salvando.set(true);
    const raw = this.paginaForm.getRawValue();
    const payload = {
      nome: raw.nome,
      slug: raw.slug || undefined,
      descricao: raw.descricao || null,
      logo_url: raw.logo_url || null,
      ordem: Number(raw.ordem),
      ativo: raw.ativo,
      exibir_menu_treinamento: raw.exibir_menu_treinamento,
    };
    const editId = this.editandoPaginaId();
    const req = editId
      ? this.documentosService.atualizarPagina(editId, payload)
      : this.documentosService.criarPagina(payload);
    req.subscribe({
      next: () => {
        this.mensagem.set(editId ? 'Página atualizada.' : 'Página criada.');
        this.salvando.set(false);
        this.modalPaginaAberto.set(false);
        this.carregarPaginas();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar página.');
        this.salvando.set(false);
      },
    });
  }

  async excluirPagina(item: DocumentoPagina): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Remover a entidade "${item.nome}" e todas as categorias/documentos?`,
    });
    if (!ok) return;
    this.documentosService.removerPagina(item.id).subscribe({
      next: () => {
        this.mensagem.set('Página removida.');
        if (this.paginaSelecionadaId() === item.id) {
          this.paginaSelecionadaId.set(null);
        }
        this.carregarPaginas();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao remover página.'),
    });
  }

  novoSetor(): void {
    this.editandoSetorId.set(null);
    this.setorForm.reset({ nome: '', slug: '', cor: '#1d54e6', ordem: 0, ativo: true });
    this.modalSetorAberto.set(true);
  }

  editarSetor(item: DocumentoSetor): void {
    this.editandoSetorId.set(item.id);
    this.setorForm.patchValue({
      nome: item.nome,
      slug: item.slug,
      cor: item.cor || '#1d54e6',
      ordem: item.ordem ?? 0,
      ativo: item.ativo !== false,
    });
    this.modalSetorAberto.set(true);
  }

  fecharModalSetor(): void {
    this.modalSetorAberto.set(false);
    this.editandoSetorId.set(null);
  }

  salvarSetor(): void {
    if (this.setorForm.invalid) return;
    this.salvando.set(true);
    const raw = this.setorForm.getRawValue();
    const payload = {
      nome: raw.nome,
      slug: raw.slug || undefined,
      cor: raw.cor || null,
      ordem: Number(raw.ordem),
      ativo: raw.ativo,
    };
    const editId = this.editandoSetorId();
    const req = editId
      ? this.documentosService.atualizarSetor(editId, payload)
      : this.documentosService.criarSetor(payload);
    req.subscribe({
      next: () => {
        this.mensagem.set(editId ? 'Setor atualizado.' : 'Setor criado.');
        this.salvando.set(false);
        this.modalSetorAberto.set(false);
        this.carregarSetores();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar setor.');
        this.salvando.set(false);
      },
    });
  }

  async excluirSetor(item: DocumentoSetor): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Remover o setor "${item.nome}"?`,
    });
    if (!ok) return;
    this.documentosService.removerSetor(item.id).subscribe({
      next: () => {
        this.mensagem.set('Setor removido.');
        this.carregarSetores();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao remover setor.'),
    });
  }

  novaCategoria(): void {
    this.cancelarCategoria();
    this.modalCatAberto.set(true);
  }

  editarCategoria(item: CategoriaDocumento): void {
    this.editandoCatId.set(item.id);
    this.catForm.patchValue({
      nome: item.nome,
      descricao: item.descricao || '',
      icone: this.iconeService.normalizarParaLeitura(item.icone),
      parent_id: item.parent_id ?? '',
      ordem: item.ordem ?? 0,
      ativo: item.ativo !== false,
    });
    this.modalCatAberto.set(true);
  }

  fecharModalCat(): void {
    this.modalCatAberto.set(false);
    this.cancelarCategoria();
  }

  cancelarCategoria(): void {
    this.editandoCatId.set(null);
    this.catForm.reset({
      nome: '',
      descricao: '',
      icone: ICONE_PADRAO,
      parent_id: '',
      ordem: 0,
      ativo: true,
    });
  }

  iconeSelecionado(): string {
    return this.catForm.controls.icone.value;
  }

  iconeHeaderCat(): string | null {
    const val = this.catForm.controls.icone.value.trim();
    return val || null;
  }

  temIconeCat(): boolean {
    return !!this.catForm.controls.icone.value.trim();
  }

  abrirModalIcone(): void {
    const atual = this.catForm.controls.icone.value.trim();
    this.iconTemp.set(
      atual ? this.iconeService.normalizarParaLeitura(atual) : ICONE_PADRAO
    );
    this.modalIconeAberto.set(true);
  }

  fecharModalIcone(): void {
    this.modalIconeAberto.set(false);
  }

  confirmarIcone(): void {
    this.catForm.patchValue({
      icone: this.iconeService.normalizarParaSalvar(this.iconTemp()) ?? '',
    });
    this.fecharModalIcone();
  }

  selecionarIconTemp(value: string): void {
    this.iconTemp.set(value);
  }

  limparIconeCat(): void {
    this.catForm.patchValue({ icone: '' });
  }

  tituloModalCat(): string {
    return this.editandoCatId() ? 'Editar categoria' : 'Nova categoria';
  }

  salvarCategoria(): void {
    if (this.catForm.invalid) return;
    const paginaId = this.paginaSelecionadaId();
    if (!paginaId) {
      this.erro.set('Selecione uma entidade antes de criar categorias.');
      return;
    }
    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');
    const raw = this.catForm.getRawValue();
    const payload = {
      nome: raw.nome,
      descricao: raw.descricao || null,
      icone: this.iconeService.normalizarParaSalvar(raw.icone),
      parent_id: raw.parent_id === '' ? null : Number(raw.parent_id),
      pagina_id: paginaId,
      ordem: Number(raw.ordem),
      ativo: raw.ativo,
    };
    const editId = this.editandoCatId();
    const req = editId
      ? this.documentosService.atualizarCategoria(editId, payload)
      : this.documentosService.criarCategoria(payload);

    req.subscribe({
      next: () => {
        this.mensagem.set(editId ? 'Categoria atualizada.' : 'Categoria criada.');
        this.salvando.set(false);
        this.modalCatAberto.set(false);
        this.cancelarCategoria();
        this.carregarCategorias();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar categoria.');
        this.salvando.set(false);
      },
    });
  }

  async excluirCategoria(item: CategoriaDocumento): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Remover a categoria "${item.nome}" e todos os documentos/subcategorias?`,
    });
    if (!ok) return;
    this.documentosService.removerCategoria(item.id).subscribe({
      next: () => {
        this.mensagem.set('Categoria removida.');
        if (this.categoriaSelecionada()?.id === item.id) {
          this.categoriaSelecionada.set(null);
          this.documentos.set([]);
        }
        this.carregarCategorias();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao remover categoria.'),
    });
  }

  onFileSelected(file: File): void {
    if (!this.validarArquivoSelecionado(file)) return;
    this.selectedFile = file;
    if (!this.docForm.controls.titulo.value) {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      this.docForm.patchValue({ titulo: baseName });
    }
    this.abrirModalDoc(false);
  }

  onArquivoSubstitutoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!this.validarArquivoSelecionado(file)) return;
    this.selectedFile = file;
  }

  limparArquivoSubstituto(): void {
    this.selectedFile = null;
  }

  private validarArquivoSelecionado(file: File): boolean {
    this.erro.set('');
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      this.erro.set('Tipo de arquivo não permitido.');
      return false;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      this.erro.set(`Arquivo excede o limite de ${MAX_UPLOAD_MB} MB.`);
      return false;
    }
    return true;
  }

  abrirModalDoc(reset = true): void {
    if (reset && !this.editandoDocId()) {
      this.cancelarDocumento();
    }
    if (!this.editandoDocId() && !this.visibilidadesDoc().length) {
      this.visibilidadesDoc.set(this.visibilidadesIniciais());
    }
    this.modalDocAberto.set(true);
  }

  fecharModalDoc(): void {
    this.modalDocAberto.set(false);
    this.cancelarDocumento();
  }

  editarDocumento(doc: Documento): void {
    this.editandoDocId.set(doc.id);
    this.docForm.patchValue({
      titulo: doc.titulo,
      descricao: doc.descricao || '',
      setor_id: doc.setor_id ?? '',
      destaque: !!doc.destaque,
    });
    this.visibilidadesDoc.set(doc.visibilidades ?? this.visibilidadesIniciais());
    this.visibilidadesDocInput.set(
      (doc.visibilidades ?? [])
        .filter((v) => v.categoria_id != null)
        .map((v) => ({
          pagina_id: Number(v.pagina_id),
          categoria_id: Number(v.categoria_id),
        }))
    );
    this.selectedFile = null;
    this.revokeThumbObjectUrl();
    this.revokeEditandoThumbUrl();
    this.selectedThumbFile = null;
    this.removerThumb.set(false);
    this.thumbCarregando.set(false);
    if (doc.tem_thumb || doc.thumbnail_url) {
      this.thumbCarregando.set(true);
      this.documentosService.carregarThumbnailPorId(doc.id).subscribe({
        next: (blob) => {
          this.thumbCarregando.set(false);
          if (!blob) {
            this.editandoThumbObjectUrl.set(null);
            return;
          }
          this.editandoThumbObjectUrl.set(URL.createObjectURL(blob));
        },
        error: () => {
          this.thumbCarregando.set(false);
          this.editandoThumbObjectUrl.set(null);
        },
      });
    }
    this.editandoDocMeta = {
      extensao: doc.extensao.toUpperCase(),
      nome: doc.nome_original,
      tamanho: doc.tamanho_bytes,
    };
    this.modalDocAberto.set(true);
  }

  onThumbSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.revokeThumbObjectUrl();
    this.revokeEditandoThumbUrl();
    this.selectedThumbFile = file;
    this.removerThumb.set(false);
    if (file) {
      this.thumbObjectUrl.set(URL.createObjectURL(file));
    }
  }

  marcarRemoverThumb(): void {
    this.removerThumb.set(true);
    this.selectedThumbFile = null;
    this.revokeThumbObjectUrl();
    this.revokeEditandoThumbUrl();
  }

  private revokeThumbObjectUrl(): void {
    const url = this.thumbObjectUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.thumbObjectUrl.set(null);
    }
  }

  private revokeEditandoThumbUrl(): void {
    const url = this.editandoThumbObjectUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.editandoThumbObjectUrl.set(null);
    }
  }

  onVisibilidadesDocChange(v: VisibilidadeEntidadeInput[]): void {
    this.visibilidadesDocInput.set(v);
    const prev = new Map(this.visibilidadesDoc().map((item) => [Number(item.pagina_id), item]));
    this.visibilidadesDoc.set(
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

  cancelarDocumento(): void {
    this.editandoDocId.set(null);
    const primeiroSetor = this.setores().find((s) => s.ativo)?.id ?? '';
    this.docForm.reset({ titulo: '', descricao: '', setor_id: primeiroSetor, destaque: false });
    this.visibilidadesDoc.set([]);
    this.visibilidadesDocInput.set([]);
    this.selectedFile = null;
    this.revokeThumbObjectUrl();
    this.revokeEditandoThumbUrl();
    this.selectedThumbFile = null;
    this.removerThumb.set(false);
    this.thumbCarregando.set(false);
    this.editandoDocMeta = null;
    this.uploadProgress.set(0);
    this.uploadando.set(false);
  }

  visibilidadesIniciais(): VisibilidadeEntidade[] {
    const pag = this.paginaSelecionada();
    const cat = this.categoriaSelecionada();
    if (!pag || !cat) return [];
    return [
      {
        pagina_id: pag.id,
        pagina_nome: pag.nome,
        pagina_slug: pag.slug,
        categoria_id: cat.id,
        categoria_nome: cat.nome,
        categoria_slug: cat.slug,
      },
    ];
  }

  entidadeChips(doc: Documento): { nome: string; cor: string; bg: string }[] {
    const vis = doc.visibilidades ?? [];
    const items = vis.length
      ? vis.map((v) => ({
          nome: v.pagina_nome ?? v.pagina_slug ?? `Entidade ${v.pagina_id}`,
          slug: v.pagina_slug ?? this.paginas().find((p) => p.id === v.pagina_id)?.slug ?? '',
        }))
      : (() => {
          const pag = this.paginaSelecionada();
          return pag ? [{ nome: pag.nome, slug: pag.slug }] : [];
        })();

    return items.map((item) => {
      const { cor, bg } = this.corEntidadeChip(item.slug);
      return { nome: item.nome, cor, bg };
    });
  }

  private corEntidadeChip(slug: string): { cor: string; bg: string } {
    const s = slug.toLowerCase();
    if (s.includes('nubank')) return { cor: '#8D0DE3', bg: 'rgba(141,13,227,.1)' };
    if (s.includes('base') || s.includes('cowork')) return { cor: '#0d9488', bg: 'rgba(13,148,136,.1)' };
    if (s.includes('novo') || s.includes('anh')) return { cor: '#c2410c', bg: 'rgba(194,65,12,.1)' };
    return { cor: '#1d54e6', bg: 'rgba(29,84,230,.1)' };
  }

  entidadesBadges(doc: Documento): string[] {
    const vis = doc.visibilidades ?? [];
    if (vis.length) {
      return vis.map((v) => v.pagina_nome ?? v.pagina_slug ?? `Entidade ${v.pagina_id}`);
    }
    const pag = this.paginaSelecionada();
    return pag ? [pag.nome] : [];
  }

  salvarDocumento(): void {
    if (this.docForm.invalid) return;
    const vis = this.visibilidadesDocInput();
    if (!vis.length) {
      this.erro.set('Marque ao menos uma entidade com categoria.');
      return;
    }
    const editId = this.editandoDocId();

    if (editId) {
      this.salvando.set(true);
      this.mensagem.set('');
      this.erro.set('');
      const raw = this.docForm.getRawValue();

      if (this.selectedFile || this.selectedThumbFile || this.removerThumb()) {
        const formData = new FormData();
        formData.append('titulo', raw.titulo);
        formData.append('descricao', raw.descricao || '');
        formData.append('setor_id', String(raw.setor_id));
        formData.append('destaque', raw.destaque ? 'true' : 'false');
        formData.append('visibilidades', JSON.stringify(vis));
        if (this.selectedFile) {
          formData.append('arquivo', this.selectedFile);
        }
        if (this.selectedThumbFile) {
          formData.append('thumb', this.selectedThumbFile);
        }
        if (this.removerThumb()) {
          formData.append('remover_thumb', 'true');
        }

        if (this.selectedFile) {
          this.uploadando.set(true);
          this.uploadProgress.set(0);
        }

        this.documentosService.atualizarDocumentoFormData(editId, formData).subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress && event.total) {
              this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
            } else if (event.type === HttpEventType.Response) {
              this.mensagem.set('Documento atualizado.');
              this.salvando.set(false);
              this.uploadando.set(false);
              this.uploadProgress.set(0);
              this.modalDocAberto.set(false);
              this.cancelarDocumento();
              const cat = this.categoriaSelecionada();
              if (cat) this.carregarDocumentos(cat);
            }
          },
          error: (err: HttpErrorResponse) => {
            this.erro.set(err.error?.mensagem || 'Erro ao atualizar documento.');
            this.salvando.set(false);
            this.uploadando.set(false);
            this.uploadProgress.set(0);
          },
        });
        return;
      }

      this.documentosService
        .atualizarDocumento(editId, {
          titulo: raw.titulo,
          descricao: raw.descricao || null,
          setor_id: Number(raw.setor_id),
          destaque: raw.destaque,
          visibilidades: vis,
        })
        .subscribe({
          next: () => {
            this.mensagem.set('Documento atualizado.');
            this.salvando.set(false);
            this.modalDocAberto.set(false);
            this.cancelarDocumento();
            const cat = this.categoriaSelecionada();
            if (cat) this.carregarDocumentos(cat);
          },
          error: (err: HttpErrorResponse) => {
            this.erro.set(err.error?.mensagem || 'Erro ao atualizar documento.');
            this.salvando.set(false);
          },
        });
      return;
    }

    if (!this.selectedFile) {
      this.erro.set('Selecione um arquivo para upload.');
      return;
    }

    const raw = this.docForm.getRawValue();
    const formData = new FormData();
    formData.append('arquivo', this.selectedFile);
    formData.append('titulo', raw.titulo);
    formData.append('descricao', raw.descricao || '');
    formData.append('setor_id', String(raw.setor_id));
    formData.append('destaque', raw.destaque ? 'true' : 'false');
    formData.append('visibilidades', JSON.stringify(vis));
    if (this.selectedThumbFile) {
      formData.append('thumb', this.selectedThumbFile);
    }

    this.uploadando.set(true);
    this.uploadProgress.set(0);
    this.erro.set('');
    this.mensagem.set('');

    this.documentosService.uploadDocumento(formData).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
        } else if (event.type === HttpEventType.Response) {
          this.mensagem.set('Documento enviado com sucesso.');
          this.uploadando.set(false);
          this.uploadProgress.set(0);
          this.modalDocAberto.set(false);
          this.cancelarDocumento();
          const cat = this.categoriaSelecionada();
          if (cat) this.carregarDocumentos(cat);
          this.carregarCategorias();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro no upload.');
        this.uploadando.set(false);
        this.uploadProgress.set(0);
      },
    });
  }

  async excluirDocumento(doc: Documento): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Remover o documento "${doc.titulo}"?`,
    });
    if (!ok) return;
    this.documentosService.removerDocumento(doc.id).subscribe({
      next: () => {
        this.mensagem.set('Documento removido.');
        const cat = this.categoriaSelecionada();
        if (cat) this.carregarDocumentos(cat);
        this.carregarCategorias();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao remover documento.'),
    });
  }

  formatarTamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  formatarData(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d
      .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
      .replace(/\./g, '')
      .replace(/ de /g, ' ');
  }

  formatarMetaDoc(doc: Documento): string {
    const partes = [
      doc.extensao.toUpperCase(),
      doc.setor?.nome,
      this.formatarTamanho(doc.tamanho_bytes),
      this.formatarData(doc.criado_em),
    ].filter(Boolean);
    return partes.join(' · ');
  }

  fileIconClass(ext: string): string {
    const e = ext.toLowerCase();
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'zip'].includes(e)) {
      return e;
    }
    return 'default';
  }

  tituloModalDoc(): string {
    return this.editandoDocId() ? 'Editar documento' : 'Upload de documento';
  }

  labelSalvarDoc(): string {
    if (this.uploadando()) return 'Enviando...';
    if (this.editandoDocId()) return 'Salvar alterações';
    return 'Enviar documento';
  }

  extensaoModalDoc(): string | null {
    if (this.selectedFile) {
      const ext = this.selectedFile.name.split('.').pop()?.toUpperCase();
      return ext || 'ARQ';
    }
    if (this.editandoDocMeta) return this.editandoDocMeta.extensao;
    return null;
  }

  metaArquivoModalDoc(): string {
    if (this.selectedFile) {
      return `${this.selectedFile.name} · ${this.formatarTamanho(this.selectedFile.size)}`;
    }
    if (this.editandoDocMeta) {
      return `${this.editandoDocMeta.nome} · ${this.formatarTamanho(this.editandoDocMeta.tamanho)}`;
    }
    return '';
  }

  previewTitulo(): string {
    return this.docForm.controls.titulo.value?.trim() || 'Sem título';
  }

  previewDescricao(): string {
    return this.docForm.controls.descricao.value?.trim() || '';
  }

  previewCoverWords(): string[] {
    const words = this.previewTitulo().split(/\s+/).filter(Boolean);
    return words.slice(0, 2);
  }

  previewSetor(): DocumentoSetor | null {
    const raw = this.docForm.controls.setor_id.value;
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

  categoriasFlatSelect(): PaiOption[] {
    return this.flattenTreeOptions(this.categorias());
  }

  setoresAtivos(): DocumentoSetor[] {
    return this.setores().filter((s) => s.ativo !== false);
  }

  private flattenTreeOptions(items: CategoriaDocumento[], depth = 0): PaiOption[] {
    const out: PaiOption[] = [];
    for (const item of items) {
      out.push({ id: item.id, label: item.nome, depth });
      if (item.children?.length) {
        out.push(...this.flattenTreeOptions(item.children, depth + 1));
      }
    }
    return out;
  }

  private collectDescendants(id: number, items: CategoriaDocumento[], exclude: Set<number>): void {
    for (const item of items) {
      if (item.parent_id === id) {
        exclude.add(item.id);
        this.collectDescendants(item.id, items, exclude);
      }
      if (item.children?.length) {
        this.collectDescendants(id, item.children, exclude);
      }
    }
  }
}
