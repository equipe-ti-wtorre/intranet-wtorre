import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';
import { ContainersService } from '../../../services/containers.service';
import { StorageContainer } from '../../../models/storage-container.model';
import { validarNomeContainer } from '../../../utils/treinamento-categoria.util';

@Component({
  selector: 'app-containers-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminModalComponent],
  templateUrl: './containers-admin.component.html',
  styleUrl: './containers-admin.component.scss',
})
export class ContainersAdminComponent implements OnInit {
  private readonly containersService = inject(ContainersService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly containers = signal<StorageContainer[]>([]);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly modalAberto = signal(false);
  readonly nomeErro = signal('');

  readonly form = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    rotulo: ['', Validators.required],
    descricao: [''],
    criarNoAzure: [true],
    padrao: [false],
    ativo: [true],
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
    this.carregar();
  }

  carregar(): void {
    this.containersService.listar().subscribe({
      next: (list) => this.containers.set(list),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar containers.'),
    });
  }

  qtdVideos(c: StorageContainer): number {
    return c.qtdVideos ?? c.qtd_videos ?? 0;
  }

  novo(): void {
    this.cancelar();
    this.modalAberto.set(true);
  }

  editar(c: StorageContainer): void {
    if (c.id == null) return;
    this.editandoId.set(c.id);
    this.form.patchValue({
      nome: c.nome,
      rotulo: c.rotulo,
      descricao: c.descricao ?? '',
      criarNoAzure: false,
      padrao: c.padrao,
      ativo: c.ativo,
    });
    this.form.controls.nome.disable();
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.cancelar();
  }

  cancelar(): void {
    this.editandoId.set(null);
    this.nomeErro.set('');
    this.form.reset({ criarNoAzure: true, padrao: false, ativo: true });
    this.form.controls.nome.enable();
  }

  tituloModal(): string {
    return this.editandoId() ? 'Editar container' : 'Adicionar container';
  }

  subtituloModal(): string {
    return this.editandoId()
      ? 'Atualize rótulo, descrição e status. Remover aqui não apaga o container no Azure.'
      : 'Cadastre um container Blob privado na conta configurada.';
  }

  validarNome(): void {
    const err = validarNomeContainer(this.form.controls.nome.value);
    this.nomeErro.set(err ?? '');
  }

  salvar(): void {
    if (this.form.invalid) return;
    const editId = this.editandoId();

    if (!editId) {
      this.validarNome();
      if (this.nomeErro()) return;
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const raw = this.form.getRawValue();

    const req = editId
      ? this.containersService.atualizar(editId, {
          rotulo: raw.rotulo.trim(),
          descricao: raw.descricao.trim() || undefined,
          padrao: raw.padrao,
          ativo: raw.ativo,
        })
      : this.containersService.criar({
          nome: raw.nome.trim().toLowerCase(),
          rotulo: raw.rotulo.trim(),
          descricao: raw.descricao.trim() || undefined,
          padrao: raw.padrao,
          criarNoAzure: raw.criarNoAzure,
        });

    req.subscribe({
      next: () => {
        this.mensagem.set(editId ? 'Container atualizado.' : 'Container criado.');
        this.salvando.set(false);
        this.modalAberto.set(false);
        this.cancelar();
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar container.');
        this.salvando.set(false);
      },
    });
  }

  async excluir(c: StorageContainer): Promise<void> {
    if (c.id == null) return;
    const ok = await this.alertas.confirmarExclusao({
      texto: `Remover o cadastro do container "${c.rotulo}"?\n\nIsso NÃO apaga o container nem os arquivos no Azure — apenas o registro na intranet.`,
    });
    if (!ok) return;
    this.containersService.remover(c.id).subscribe({
      next: () => {
        this.mensagem.set('Cadastro removido.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao remover container.'),
    });
  }
}
