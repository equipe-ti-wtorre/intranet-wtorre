import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AzureTenant } from '../../../models/usuario.model';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';

@Component({
  selector: 'app-tenants-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminModalComponent],
  templateUrl: './tenants-admin.component.html',
  styleUrl: './tenants-admin.component.scss',
})
export class TenantsAdminComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly tenants = signal<AzureTenant[]>([]);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly modalAberto = signal(false);
  readonly mostrarSecret = signal(false);

  readonly form = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    azure_tenant_id: ['', Validators.required],
    client_id: ['', Validators.required],
    client_secret: [''],
    ativo: [true],
    eh_principal: [false],
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
    this.http.get<AzureTenant[]>(`${environment.apiBaseUrl}/tenants`).subscribe({
      next: (list) => this.tenants.set(list),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao carregar tenants.'),
    });
  }

  novoTenant(): void {
    this.cancelar();
    this.modalAberto.set(true);
  }

  editar(t: AzureTenant): void {
    this.editandoId.set(t.id);
    this.mostrarSecret.set(false);
    this.form.patchValue({
      nome: t.nome,
      azure_tenant_id: t.azure_tenant_id,
      client_id: t.client_id,
      client_secret: '',
      ativo: t.ativo,
      eh_principal: t.eh_principal,
    });
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.cancelar();
  }

  cancelar(): void {
    this.editandoId.set(null);
    this.mostrarSecret.set(false);
    this.form.reset({ ativo: true, eh_principal: false });
  }

  tituloModal(): string {
    return this.editandoId() ? 'Editar tenant' : 'Novo tenant';
  }

  subtituloModal(): string {
    return this.editandoId()
      ? 'Atualize as credenciais e configurações do tenant'
      : 'Cadastre a empresa do grupo no Azure / Entra ID';
  }

  toggleSecret(): void {
    this.mostrarSecret.update((v) => !v);
  }

  salvar(): void {
    if (this.form.invalid) return;
    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const body = this.form.getRawValue();
    const id = this.editandoId();

    const req = id
      ? this.http.put(`${environment.apiBaseUrl}/tenants/${id}`, body)
      : this.http.post(`${environment.apiBaseUrl}/tenants`, body);

    req.subscribe({
      next: () => {
        this.mensagem.set(id ? 'Tenant atualizado.' : 'Tenant criado.');
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

  async excluir(t: AzureTenant): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      texto: `Excluir tenant "${t.nome}"?`,
    });
    if (!ok) return;
    this.http.delete(`${environment.apiBaseUrl}/tenants/${t.id}`).subscribe({
      next: () => {
        this.mensagem.set('Tenant removido.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao excluir.'),
    });
  }

  testar(t: AzureTenant): void {
    this.http.post<{ ok: boolean; mensagem: string }>(
      `${environment.apiBaseUrl}/tenants/${t.id}/test`,
      {}
    ).subscribe({
      next: (res) => this.mensagem.set(res.mensagem),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Falha no teste de conexão.'),
    });
  }
}
