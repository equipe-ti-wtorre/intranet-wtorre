import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, Observable } from 'rxjs';
import { AdminDrawerComponent } from '../../../shared/admin/admin-drawer/admin-drawer.component';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';
import { ColaboradoresService } from '../../../services/colaboradores.service';
import { PerfisAcessoService } from '../../../services/perfis-acesso.service';
import {
  ColaboradorBusca,
  ModuloAdmin,
  PerfilAcesso,
  UsuarioAcesso,
} from '../../../models/perfil-acesso.model';

type AbaAcessos = 'colaboradores' | 'perfis';

@Component({
  selector: 'app-acessos-admin',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, AdminDrawerComponent, AdminModalComponent],
  templateUrl: './acessos-admin.component.html',
  styleUrl: './acessos-admin.component.scss',
})
export class AcessosAdminComponent implements OnInit {
  private readonly api = inject(PerfisAcessoService);
  private readonly colaboradoresService = inject(ColaboradoresService);
  private readonly alertas = inject(AlertasService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly busca$ = new Subject<string>();

  readonly abaAtiva = signal<AbaAcessos>('colaboradores');
  readonly usuarios = signal<UsuarioAcesso[]>([]);
  readonly perfisDrawer = signal<PerfilAcesso[]>([]);
  readonly perfisCadastrados = signal<PerfilAcesso[]>([]);
  readonly modulos = signal<ModuloAdmin[]>([]);
  readonly resultadosBusca = signal<ColaboradorBusca[]>([]);
  readonly buscaTexto = signal('');
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly drawerAberto = signal(false);

  readonly editando = signal<UsuarioAcesso | null>(null);
  readonly colaboradorNovo = signal<ColaboradorBusca | null>(null);
  readonly perfisSelecionados = signal<number[]>([]);
  readonly modulosExtra = signal<string[]>([]);
  readonly usuarioAtivo = signal(true);
  readonly isSuperAdmin = signal(false);

  readonly modulosSelecionados = signal<string[]>([]);
  readonly editandoPerfilId = signal<number | null>(null);
  readonly modalAberto = signal(false);
  readonly modalModulosAberto = signal(false);
  readonly perfilModulosId = signal<number | null>(null);

  readonly form = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    descricao: [''],
    ativo: [true],
  });

  readonly usuariosFiltrados = computed(() => {
    const q = this.buscaTexto().trim().toLowerCase();
    const list = this.usuarios();
    if (q.length < 2) return list;
    return list.filter(
      (u) =>
        u.nome_completo.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
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
    this.carregarUsuarios();
    this.carregarPerfis();
    this.api.listarModulos().subscribe({
      next: (list) => this.modulos.set(list),
    });

    this.busca$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => (q.trim().length >= 2 ? this.api.buscarColaboradores(q.trim()) : of([])))
      )
      .subscribe({
        next: (list) => this.resultadosBusca.set(list),
        error: () => this.erro.set('Erro na busca de colaboradores.'),
      });

    this.processarDeepLink();
  }

  private processarDeepLink(): void {
    const qp = this.route.snapshot.queryParamMap;
    const usuarioId = Number(qp.get('usuario_id'));
    const colaboradorId = Number(qp.get('colaborador_id'));
    const provisionar = qp.get('provisionar') === '1';

    if (usuarioId) {
      this.api.obterUsuario(usuarioId).subscribe({
        next: (u) => this.abrirDrawer(u),
        error: (err: HttpErrorResponse) =>
          this.erro.set(err.error?.mensagem || 'Erro ao carregar usuário.'),
      });
      return;
    }

    if (!colaboradorId) return;

    this.colaboradoresService.obterAdmin(colaboradorId).subscribe({
      next: (c) => {
        const busca: ColaboradorBusca = {
          id: c.id,
          ad_id: c.ad_id,
          nome: c.nome,
          email: c.email,
          departamento: c.departamento,
          empresa: c.empresa,
          ja_cadastrado: c.intranet.cadastrado,
          usuario_id: c.intranet.usuario_id,
        };

        if (provisionar || !c.intranet.cadastrado) {
          this.abrirColaborador(busca);
          return;
        }

        if (c.intranet.usuario_id) {
          this.api.obterUsuario(c.intranet.usuario_id).subscribe({
            next: (u) => this.abrirDrawer(u),
            error: (err: HttpErrorResponse) =>
              this.erro.set(err.error?.mensagem || 'Erro ao carregar usuário.'),
          });
        }
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar colaborador.'),
    });
  }

  selecionarAba(aba: AbaAcessos): void {
    this.abaAtiva.set(aba);
  }

  private abaInicial(): AbaAcessos {
    const qp = this.route.snapshot.queryParamMap.get('aba');
    return qp === 'perfis' ? 'perfis' : 'colaboradores';
  }

  carregarUsuarios(): void {
    this.api.listarUsuarios().subscribe({
      next: (list) => this.usuarios.set(list),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar usuários.'),
    });
  }

  carregarPerfis(): void {
    this.api.listarPerfis().subscribe({
      next: (list) => {
        this.perfisCadastrados.set(list);
        this.perfisDrawer.set(list.filter((p) => p.ativo));
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar perfis.'),
    });
  }

  onBuscaInput(value: string): void {
    this.buscaTexto.set(value);
    this.busca$.next(value);
  }

  abrirColaborador(c: ColaboradorBusca): void {
    if (c.usuario_id) {
      this.api.obterUsuario(c.usuario_id).subscribe({
        next: (u) => this.abrirDrawer(u),
        error: (err: HttpErrorResponse) =>
          this.erro.set(err.error?.mensagem || 'Erro ao carregar usuário.'),
      });
    } else {
      this.colaboradorNovo.set(c);
      this.editando.set(null);
      this.perfisSelecionados.set([]);
      this.modulosExtra.set([]);
      this.usuarioAtivo.set(true);
      this.isSuperAdmin.set(false);
      this.drawerAberto.set(true);
    }
  }

  abrirUsuario(u: UsuarioAcesso): void {
    this.abrirDrawer(u);
  }

  private abrirDrawer(u: UsuarioAcesso): void {
    this.colaboradorNovo.set(null);
    this.editando.set(u);
    this.perfisSelecionados.set(u.perfis.map((p) => p.id));
    this.modulosExtra.set([...u.modulos_extra]);
    this.usuarioAtivo.set(u.ativo);
    this.isSuperAdmin.set(u.perfil === 'ADMIN');
    this.drawerAberto.set(true);
  }

  fecharDrawer(): void {
    this.drawerAberto.set(false);
    this.editando.set(null);
    this.colaboradorNovo.set(null);
  }

  togglePerfil(id: number): void {
    this.perfisSelecionados.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    );
  }

  toggleModuloExtra(codigo: string): void {
    this.modulosExtra.update((list) =>
      list.includes(codigo) ? list.filter((c) => c !== codigo) : [...list, codigo]
    );
  }

  salvar(): void {
    const u = this.editando();
    const colab = this.colaboradorNovo();
    const id = u?.id ?? 0;
    const eraSuperAdmin = u?.perfil === 'ADMIN';
    const querSuperAdmin = this.isSuperAdmin();

    this.salvando.set(true);

    this.executarSalvamento(id, colab, eraSuperAdmin, querSuperAdmin).subscribe({
      next: (salvo) => {
        if (salvo.id && salvo.ativo !== this.usuarioAtivo()) {
          this.api.patchAtivo(salvo.id, this.usuarioAtivo()).subscribe({
            next: () => this.finalizarSalvamento(),
            error: (err: HttpErrorResponse) => {
              this.erro.set(err.error?.mensagem || 'Erro ao atualizar status.');
              this.salvando.set(false);
            },
          });
        } else {
          this.finalizarSalvamento();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar acessos.');
        this.salvando.set(false);
      },
    });
  }

  private executarSalvamento(
    id: number,
    colab: ColaboradorBusca | null,
    eraSuperAdmin: boolean,
    querSuperAdmin: boolean
  ): Observable<UsuarioAcesso> {
    const provisionar = (): Observable<UsuarioAcesso> => {
      if (id > 0) {
        return of(this.editando()!);
      }
      return this.api.salvarUsuario(0, {
        perfil_ids: querSuperAdmin ? [] : this.perfisSelecionados(),
        modulos_extra: querSuperAdmin ? [] : this.modulosExtra(),
        colaborador_id: colab?.id,
      });
    };

    if (querSuperAdmin) {
      return provisionar().pipe(
        switchMap((salvo) => {
          if (!eraSuperAdmin || salvo.perfil !== 'ADMIN') {
            return this.api.patchPerfil(salvo.id, 'ADMIN');
          }
          return of(salvo);
        })
      );
    }

    if (eraSuperAdmin) {
      return this.api.patchPerfil(id, 'USER').pipe(
        switchMap((salvo) =>
          this.api.salvarUsuario(salvo.id, {
            perfil_ids: this.perfisSelecionados(),
            modulos_extra: this.modulosExtra(),
          })
        )
      );
    }

    return this.api.salvarUsuario(id, {
      perfil_ids: this.perfisSelecionados(),
      modulos_extra: this.modulosExtra(),
      colaborador_id: colab?.id,
    });
  }

  private finalizarSalvamento(): void {
    this.mensagem.set('Acessos salvos.');
    this.fecharDrawer();
    this.carregarUsuarios();
    this.salvando.set(false);
  }

  drawerTitulo(): string {
    const u = this.editando();
    const c = this.colaboradorNovo();
    return u?.nome_completo ?? c?.nome ?? 'Usuário';
  }

  temTodosModulos(u: UsuarioAcesso): boolean {
    return u.perfil === 'ADMIN';
  }

  modulosLista(u: UsuarioAcesso): string[] {
    if (u.perfil === 'ADMIN') return [];
    return u.modulos;
  }

  async excluirUsuario(u: UsuarioAcesso): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Excluir o usuário "${u.nome_completo}"? Esta ação não pode ser desfeita.`,
    });
    if (!ok) return;
    this.api.excluirUsuario(u.id).subscribe({
      next: () => {
        if (this.editando()?.id === u.id) {
          this.fecharDrawer();
        }
        this.mensagem.set('Usuário excluído.');
        this.carregarUsuarios();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao excluir usuário.'),
    });
  }

  novoPerfil(): void {
    this.cancelarPerfil();
    this.modalAberto.set(true);
  }

  editarPerfil(p: PerfilAcesso): void {
    this.editandoPerfilId.set(p.id);
    this.form.patchValue({
      nome: p.nome,
      descricao: p.descricao ?? '',
      ativo: p.ativo,
    });
    this.modalAberto.set(true);
  }

  abrirModulos(p: PerfilAcesso): void {
    this.perfilModulosId.set(p.id);
    this.modulosSelecionados.set([...p.modulos]);
    this.modalModulosAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.cancelarPerfil();
  }

  fecharModalModulos(): void {
    this.modalModulosAberto.set(false);
    this.perfilModulosId.set(null);
  }

  cancelarPerfil(): void {
    this.editandoPerfilId.set(null);
    this.form.reset({ ativo: true, descricao: '' });
  }

  tituloModal(): string {
    return this.editandoPerfilId() ? 'Editar perfil' : 'Novo perfil';
  }

  subtituloModal(): string {
    return 'Perfis agrupam módulos administrativos que podem ser atribuídos a usuários.';
  }

  toggleModuloPerfil(codigo: string): void {
    this.modulosSelecionados.update((list) =>
      list.includes(codigo) ? list.filter((c) => c !== codigo) : [...list, codigo]
    );
  }

  salvarPerfil(): void {
    if (this.form.invalid) return;
    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const body = this.form.getRawValue();
    const id = this.editandoPerfilId();

    const req = id ? this.api.atualizarPerfil(id, body) : this.api.criarPerfil(body);

    req.subscribe({
      next: () => {
        this.mensagem.set(id ? 'Perfil atualizado.' : 'Perfil criado.');
        this.modalAberto.set(false);
        this.cancelarPerfil();
        this.carregarPerfis();
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar.');
        this.salvando.set(false);
      },
    });
  }

  salvarModulos(): void {
    const id = this.perfilModulosId();
    if (!id) return;
    this.salvando.set(true);
    this.api.definirModulosPerfil(id, this.modulosSelecionados()).subscribe({
      next: () => {
        this.mensagem.set('Módulos do perfil atualizados.');
        this.fecharModalModulos();
        this.carregarPerfis();
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar módulos.');
        this.salvando.set(false);
      },
    });
  }

  async excluirPerfil(p: PerfilAcesso): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Excluir perfil "${p.nome}"?`,
    });
    if (!ok) return;
    this.api.excluirPerfil(p.id).subscribe({
      next: () => {
        this.mensagem.set('Perfil removido.');
        this.carregarPerfis();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao excluir.'),
    });
  }

  modulosLabelPerfil(p: PerfilAcesso): string {
    if (!p.modulos.length) return '—';
    return p.modulos.join(', ');
  }
}
