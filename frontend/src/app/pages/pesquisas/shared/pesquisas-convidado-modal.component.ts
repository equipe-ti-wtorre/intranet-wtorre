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
  isRgValido,
  normalizeRg,
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
  readonly rg = signal('');
  readonly email = signal('');
  readonly limparDocumento = signal(false);
  readonly limparRg = signal(false);
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

  readonly rgErro = computed(() => {
    if (this.limparRg() || !this.rg()) return '';
    if (!this.tocado() && !this.rg()) return '';
    const raw = this.rg().trim();
    if (!raw) return '';
    if (isRgValido(raw)) return '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && !/[A-Za-z]/.test(raw)) return '';
    return 'Informe um RG válido (5 a 10 dígitos, verificador opcional).';
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
    const rawRg = this.rg().trim();
    const rgOk = isRgValido(rawRg) || (rawRg.replace(/\D/g, '').length === 11 && !/[A-Za-z]/.test(rawRg));
    const docOk = isDocumentoValido(digits);
    const emailOk = EMAIL_RE.test(email);
    if (digits && !docOk) return false;
    if (rawRg && !rgOk) return false;
    if (email && !emailOk) return false;
    const temDocumento = docOk || (!!this.convidado()?.cpfMascara && !this.limparDocumento() && !digits);
    const temRg = rgOk || (!!this.convidado()?.rgMascara && !this.limparRg() && !rawRg);
    return !!this.nome().trim() || docOk || emailOk || temDocumento || temRg;
  });

  constructor() {
    effect(() => {
      const aberto = this.open();
      const atual = this.convidado();
      if (aberto && !this.estavaAberto) {
        this.nome.set(atual?.nome || '');
        this.documento.set('');
        this.rg.set('');
        this.email.set(atual?.email || '');
        this.limparDocumento.set(false);
        this.limparRg.set(false);
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

  formatarRg(raw: string): void {
    this.limparRg.set(false);
    this.rg.set(raw.toUpperCase().replace(/[^0-9X.\-\s/]/g, '').slice(0, 20));
  }

  alternarLimparDocumento(): void {
    this.limparDocumento.update((v) => !v);
    if (this.limparDocumento()) this.documento.set('');
  }

  alternarLimparRg(): void {
    this.limparRg.update((v) => !v);
    if (this.limparRg()) this.rg.set('');
  }

  salvar(): void {
    this.tocado.set(true);
    const id = this.formularioId();
    if (!id || !this.valido() || this.salvando()) return;
    const rawRg = this.rg().trim();
    const rgNorm = normalizeRg(rawRg);
    const rgDigits = rawRg.replace(/\D/g, '');
    const body = {
      nome: this.nome().trim() || undefined,
      cpf: digitsDocumento(this.documento()),
      rg: rgNorm || (rgDigits.length === 11 ? rgDigits : ''),
      email: this.email().trim().toLowerCase(),
      limparDocumento: this.limparDocumento(),
      limparRg: this.limparRg(),
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
