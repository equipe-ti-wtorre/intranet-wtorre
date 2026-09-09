import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../services/alertas.service';
import { RamalAuthService } from '../../services/ramal-auth.service';
import { RamalPerfil, RamalUsuario } from '../../models/ramal.model';

type ModalMode = 'criar' | 'editar' | 'senha';

@Component({
  selector: 'app-ramal-usuarios',
  standalone: true,
  imports: [ReactiveFormsModule, AdminModalComponent],
  templateUrl: './ramal-usuarios.component.html',
  styleUrl: './ramal-usuarios.component.scss',
})
export class RamalUsuariosComponent implements OnInit {
  private readonly api = inject(RamalAuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly usuarios = signal<RamalUsuario[]>([]);
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
        u.perfil.toLowerCase().includes(q)
    );
  });

  readonly formCriar = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    nome: ['', Validators.required],
    senha: ['', [Validators.required, Validators.minLength(4)]],
    perfil: ['USER' as RamalPerfil, Validators.required],
  });

  readonly formEditar = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    nome: ['', Validators.required],
    perfil: ['USER' as RamalPerfil, Validators.required],
    ativo: [true],
  });

  readonly formSenha = this.fb.nonNullable.group({
    senha: ['', [Validators.required, Validators.minLength(4)]],
  });

  ngOnInit(): void {
    this.carregar();
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
    this.formCriar.reset({ username: '', nome: '', senha: '', perfil: 'USER' });
    this.modalAberto.set(true);
  }

  editar(u: RamalUsuario): void {
    this.modalMode.set('editar');
    this.editandoId.set(u.id);
    this.formEditar.reset({
      username: u.username,
      nome: u.nome,
      perfil: u.perfil,
      ativo: u.ativo,
    });
    this.modalAberto.set(true);
  }

  alterarSenha(u: RamalUsuario): void {
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
    if (this.modalMode() === 'senha') return 'Redefinir senha';
    if (this.modalMode() === 'editar') return 'Editar usuário';
    return 'Novo usuário';
  }

  subtituloModal(): string {
    if (this.modalMode() === 'senha') return 'Defina uma nova senha para o usuário';
    if (this.modalMode() === 'editar') return 'Atualize os dados de acesso';
    return 'Crie um acesso local para o portal Ramais';
  }

  saveLabel(): string {
    if (this.modalMode() === 'senha') return 'Redefinir senha';
    if (this.modalMode() === 'editar') return 'Salvar';
    return 'Criar usuário';
  }

  saveDisabled(): boolean {
    if (this.modalMode() === 'senha') return this.formSenha.invalid;
    if (this.modalMode() === 'editar') return this.formEditar.invalid;
    return this.formCriar.invalid;
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
    if (this.formCriar.invalid) return;
    this.salvando.set(true);
    const body = this.formCriar.getRawValue();
    this.api.createUsuario(body).subscribe({
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
    if (!id || this.formEditar.invalid) return;
    this.salvando.set(true);
    const body = this.formEditar.getRawValue();
    this.api.updateUsuario(id, body).subscribe({
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
        this.alertas.sucesso('Senha redefinida.');
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao redefinir senha.');
      },
    });
  }

  async excluir(u: RamalUsuario): Promise<void> {
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
}
