import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { PesquisasConvidado } from '../../../models/pesquisas.model';
import { PesquisasService } from '../../../services/pesquisas.service';
import { AlertasService } from '../../../services/alertas.service';
import {
  digitsDocumento,
  formatDocumento,
  isDocumentoValido,
} from './pesquisas-documento.util';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-pesquisas-convidado-modal',
  standalone: true,
  imports: [FormsModule, AdminModalComponent],
  templateUrl: './pesquisas-convidado-modal.component.html',
})
export class PesquisasConvidadoModalComponent {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);

  readonly open = input(false);
  readonly formularioId = input<number | null>(null);
  readonly convidado = input<PesquisasConvidado | null>(null);
  readonly saved = output<PesquisasConvidado>();
  readonly cancel = output<void>();

  readonly nome = signal('');
  readonly documento = signal('');
  readonly email = signal('');
  readonly limparDocumento = signal(false);
  readonly salvando = signal(false);
  readonly tocado = signal(false);
  private estavaAberto = false;

  readonly editando = computed(() => !!this.convidado()?.id);
  readonly titulo = computed(() => (this.editando() ? 'Editar convidado' : 'Novo convidado'));
  readonly saveLabel = computed(() => (this.editando() ? 'Salvar' : 'Adicionar'));

  readonly docErro = computed(() => {
    if (this.limparDocumento() || !this.documento()) return '';
    if (!this.tocado() && !this.documento()) return '';
    const digits = digitsDocumento(this.documento());
    if (!digits) return '';
    if (!isDocumentoValido(digits)) return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).';
    return '';
  });

  readonly emailErro = computed(() => {
    const email = this.email().trim().toLowerCase();
    if (!email) return '';
    if (!this.tocado() && email) return '';
    if (!EMAIL_RE.test(email)) return 'Informe um e-mail válido.';
    return '';
  });

  readonly valido = computed(() => {
    const digits = digitsDocumento(this.documento());
    const email = this.email().trim().toLowerCase();
    const docOk = isDocumentoValido(digits);
    const emailOk = EMAIL_RE.test(email);
    if (digits && !docOk) return false;
    if (email && !emailOk) return false;
    const temDocumento = docOk || (!!this.convidado()?.cpfMascara && !this.limparDocumento() && !digits);
    return !!this.nome().trim() || docOk || emailOk || temDocumento;
  });

  constructor() {
    effect(() => {
      const aberto = this.open();
      const atual = this.convidado();
      if (aberto && !this.estavaAberto) {
        this.nome.set(atual?.nome || '');
        this.documento.set('');
        this.email.set(atual?.email || '');
        this.limparDocumento.set(false);
        this.tocado.set(false);
        this.salvando.set(false);
      }
      this.estavaAberto = aberto;
    });
  }

  formatarDocumento(raw: string): void {
    this.limparDocumento.set(false);
    this.documento.set(formatDocumento(raw));
  }

  alternarLimparDocumento(): void {
    this.limparDocumento.update((v) => !v);
    if (this.limparDocumento()) this.documento.set('');
  }

  salvar(): void {
    this.tocado.set(true);
    const id = this.formularioId();
    if (!id || !this.valido() || this.salvando()) return;
    const body = {
      nome: this.nome().trim() || undefined,
      cpf: digitsDocumento(this.documento()),
      email: this.email().trim().toLowerCase(),
      limparDocumento: this.limparDocumento(),
    };
    this.salvando.set(true);
    const editId = this.convidado()?.id;
    const req$ = editId
      ? this.api.atualizarConvidado(id, editId, body)
      : this.api.adicionarConvidado(id, body);
    req$.subscribe({
      next: (guest) => {
        this.salvando.set(false);
        this.alertas.sucesso(editId ? 'Convidado atualizado.' : 'Convidado adicionado à lista.');
        this.saved.emit(guest);
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar o convidado.');
      },
    });
  }

  fechar(): void {
    if (this.salvando()) return;
    this.cancel.emit();
  }
}
