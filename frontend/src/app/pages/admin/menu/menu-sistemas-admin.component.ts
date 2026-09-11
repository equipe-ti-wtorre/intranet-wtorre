import { Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, forkJoin } from 'rxjs';
import { MenuService } from '../../../services/menu.service';
import { DocumentosService } from '../../../services/documentos.service';
import { PaginasService } from '../../../services/paginas.service';
import { AuthService } from '../../../services/auth.service';
import { AlertasService } from '../../../services/alertas.service';
import { HomeSistemasConfig, HOME_SISTEMAS_DEFAULTS } from '../../../models/home-sistemas.model';
import { PaginaInterna, buildPaginasInternasLista, isPaginaInternaConhecida } from '../../../data/paginas-internas';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';
import { DocCatIconePickerComponent } from '../../../shared/documentos/doc-cat-icone-picker.component';
import { DocCatIconeService } from '../../../shared/documentos/doc-cat-icone.service';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { ICONE_PADRAO } from '../../../models/documento.model';
import {
  TipoDestino,
  buildUrlFromDestino,
  destinoFromUrl,
  paginaInternaOpcionalValidator,
  urlExternaOpcionalValidator,
} from './menu-destino.util';

const URL_EXTERNA_REGEX = /^https?:\/\/.+/i;

function todosPaginaInternaValidator(): ValidatorFn {
  return (ctrl: AbstractControl) => {
    const parent = ctrl.parent;
    if (!parent) return null;
    if (parent.get('tipo_destino_todos')?.value !== 'interna') return null;

    const path = String(ctrl.value ?? '').trim();
    if (!path) return null;
    if (!isPaginaInternaConhecida(path)) return { paginaDesconhecida: true };
    return null;
  };
}

function todosUrlExternaValidator(): ValidatorFn {
  return (ctrl: AbstractControl) => {
    const parent = ctrl.parent;
    if (!parent) return null;
    if (parent.get('tipo_destino_todos')?.value !== 'externa') return null;

    const url = String(ctrl.value ?? '').trim();
    if (!url) return null;
    if (!URL_EXTERNA_REGEX.test(url)) return { urlInvalida: true };
    return null;
  };
}

