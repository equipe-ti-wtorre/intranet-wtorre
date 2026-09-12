import { Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, forkJoin } from 'rxjs';
import { MenuService } from '../../../services/menu.service';
import { DocumentosService } from '../../../services/documentos.service';
import { PaginasService } from '../../../services/paginas.service';
import { MenuItem, MenuReorderItem, MENU_MAX_DEPTH } from '../../../models/menu.model';
import {
  MenuAdminNodeAction,
  MenuAdminNodeComponent,
} from './menu-admin-node.component';
import { MenuTopbarAdminComponent } from './menu-topbar-admin.component';
import { MenuLoginAdminComponent } from './menu-login-admin.component';
import { MenuCarrosselAdminComponent } from './menu-carrossel-admin.component';
import { MenuSistemasAdminComponent } from './menu-sistemas-admin.component';
import { MenuHeaderChamadoAdminComponent } from './menu-header-chamado-admin.component';
import { RodapeAdminComponent } from '../rodape/rodape-admin.component';
import { ComunicadosAdminComponent } from '../comunicados/comunicados-admin.component';
import { EventosFontesAdminComponent } from '../eventos-fontes/eventos-fontes-admin.component';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';
import { AuthService } from '../../../services/auth.service';
import { DocCatIconePickerComponent } from '../../../shared/documentos/doc-cat-icone-picker.component';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';
import { DocCatIconeService } from '../../../shared/documentos/doc-cat-icone.service';
import { ICONE_PADRAO } from '../../../models/documento.model';
import { PaginaInterna, buildPaginasInternasLista } from '../../../data/paginas-internas';
import {
  TipoDestino,
  buildUrlFromDestino,
  destinoFromUrl,
  inferirTipoDestino,
  paginaInternaValidator,
  urlExternaValidator,
} from './menu-destino.util';

interface PaiOption {
  id: number;
  label: string;
  depth: number;
}

type MenuAdminAba =
  | 'estrutura'
  | 'topbar'
  | 'login'
  | 'header'
  | 'carrossel'
  | 'sistemas'
  | 'rodape'
  | 'comunicados'
  | 'eventos';

