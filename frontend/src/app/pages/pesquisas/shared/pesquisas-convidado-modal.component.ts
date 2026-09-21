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
  readonly saved = output<PesquisasConvidado>();
  readonly cancel = output<void>();

  readonly nome = signal('');
  readonly documento = signal('');
  readonly email = signal('');
  readonly salvando = signal(false);
  readonly tocado = signal(false);
  private estavaAberto = false;

  readonly docErro = computed(() => {
    if (!this.tocado() && !this.documento()) return '';
    const digits = digitsDocumento(this.documento());
    if (!digits) return 'Informe um CPF ou CNPJ.';
    if (!isDocumentoValido(digits)) return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).';
    return '';
  });

  readonly emailErro = computed(() => {
    if (!this.tocado() && !this.email()) return '';
    const email = this.email().trim().toLowerCase();
    if (!email) return 'Informe um e-mail.';
    if (!EMAIL_RE.test(email)) return 'Informe um e-mail válido.';
    return '';
  });

  readonly valido = computed(() => {
    const digits = digitsDocumento(this.documento());
    const email = this.email().trim().toLowerCase();
    return isDocumentoValido(digits) && EMAIL_RE.test(email);
  });

  constructor() {
    effect(() => {
      const aberto = this.open();
      if (aberto && !this.estavaAberto) {
        this.nome.set('');
        this.documento.set('');
        this.email.set('');
        this.tocado.set(false);
        this.salvando.set(false);
      }
      this.estavaAberto = aberto;
    });
  }

  formatarDocumento(raw: string): void {
    this.documento.set(formatDocumento(raw));
  }

  salvar(): void {
    this.tocado.set(true);
    const id = this.formularioId();
    if (!id || !this.valido() || this.salvando()) return;
    this.salvando.set(true);
    this.api
      .adicionarConvidado(id, {
        nome: this.nome().trim() || undefined,
        cpf: digitsDocumento(this.documento()),
        email: this.email().trim().toLowerCase(),
      })
      .subscribe({
        next: (guest) => {
          this.salvando.set(false);
          this.alertas.sucesso('Convidado adicionado à lista.');
          this.saved.emit(guest);
        },
        error: (err: HttpErrorResponse) => {
          this.salvando.set(false);
          this.alertas.erro(err.error?.mensagem || 'Não foi possível adicionar o convidado.');
        },
      });
  }

  fechar(): void {
    if (this.salvando()) return;
    this.cancel.emit();
  }
}
