import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';
import { PesqIconComponent } from './pesq-icon.component';
import {
  digitsDocumento,
  formatDocumento,
  isDocumentoValido,
  maskDocumento,
  maskRg,
  normalizeRg,
} from './pesquisas-documento.util';

export interface ConvidadoListaItem {
  key: number;
  nome: string;
  cpf: string;
  cpfMascara: string;
  rg: string;
  rgMascara: string;
  email: string;
}

export interface ConvidadoListaEdicao {
  key: number;
  nome: string;
  cpf: string;
  cpfMascara: string;
  rg: string;
  rgMascara: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function chaveConvidado(nome: string, cpf: string, email: string, rg: string): string {
  if (cpf && (cpf.length === 11 || cpf.length === 14)) return `d:${cpf}`;
  if (rg) return `r:${rg}`;
  const mail = email.trim().toLowerCase();
  if (mail) return `e:${mail}`;
  const n = nome.trim().toLowerCase();
  return n ? `n:${n}` : '';
}

@Component({
  selector: 'app-pesquisas-convidados-lista-modal',
  standalone: true,
  imports: [FormsModule, AdminModalComponent, PesqIconComponent],
  templateUrl: './pesquisas-convidados-lista-modal.component.html',
  styleUrl: './pesquisas-convidados-lista-modal.component.scss',
})
export class PesquisasConvidadosListaModalComponent {
  private readonly alertas = inject(AlertasService);

  readonly open = input(false);
  readonly convidados = input<ConvidadoListaItem[]>([]);
  readonly fechar = output<void>();
  readonly remover = output<number>();
  readonly atualizar = output<ConvidadoListaEdicao>();

  readonly busca = signal('');
  readonly editando = signal<ConvidadoListaItem | null>(null);
  readonly nome = signal('');
  readonly documento = signal('');
  readonly rg = signal('');
  readonly email = signal('');
  private estavaAberto = false;

  readonly titulo = computed(() => (this.editando() ? 'Editar convidado' : 'Convidados'));
  readonly subtitle = computed(() => {
    if (this.editando()) return 'Altere os dados e salve para atualizar a lista.';
    const n = this.convidados().length;
    return n === 1 ? '1 convidado na lista.' : `${n} convidados na lista.`;
  });
  readonly cancelLabel = computed(() => (this.editando() ? 'Voltar' : 'Fechar'));
  readonly filtrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const lista = this.convidados();
    if (!q) return lista;
    return lista.filter((g) => {
      const hay = `${g.nome} ${g.cpf} ${g.cpfMascara} ${g.rg} ${g.rgMascara} ${g.email}`.toLowerCase();
      return hay.includes(q);
    });
  });

  constructor() {
    effect(() => {
      const aberto = this.open();
      if (aberto && !this.estavaAberto) {
        this.resetEdicao();
        this.busca.set('');
      }
      if (!aberto) this.resetEdicao();
      this.estavaAberto = aberto;
    });
  }

  formatarDocumento(raw: string): void {
    this.documento.set(formatDocumento(raw));
  }

  formatarRg(raw: string): void {
    this.rg.set(raw.toUpperCase().replace(/[^0-9X.\-\s/]/g, '').slice(0, 20));
  }

  iniciarEdicao(g: ConvidadoListaItem): void {
    this.editando.set(g);
    this.nome.set(g.nome);
    this.documento.set(g.cpf || '');
    this.rg.set(g.rg || '');
    this.email.set(g.email);
  }

  onCancel(): void {
    if (this.editando()) {
      this.resetEdicao();
      return;
    }
    this.fechar.emit();
  }

  salvarEdicao(): void {
    const atual = this.editando();
    if (!atual) return;
    const parsed = this.validar(atual);
    if (!parsed) return;
    this.atualizar.emit(parsed);
    this.resetEdicao();
  }

  async confirmarRemocao(g: ConvidadoListaItem): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: 'Remover convidado',
      texto: `Remover ${g.nome || g.email || 'este convidado'} da lista?`,
    });
    if (!ok) return;
    this.remover.emit(g.key);
  }

  private resetEdicao(): void {
    this.editando.set(null);
    this.nome.set('');
    this.documento.set('');
    this.rg.set('');
    this.email.set('');
  }

  private validar(atual: ConvidadoListaItem): ConvidadoListaEdicao | null {
    const nome = this.nome().trim();
    const digits = digitsDocumento(this.documento());
    const email = this.email().trim().toLowerCase();
    const rgNorm = normalizeRg(this.rg());
    const rgDigits = this.rg().replace(/\D/g, '');
    const rgComoCpf = !rgNorm && rgDigits.length === 11 && !/[A-Z]/.test(this.rg());
    const rgInformado = !!this.rg().trim();
    const docOk = isDocumentoValido(digits);
    const emailOk = EMAIL_RE.test(email);
    const rgOk = !!rgNorm || rgComoCpf;
    if (digits && !docOk) {
      this.alertas.erro('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).');
      return null;
    }
    if (rgInformado && !rgOk) {
      this.alertas.erro('Informe um RG válido (5 a 10 dígitos, verificador opcional).');
      return null;
    }
    if (email && !emailOk) {
      this.alertas.erro('Informe um e-mail válido.');
      return null;
    }

    const cpf = docOk ? formatDocumento(digits) : atual.cpf;
    const cpfMascara = docOk ? maskDocumento(digits) : atual.cpfMascara;
    const rgSalvo = rgOk ? rgNorm || rgDigits : atual.rg;
    const rgMascara = rgNorm ? maskRg(rgNorm) : rgComoCpf ? maskDocumento(rgDigits) : atual.rgMascara;
    const mail = emailOk ? email : email ? email : atual.email;

    if (!nome && !digitsDocumento(cpf) && !rgSalvo && !mail) {
      this.alertas.erro('Informe ao menos o nome, o CPF, o CNPJ, o RG ou o e-mail.');
      return null;
    }

    const chave = chaveConvidado(nome, digitsDocumento(cpf), mail, rgSalvo);
    const conflito = this.convidados().some((g) => {
      if (g.key === atual.key) return false;
      return chaveConvidado(g.nome, digitsDocumento(g.cpf), g.email, g.rg) === chave;
    });
    if (chave && conflito) {
      this.alertas.erro('Este convidado já está na lista.');
      return null;
    }

    return {
      key: atual.key,
      nome,
      cpf,
      cpfMascara,
      rg: rgSalvo,
      rgMascara,
      email: mail,
    };
  }
}