@Component({
  selector: 'app-menu-admin',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MenuAdminNodeComponent,
    AdminModalComponent,
    DocCatIconePickerComponent,
    DocCatIconeComponent,
    MenuTopbarAdminComponent,
    MenuLoginAdminComponent,
    MenuCarrosselAdminComponent,
    MenuSistemasAdminComponent,
    MenuHeaderChamadoAdminComponent,
    RodapeAdminComponent,
    ComunicadosAdminComponent,
    EventosFontesAdminComponent,
  ],
  templateUrl: './menu-admin.component.html',
  styleUrl: './menu-admin.component.scss',
})
export class MenuAdminComponent implements OnInit, OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly documentosService = inject(DocumentosService);
  private readonly paginasService = inject(PaginasService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);
  private readonly iconeService = inject(DocCatIconeService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly paginasInternas = signal<PaginaInterna[]>(buildPaginasInternasLista());
  readonly menuTree = signal<MenuItem[]>([]);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly recolhidos = signal<Set<number>>(new Set());
  readonly modalAberto = signal(false);
  readonly modalIconeAberto = signal(false);
  readonly iconTemp = signal('');
  readonly urlLegadoInterno = signal<string | null>(null);
  readonly abaAtiva = signal<MenuAdminAba>('estrutura');

  readonly form = this.fb.nonNullable.group({
    label: ['', Validators.required],
    tipo_destino: ['interna' as TipoDestino],
    pagina_interna: ['', paginaInternaValidator()],
    url_externa: ['', urlExternaValidator()],
    parent_id: ['' as string | number],
    ordem: [0],
    abrir_nova_aba: [false],
    icone: [''],
    cabecalho: [''],
    ativo: [true],
    visivel_perfil: [''],
  });

  private tipoDestinoSub?: Subscription;

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
    this.tipoDestinoSub = this.form.controls.tipo_destino.valueChanges.subscribe((tipo) =>
      this.onTipoDestinoChange(tipo)
    );
    if (this.mostrarAbaEstrutura()) {
      this.carregarPaginasInternas();
      this.carregar();
    }
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

  ngOnDestroy(): void {
    this.tipoDestinoSub?.unsubscribe();
  }

  carregar(): void {
    this.menuService.listarTodos().subscribe({
      next: (tree) => this.menuTree.set(tree),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar menu.'),
    });
  }

  selecionarAba(aba: MenuAdminAba): void {
    if (!this.abaPermitida(aba)) return;
    this.abaAtiva.set(aba);
  }

  mostrarAbaEstrutura(): boolean {
    return this.auth.hasModulo('menu');
  }

  mostrarAbasMenuHome(): boolean {
    return this.auth.hasModulo('menu');
  }

  mostrarAbaRodape(): boolean {
    return this.auth.hasModulo('rodape');
  }

  mostrarAbaComunicados(): boolean {
    return this.auth.hasModulo('comunicados');
  }

  mostrarAbaEventos(): boolean {
    return this.auth.hasModulo('eventos');
  }

  private abaInicial(): MenuAdminAba {
    const qp = this.route.snapshot.queryParamMap.get('aba');
    if (qp && this.abaPermitida(qp as MenuAdminAba)) {
      return qp as MenuAdminAba;
    }
    if (this.mostrarAbaEstrutura()) return 'estrutura';
    if (this.mostrarAbaRodape()) return 'rodape';
    if (this.mostrarAbaComunicados()) return 'comunicados';
    if (this.mostrarAbaEventos()) return 'eventos';
    return 'estrutura';
  }

  private abaPermitida(aba: MenuAdminAba): boolean {
    switch (aba) {
      case 'estrutura':
      case 'topbar':
      case 'login':
      case 'header':
      case 'carrossel':
      case 'sistemas':
        return this.mostrarAbasMenuHome();
      case 'rodape':
        return this.mostrarAbaRodape();
      case 'comunicados':
        return this.mostrarAbaComunicados();
      case 'eventos':
        return this.mostrarAbaEventos();
      default:
        return false;
    }
  }

  paisDisponiveis(): PaiOption[] {
    const editId = this.editandoId();
    const exclude = new Set<number>();
    if (editId != null) {
      exclude.add(editId);
      this.collectDescendants(editId, this.menuTree(), exclude);
    }
    return this.flattenTreeOptions(this.menuTree()).filter((n) => !exclude.has(n.id));
  }

  isDropdownPai(): boolean {
    const parentId = this.form.controls.parent_id.value;
    return !parentId && this.form.controls.tipo_destino.value === 'agrupador';
  }

  mostrarAbrirNovaAba(): boolean {
    return this.form.controls.tipo_destino.value === 'interna';
  }

  tipoUrl = (url: string | null | undefined): 'externo' | 'interno' | 'placeholder' => {
    const tipo = inferirTipoDestino(url);
    if (tipo === 'interna') return 'interno';
    if (tipo === 'externa') return 'externo';
    return 'placeholder';
  };

  onNodeAction(event: MenuAdminNodeAction): void {
    switch (event.type) {
      case 'edit':
        this.editar(event.item, event.parentId);
        break;
      case 'remove':
        this.excluir(event.item);
        break;
      case 'addChild':
        this.novoSubitem(event.item);
        break;
      case 'toggle':
        this.toggleRecolher(event.item.id);
        break;
    }
  }

  onReordered(): void {
    this.menuTree.set([...this.menuTree()]);
    const payload = this.flattenTree(this.menuTree());
    this.menuService.reordenar(payload).subscribe({
      next: () => {
        this.mensagem.set('Ordem atualizada.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao reordenar.');
        this.carregar();
      },
    });
  }

  toggleRecolher(id: number): void {
    this.recolhidos.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  expandirTudo(): void {
    this.recolhidos.set(new Set());
  }

  recolherTudo(): void {
    const ids = new Set<number>();
    const walk = (items: MenuItem[]) => {
      for (const item of items) {
        if (item.children?.length) {
          ids.add(item.id);
          walk(item.children);
        }
      }
    };
    walk(this.menuTree());
    this.recolhidos.set(ids);
  }

  novoItem(): void {
    this.cancelar();
    this.modalAberto.set(true);
  }

  editar(item: MenuItem, parentId: number | null = null): void {
    this.editandoId.set(item.id);
    const destino = destinoFromUrl(item.url);
    const urlLegado =
      destino.tipo === 'interna' && item.url?.startsWith('/') && !destino.paginaInterna
        ? item.url
        : null;
    this.urlLegadoInterno.set(urlLegado);

    this.form.patchValue({
      label: item.label,
      tipo_destino: destino.tipo,
      pagina_interna: destino.paginaInterna,
      url_externa: destino.urlExterna,
      parent_id: parentId ?? '',
      ordem: item.ordem ?? 0,
      abrir_nova_aba: destino.tipo === 'externa' ? true : item.abrir_nova_aba,
      icone: item.icone ? this.iconeService.normalizarParaLeitura(item.icone) : '',
      cabecalho: item.cabecalho ?? '',
      ativo: item.ativo !== false,
      visivel_perfil: item.visivel_perfil ?? '',
    });
    this.onTipoDestinoChange(destino.tipo);
    this.modalAberto.set(true);
  }

  novoSubitem(pai: MenuItem): void {
    this.cancelar();
    this.form.patchValue({
      parent_id: pai.id,
      ordem: pai.children?.length ?? 0,
      tipo_destino: 'agrupador',
      pagina_interna: '',
      url_externa: '',
      abrir_nova_aba: false,
    });
    this.onTipoDestinoChange('agrupador');
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.cancelar();
  }

  cancelar(): void {
    this.editandoId.set(null);
    this.urlLegadoInterno.set(null);
    this.form.reset({
      tipo_destino: 'interna',
      pagina_interna: '',
      url_externa: '',
      parent_id: '',
      ordem: 0,
      abrir_nova_aba: false,
      ativo: true,
      icone: '',
      cabecalho: '',
      visivel_perfil: '',
    });
    this.onTipoDestinoChange('interna');
  }

  tituloModal(): string {
    return this.editandoId() ? 'Editar item' : 'Novo item';
  }

  subtituloModal(): string {
    return this.editandoId()
      ? 'Altere as propriedades do item selecionado.'
      : 'Configure rótulo, destino e visibilidade do item de navegação.';
  }

  abrirModalIcone(): void {
    const atual = this.form.controls.icone.value.trim();
    this.iconTemp.set(
      atual ? this.iconeService.normalizarParaLeitura(atual) : ICONE_PADRAO
    );
    this.modalIconeAberto.set(true);
  }

  fecharModalIcone(): void {
    this.modalIconeAberto.set(false);
  }

  confirmarIcone(): void {
    this.form.patchValue({
      icone: this.iconeService.normalizarParaSalvar(this.iconTemp()) ?? '',
    });
    this.fecharModalIcone();
  }

  selecionarIconTemp(value: string): void {
    this.iconTemp.set(value);
  }

  iconeSelecionado(): string {
    return this.form.controls.icone.value;
  }

  iconeHeader(): string | null {
    const val = this.form.controls.icone.value.trim();
    return val || null;
  }

  temIcone(): boolean {
    return !!this.form.controls.icone.value.trim();
  }

  limparIcone(): void {
    this.form.patchValue({ icone: '' });
  }

  salvar(): void {
    this.form.controls.pagina_interna.updateValueAndValidity();
    this.form.controls.url_externa.updateValueAndValidity();
    if (this.form.invalid) return;

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const raw = this.form.getRawValue();
    const url = buildUrlFromDestino(raw.tipo_destino, raw.pagina_interna, raw.url_externa);
    const abrirNovaAba = raw.tipo_destino === 'externa' ? true : raw.abrir_nova_aba;

    const body = {
      label: raw.label.trim(),
      url,
      parent_id: raw.parent_id === '' ? null : Number(raw.parent_id),
      ordem: Number(raw.ordem) || 0,
      abrir_nova_aba: abrirNovaAba,
      icone: this.iconeService.normalizarParaSalvar(raw.icone),
      cabecalho: raw.cabecalho.trim() || null,
      ativo: raw.ativo,
      visivel_perfil: raw.visivel_perfil.trim() || null,
    };

    const id = this.editandoId();
    const req = id
      ? this.menuService.atualizar(id, body)
      : this.menuService.criar(body);

    req.subscribe({
      next: () => {
        this.mensagem.set(id ? 'Item atualizado.' : 'Item criado.');
        this.modalAberto.set(false);
        this.cancelar();
        this.carregar();
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar.');
        this.salvando.set(false);
      },
    });
  }

  private onTipoDestinoChange(tipo: TipoDestino): void {
    const abrirCtrl = this.form.controls.abrir_nova_aba;

    if (tipo === 'externa') {
      abrirCtrl.setValue(true, { emitEvent: false });
      abrirCtrl.disable({ emitEvent: false });
    } else {
      if (abrirCtrl.disabled) {
        abrirCtrl.enable({ emitEvent: false });
      }
      if (tipo === 'interna' && abrirCtrl.value) {
        abrirCtrl.setValue(false, { emitEvent: false });
      }
    }

    this.form.controls.pagina_interna.updateValueAndValidity({ emitEvent: false });
    this.form.controls.url_externa.updateValueAndValidity({ emitEvent: false });
  }

  private flattenTree(
    items: MenuItem[],
    depth = 0,
    parentId: number | null = null
  ): MenuReorderItem[] {
    const result: MenuReorderItem[] = [];
    items.forEach((item, index) => {
      result.push({ id: item.id, parent_id: parentId, ordem: index });
      if (item.children?.length) {
        result.push(...this.flattenTree(item.children, depth + 1, item.id));
      }
    });
    return result;
  }

  private flattenTreeOptions(items: MenuItem[], depth = 0): PaiOption[] {
    const result: PaiOption[] = [];
    for (const item of items) {
      if (depth < MENU_MAX_DEPTH - 1) {
        result.push({ id: item.id, label: item.label, depth });
      }
      if (item.children?.length) {
        result.push(...this.flattenTreeOptions(item.children, depth + 1));
      }
    }
    return result;
  }

  private collectDescendants(id: number, items: MenuItem[], exclude: Set<number>): void {
    const find = (nodes: MenuItem[]): MenuItem | null => {
      for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children?.length) {
          const found = find(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    const node = find(items);
    if (!node?.children?.length) return;
    const walk = (children: MenuItem[]) => {
      for (const c of children) {
        exclude.add(c.id);
        if (c.children?.length) walk(c.children);
      }
    };
    walk(node.children);
  }

  private countDescendants(item: MenuItem): number {
    let count = 0;
    const walk = (children: MenuItem[]) => {
      for (const c of children) {
        count += 1;
        if (c.children?.length) walk(c.children);
      }
    };
    if (item.children?.length) walk(item.children);
    return count;
  }

  async excluir(item: MenuItem): Promise<void> {
    const childCount = this.countDescendants(item);
    const aviso =
      childCount > 0
        ? `Remover "${item.label}" e todos os ${childCount} subitens?`
        : `Remover "${item.label}"?`;
    const ok = await this.alertas.confirmarExclusao({ texto: aviso });
    if (!ok) return;

    this.menuService.remover(item.id).subscribe({
      next: () => {
        this.mensagem.set('Item removido.');
        if (this.editandoId() === item.id) this.fecharModal();
        this.carregar();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao excluir.'),
    });
  }
}
