import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../services/alertas.service';
import { TabletAuthService } from '../../services/tablet-auth.service';
import { TabletEmpresa, TabletPerfil, TabletUsuario } from '../../models/tablet.model';

type ModalMode = 'criar' | 'editar' | 'senha';

@Component({
  selector: 'app-tablet-usuarios',
  standalone: true,
  imports: [ReactiveFormsModule, AdminModalComponent],
  templateUrl: './tablet-usuarios.component.html',
  styleUrl: './tablet-usuarios.component.scss',
})
export class TabletUsuariosComponent implements OnInit {
  private readonly api = inject(TabletAuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly usuarios = signal<TabletUsuario[]>([]);
  readonly empresas = signal<TabletEmpresa[]>([]);
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly modalAberto = signal(false);
  readonly modalMode = signal<ModalMode>('criar');
  readonly editandoId = signal<number | null>(null);
  readonly busca = signal('');

  readonly meId = computed(() => this.api.usuario()?.id ?? null);

  readonly filtrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const list = this.usuarios();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.nome.toLowerCase().includes(q) ||
        (u.empresaNm || '').toLowerCase().includes(q) ||
        u.perfil.toLowerCase().includes(q)
    );
  });

  readonly formCriar = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    nome: ['', Validators.required],
    senha: ['', [Validators.required, Validators.minLength(4)]],
    empresaId: [''],
    admin: [false],
  });

  readonly formEditar = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    nome: ['', Validators.required],
    empresaId: [''],
    admin: [false],
    ativo: [true],
  });

  readonly formSenha = this.fb.nonNullable.group({
    senha: ['', [Validators.required, Validators.minLength(4)]],
  });

  ngOnInit(): void {
    this.carregarEmpresas();
    this.carregar();
  }

  carregarEmpresas(): void {
    this.api.listEmpresas().subscribe({
      next: (list) => this.empresas.set(list),
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar empresas.'),
    });
  }

  carregar(): void {
    this.carregando.set(true);
    this.api.listUsuarios().subscribe({
      next: (list) => {
        this.usuarios.set(list);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.carregando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar usuários.');
      },
    });
  }

  onBusca(ev: Event): void {
    this.busca.set((ev.target as HTMLInputElement).value);
  }

  novo(): void {
    this.modalMode.set('criar');
    this.editandoId.set(null);
    this.formCriar.reset({ username: '', nome: '', senha: '', empresaId: '', admin: false });
    this.modalAberto.set(true);
  }

  editar(u: TabletUsuario): void {
    this.modalMode.set('editar');
    this.editandoId.set(u.id);
    this.garantirEmpresaNaLista(u);
    this.formEditar.reset({
      username: u.username,
      nome: u.nome,
      empresaId: u.empresaId != null ? String(u.empresaId) : '',
      admin: u.perfil === 'ADMIN',
      ativo: u.ativo,
    });
    this.modalAberto.set(true);
  }

  alterarSenha(u: TabletUsuario): void {
    this.modalMode.set('senha');
    this.editandoId.set(u.id);
    this.formSenha.reset({ senha: '' });
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.editandoId.set(null);
    this.salvando.set(false);
  }

  tituloModal(): string {
    if (this.modalMode() === 'senha') return 'Alterar senha';
    if (this.modalMode() === 'editar') return 'Editar usuário';
    return 'Novo usuário';
  }

  subtituloModal(): string {
    if (this.modalMode() === 'senha') return 'Defina uma nova senha para o usuário';
    if (this.modalMode() === 'editar') return 'Atualize a empresa e o perfil de acesso';
    return 'Crie a conta genérica da empresa para as massagistas';
  }

  saveLabel(): string {
    if (this.modalMode() === 'senha') return 'Alterar senha';
    if (this.modalMode() === 'editar') return 'Salvar';
    return 'Criar usuário';
  }

  saveDisabled(): boolean {
    if (this.modalMode() === 'senha') return this.formSenha.invalid;
    if (this.modalMode() === 'editar') {
      return this.formEditar.invalid || this.empresaObrigatoriaFaltando(this.formEditar.getRawValue());
    }
    return this.formCriar.invalid || this.empresaObrigatoriaFaltando(this.formCriar.getRawValue());
  }

  empresaObrigatoriaFaltando(v: { admin: boolean; empresaId: string }): boolean {
    return !v.admin && !String(v.empresaId || '').trim();
  }

  salvar(): void {
    if (this.salvando()) return;
    if (this.modalMode() === 'senha') {
      this.salvarSenha();
      return;
    }
    if (this.modalMode() === 'editar') {
      this.salvarEdicao();
      return;
    }
    if (this.saveDisabled()) return;
    this.salvando.set(true);
    const body = this.formCriar.getRawValue();
    this.api
      .createUsuario({
        username: body.username,
        nome: body.nome,
        senha: body.senha,
        ...this.perfilEmpresa(body),
      })
      .subscribe({
      next: () => {
        this.salvando.set(false);
        this.fecharModal();
        this.alertas.sucesso('Usuário criado.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao criar usuário.');
      },
    });
  }

  private salvarEdicao(): void {
    const id = this.editandoId();
    if (!id || this.saveDisabled()) return;
    this.salvando.set(true);
    const body = this.formEditar.getRawValue();
    this.api
      .updateUsuario(id, {
        username: body.username,
        nome: body.nome,
        ativo: body.ativo,
        ...this.perfilEmpresa(body),
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.fecharModal();
          this.alertas.sucesso('Usuário atualizado.');
          this.carregar();
        },
        error: (err: HttpErrorResponse) => {
          this.salvando.set(false);
          this.alertas.erro(err.error?.mensagem || 'Erro ao atualizar usuário.');
        },
      });
  }

  private salvarSenha(): void {
    const id = this.editandoId();
    if (!id || this.formSenha.invalid) return;
    this.salvando.set(true);
    const { senha } = this.formSenha.getRawValue();
    this.api.alterarSenha(id, senha).subscribe({
      next: () => {
        this.salvando.set(false);
        this.fecharModal();
        this.alertas.sucesso('Senha alterada.');
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao alterar senha.');
      },
    });
  }

  async excluir(u: TabletUsuario): Promise<void> {
    if (u.id === this.meId()) {
      this.alertas.erro('Você não pode excluir o próprio usuário.');
      return;
    }
    const ok = await this.alertas.confirmarExclusao({
      titulo: 'Excluir usuário',
      texto: `Excluir o usuário “${u.username}”?`,
    });
    if (!ok) return;
    this.api.excluirUsuario(u.id).subscribe({
      next: () => {
        this.alertas.sucesso('Usuário excluído.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao excluir usuário.'),
    });
  }

  private perfilEmpresa(v: { empresaId: string; admin: boolean }): {
    perfil: TabletPerfil;
    empresaId: number | null;
  } {
    const empresaId = String(v.empresaId || '').trim();
    return {
      perfil: v.admin ? 'ADMIN' : 'USER',
      empresaId: empresaId ? Number(empresaId) : null,
    };
  }

  private garantirEmpresaNaLista(u: TabletUsuario): void {
    if (u.empresaId == null) return;
    const id = String(u.empresaId);
    if (this.empresas().some((e) => String(e.id) === id)) return;
    this.empresas.update((list) => [...list, { id, nm: u.empresaNm || `Empresa #${id}` }]);
  }
}