@Component({
  selector: 'app-menu-sistemas-admin',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DocCatIconeComponent,
    DocCatIconePickerComponent,
    AdminModalComponent,
  ],
  templateUrl: './menu-sistemas-admin.component.html',
  styleUrl: './menu-sistemas-admin.component.scss',
})
export class MenuSistemasAdminComponent implements OnInit, OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly documentosService = inject(DocumentosService);
  private readonly paginasService = inject(PaginasService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);
  private readonly iconeService = inject(DocCatIconeService);

  readonly paginasInternas = signal<PaginaInterna[]>(buildPaginasInternasLista());
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly carregando = signal(true);
  readonly modalIconeAberto = signal(false);
  readonly itemIconeIndex = signal<number | null>(null);
  readonly iconTemp = signal(ICONE_PADRAO);

  private tipoDestinoTodosSub?: Subscription;
  private itemSubs: Subscription[] = [];

  readonly form = this.fb.nonNullable.group({
    tag: ['', Validators.required],
    titulo: ['', Validators.required],
    tipo_destino_todos: ['agrupador' as TipoDestino],
    pagina_interna_todos: ['', todosPaginaInternaValidator()],
    url_externa_todos: ['', todosUrlExternaValidator()],
    linkTodosNovaAba: [false],
    itens: this.fb.array<FormGroup>([]),
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
    this.tipoDestinoTodosSub = this.form.controls.tipo_destino_todos.valueChanges.subscribe(() => {
      this.form.controls.pagina_interna_todos.updateValueAndValidity({ emitEvent: false });
      this.form.controls.url_externa_todos.updateValueAndValidity({ emitEvent: false });
    });

    if (!this.auth.estaLogado()) {
      this.erro.set('Sessão não encontrada. Faça login novamente.');
      this.carregando.set(false);
      return;
    }

    this.carregarPaginasInternas();
    this.auth.carregarPerfil().subscribe({
      next: () => this.carregar(),
      error: () => {
        if (this.auth.estaLogado()) this.carregar();
        else {
          this.erro.set('Sessão expirada. Faça login novamente.');
          this.carregando.set(false);
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.tipoDestinoTodosSub?.unsubscribe();
    this.itemSubs.forEach((s) => s.unsubscribe());
  }

  itensArray(): FormArray<FormGroup> {
    return this.form.controls.itens;
  }

  adicionarItem(): void {
    const group = this.criarItemGroup();
    this.itensArray().push(group);
    this.vincularTipoDestinoItem(group);
  }

  removerItem(index: number): void {
    const sub = this.itemSubs[index];
    sub?.unsubscribe();
    this.itemSubs.splice(index, 1);
    this.itensArray().removeAt(index);
  }

  moverItem(index: number, dir: -1 | 1): void {
    const target = index + dir;
    const arr = this.itensArray();
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(index);
    const sub = this.itemSubs[index];
    arr.removeAt(index);
    arr.insert(target, ctrl);
    if (sub) {
      this.itemSubs.splice(index, 1);
      this.itemSubs.splice(target, 0, sub);
    }
  }

  abrirModalIcone(index: number): void {
    const icon = this.itensArray().at(index).get('icon')?.value ?? ICONE_PADRAO;
    this.itemIconeIndex.set(index);
    this.iconTemp.set(this.iconeService.normalizarParaLeitura(icon));
    this.modalIconeAberto.set(true);
  }

  fecharModalIcone(): void {
    this.modalIconeAberto.set(false);
    this.itemIconeIndex.set(null);
  }

  confirmarIcone(): void {
    const index = this.itemIconeIndex();
    if (index === null) return;
    this.itensArray().at(index).patchValue({
      icon: this.iconeService.normalizarParaSalvar(this.iconTemp()) ?? ICONE_PADRAO,
    });
    this.fecharModalIcone();
  }

  selecionarIconTemp(value: string): void {
    this.iconTemp.set(value);
  }

  mostrarNovaAbaItem(group: FormGroup): boolean {
    return group.get('tipo_destino')?.value === 'interna';
  }

  salvar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.erro.set(this.coletarErrosValidacao());
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const raw = this.form.getRawValue();
    const config: HomeSistemasConfig = {
      tag: raw.tag.trim(),
      titulo: raw.titulo.trim(),
      linkTodos: buildUrlFromDestino(
        raw.tipo_destino_todos,
        raw.pagina_interna_todos,
        raw.url_externa_todos
      ),
      linkTodosNovaAba: raw.linkTodosNovaAba,
      itens: raw.itens.map((item, index) => ({
        id: item['id'].trim() || this.gerarId(),
        nome: item['nome'].trim(),
        subtitulo: item['subtitulo'].trim(),
        icon: this.iconeService.normalizarParaSalvar(item['icon']) ?? ICONE_PADRAO,
        url: buildUrlFromDestino(
          item['tipo_destino'],
          item['pagina_interna'],
          item['url_externa']
        ),
        abrirNovaAba: item['abrir_nova_aba'],
        ordem: index + 1,
        ativo: item['ativo'],
      })),
    };

    this.menuService.salvarHomeSistemas(config).subscribe({
      next: (salvo) => {
        this.patchForm(salvo);
        this.mensagem.set('Sistemas Corporativos salvos.');
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else if (err.status === 403) {
          this.erro.set('Sem permissão para editar os sistemas.');
        } else {
          this.erro.set(err.error?.mensagem || 'Erro ao salvar.');
        }
        this.salvando.set(false);
      },
    });
  }

  campoInvalido(ctrl: AbstractControl | null): boolean {
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  erroCampo(ctrl: AbstractControl | null): string {
    if (!ctrl?.errors) return '';
    if (ctrl.errors['required']) return 'Campo obrigatório.';
    if (ctrl.errors['paginaDesconhecida']) return 'Página interna não reconhecida.';
    if (ctrl.errors['urlInvalida']) return 'URL deve começar com http:// ou https://.';
    return 'Valor inválido.';
  }

  private carregarPaginasInternas(): void {
    forkJoin({
      paginasDocumentos: this.documentosService.listarPaginas(),
      paginas: this.paginasService.listarPublicadas(),
    }).subscribe({
      next: ({ paginasDocumentos, paginas }) =>
        this.paginasInternas.set(buildPaginasInternasLista(paginasDocumentos, paginas)),
      error: () => this.paginasInternas.set(buildPaginasInternasLista()),
    });
  }

  private carregar(): void {
    this.menuService.getHomeSistemas().subscribe({
      next: (config) => {
        this.patchForm(config);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else {
          this.erro.set(err.error?.mensagem || 'Erro ao carregar sistemas.');
        }
        this.patchForm(HOME_SISTEMAS_DEFAULTS);
        this.carregando.set(false);
      },
    });
  }

  private patchForm(config: HomeSistemasConfig): void {
    this.itemSubs.forEach((s) => s.unsubscribe());
    this.itemSubs = [];

    const todosDest = destinoFromUrl(config.linkTodos);
    this.form.patchValue({
      tag: config.tag,
      titulo: config.titulo,
      tipo_destino_todos: todosDest.tipo,
      pagina_interna_todos: todosDest.paginaInterna,
      url_externa_todos: todosDest.urlExterna,
      linkTodosNovaAba: config.linkTodosNovaAba,
    });

    this.itensArray().clear();
    for (const item of [...config.itens].sort((a, b) => a.ordem - b.ordem)) {
      const group = this.criarItemGroup(item);
      this.itensArray().push(group);
      this.vincularTipoDestinoItem(group);
    }
  }

  private criarItemGroup(item?: Partial<HomeSistemasConfig['itens'][0]>): FormGroup {
    const dest = destinoFromUrl(item?.url);
    return this.fb.nonNullable.group({
      id: [item?.id ?? this.gerarId(), Validators.required],
      nome: [item?.nome ?? '', Validators.required],
      subtitulo: [item?.subtitulo ?? '', Validators.required],
      icon: [this.iconeService.normalizarParaLeitura(item?.icon ?? 'lucide:user')],
      tipo_destino: [dest.tipo],
      pagina_interna: [dest.paginaInterna, paginaInternaOpcionalValidator()],
      url_externa: [dest.urlExterna, urlExternaOpcionalValidator()],
      abrir_nova_aba: [item?.abrirNovaAba ?? false],
      ativo: [item?.ativo !== false],
    });
  }

  private vincularTipoDestinoItem(group: FormGroup): void {
    const sub = group.get('tipo_destino')!.valueChanges.subscribe(() => {
      group.get('pagina_interna')?.updateValueAndValidity({ emitEvent: false });
      group.get('url_externa')?.updateValueAndValidity({ emitEvent: false });
    });
    this.itemSubs.push(sub);
  }

  private coletarErrosValidacao(): string {
    const erros: string[] = [];
    if (this.form.controls.tag.invalid) erros.push('tag');
    if (this.form.controls.titulo.invalid) erros.push('título');
    if (this.form.controls.pagina_interna_todos.invalid) erros.push('link Todos (página interna)');
    if (this.form.controls.url_externa_todos.invalid) erros.push('link Todos (URL externa)');

    this.itensArray().controls.forEach((group, i) => {
      const parts: string[] = [];
      if (group.get('nome')?.invalid) parts.push('nome');
      if (group.get('subtitulo')?.invalid) parts.push('subtítulo');
      if (group.get('pagina_interna')?.invalid) parts.push('página interna');
      if (group.get('url_externa')?.invalid) parts.push('URL externa');
      if (parts.length) erros.push(`Item ${i + 1}: ${parts.join(', ')}`);
    });

    return erros.length
      ? `Preencha os campos obrigatórios: ${erros.join('; ')}.`
      : 'Verifique os campos do formulário.';
  }

  private gerarId(): string {
    return `sistema-${crypto.randomUUID().slice(0, 8)}`;
  }
}
