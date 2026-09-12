import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { ToastComponent } from '../../shared/toast/toast.component';
import { ToastService } from '../../shared/toast/toast.service';
import { AssinaturasService } from '../../services/assinaturas.service';
import { AssinaturaItem, AssinaturaPayload } from '../../models/assinatura.model';
import {
  isDominioMapeado,
  isEmailPermitido,
  listarDominios,
} from '../../utils/assinatura-domains';
import { AssinaturaCardComponent } from './assinatura-card/assinatura-card.component';
import { AdminModalComponent } from '../../shared/admin/admin-modal/admin-modal.component';
import { buildAssinaturaHtmlForOwa } from '../../utils/assinatura-html.util';
import { copyAssinaturaHtmlToClipboard } from '../../utils/assinatura-clipboard.util';

let idSeq = 0;

function nextId(): string {
  idSeq += 1;
  return `sig-${idSeq}`;
}

@Component({
  selector: 'app-assinaturas',
  standalone: true,
  imports: [
    PublicChromeComponent,
    FooterComponent,
    ToastComponent,
    FormsModule,
    AssinaturaCardComponent,
    AdminModalComponent,
  ],
  templateUrl: './assinaturas.component.html',
  styleUrl: './assinaturas.component.scss',
})
export class AssinaturasComponent implements OnInit {
  private readonly assinaturasService = inject(AssinaturasService);
  private readonly toast = inject(ToastService);

  readonly carregando = signal(false);
  readonly gerando = signal(false);
  readonly erroMsal = signal<string | null>(null);
  readonly pessoais = signal<AssinaturaItem[]>([]);
  readonly compartilhadas = signal<AssinaturaItem[]>([]);

  readonly emailCaixa = signal('');
  readonly emailsCaixa = signal('');
  readonly nomeCaixa = signal('');
  readonly cargoCaixa = signal('');
  readonly telefoneCaixa = signal('');
  readonly celularCaixa = signal('');

  readonly dominiosAceitos = listarDominios().join(', ');
  readonly emailPadrao = signal('');
  readonly modalCompartilhadaAberto = signal(false);
  readonly instrucoesOwaAbertas = signal(false);

  readonly selecionadasValidas = computed(() =>
    [...this.pessoais(), ...this.compartilhadas()].filter(
      (a) => a.selecionada && this.itemValido(a)
    )
  );

  readonly temSelecionadas = computed(() => this.selecionadasValidas().length > 0);

  ngOnInit(): void {
    this.carregarPerfil();
  }

  private itemValido(item: AssinaturaItem): boolean {
    return isEmailPermitido(item.email) && isDominioMapeado(item.email);
  }

  private normalizarEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  isEmailPadrao(email: string): boolean {
    return this.normalizarEmail(email) === this.emailPadrao();
  }

  private sincronizarPadrao(): void {
    const selecionadas = this.selecionadasValidas();
    if (!selecionadas.length) {
      this.emailPadrao.set('');
      return;
    }

    const atual = this.emailPadrao();
    if (!atual || !selecionadas.some((a) => this.normalizarEmail(a.email) === atual)) {
      const preferida = selecionadas.find((a) => a.tipo === 'pessoal') ?? selecionadas[0];
      this.emailPadrao.set(this.normalizarEmail(preferida.email));
    }
  }

  private parseEmails(texto: string): string[] {
    return [
      ...new Set(
        texto
          .split(/[\n,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
  }

  carregarPerfil(): void {
    this.carregando.set(true);
    this.erroMsal.set(null);

    this.assinaturasService.carregarMe().subscribe({
      next: (perfil) => {
        const items: AssinaturaItem[] = perfil.aliases
          .filter((email) => isEmailPermitido(email))
          .map((email) => ({
          id: nextId(),
          email,
          tipo: 'pessoal',
          nome: perfil.nome,
          cargo: perfil.cargo,
          telefone: perfil.telefone,
          celular: perfil.celular,
          selecionada: isDominioMapeado(email),
        }));
        this.pessoais.set(items);
        this.sincronizarPadrao();
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.carregando.set(false);
        const msg =
          err.error?.mensagem ||
          err.message ||
          'Não foi possível carregar seus dados. Faça login com Microsoft.';
        this.erroMsal.set(msg);
      },
    });
  }

  atualizarPessoal(id: string, item: AssinaturaItem): void {
    this.pessoais.update((list) => list.map((a) => (a.id === id ? item : a)));
    this.sincronizarPadrao();
  }

  atualizarCompartilhada(id: string, item: AssinaturaItem): void {
    this.compartilhadas.update((list) => list.map((a) => (a.id === id ? item : a)));
    this.sincronizarPadrao();
  }

  abrirModalCompartilhada(): void {
    const ref = this.pessoais()[0];
    this.nomeCaixa.set(ref?.nome || '');
    this.cargoCaixa.set(ref?.cargo || '');
    this.telefoneCaixa.set(ref?.telefone || '');
    this.celularCaixa.set(ref?.celular || '');
    this.modalCompartilhadaAberto.set(true);
  }

  fecharModalCompartilhada(): void {
    this.modalCompartilhadaAberto.set(false);
  }

  private limparFormCompartilhada(): void {
    this.emailsCaixa.set('');
    this.emailCaixa.set('');
    this.nomeCaixa.set('');
    this.cargoCaixa.set('');
    this.telefoneCaixa.set('');
    this.celularCaixa.set('');
  }

  adicionarCaixa(): void {
    const emailsTexto = this.emailsCaixa().trim() || this.emailCaixa().trim();
    const nome = this.nomeCaixa().trim();
    const cargo = this.cargoCaixa().trim();
    const telefone = this.telefoneCaixa().trim();
    const celular = this.celularCaixa().trim();

    if (!emailsTexto) {
      this.toast.error('Informe ao menos um e-mail da caixa compartilhada.');
      return;
    }

    const emails = this.parseEmails(emailsTexto);
    if (!emails.length) {
      this.toast.error('Nenhum e-mail válido encontrado.');
      return;
    }

    const existentes = new Set(this.compartilhadas().map((c) => c.email));
    const novos: AssinaturaItem[] = [];
    const invalidos: string[] = [];
    const naoMapeados: string[] = [];

    const ref = this.pessoais()[0];

    for (const email of emails) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        invalidos.push(email);
        continue;
      }
      if (!isEmailPermitido(email)) {
        invalidos.push(email);
        continue;
      }
      if (!isDominioMapeado(email)) {
        naoMapeados.push(email);
        continue;
      }
      if (existentes.has(email) || novos.some((n) => n.email === email)) {
        continue;
      }
      novos.push({
        id: nextId(),
        email,
        tipo: 'compartilhada',
        nome: nome || ref?.nome,
        cargo: cargo || ref?.cargo,
        telefone: telefone || ref?.telefone,
        celular: celular || ref?.celular,
        selecionada: true,
      });
    }

    if (!novos.length) {
      if (naoMapeados.length) {
        this.toast.error(
          `Domínio sem template de assinatura: ${naoMapeados.join(', ')}. Domínios aceitos: ${this.dominiosAceitos}.`
        );
      } else if (invalidos.length) {
        this.toast.error('E-mail(s) inválido(s) ou domínio não permitido.');
      } else {
        this.toast.error('Todos os e-mails informados já foram adicionados.');
      }
      return;
    }

    this.compartilhadas.update((list) => [...list, ...novos]);
    this.sincronizarPadrao();
    this.limparFormCompartilhada();
    this.fecharModalCompartilhada();

    if (naoMapeados.length || invalidos.length) {
      const partes: string[] = [`${novos.length} caixa(s) adicionada(s).`];
      if (naoMapeados.length) {
        partes.push(`${naoMapeados.length} ignorado(s) por domínio não mapeado.`);
      }
      if (invalidos.length) {
        partes.push(`${invalidos.length} ignorado(s) por formato ou domínio não permitido.`);
      }
      this.toast.error(partes.join(' '));
    } else {
      this.toast.success(`${novos.length} caixa(s) adicionada(s).`);
    }
  }

  removerCaixa(id: string): void {
    this.compartilhadas.update((list) => list.filter((a) => a.id !== id));
    this.sincronizarPadrao();
  }

  definirPadrao(email: string): void {
    const norm = this.normalizarEmail(email);
    this.emailPadrao.set(norm);

    this.pessoais.update((list) =>
      list.map((a) =>
        this.normalizarEmail(a.email) === norm ? { ...a, selecionada: true } : a
      )
    );
    this.compartilhadas.update((list) =>
      list.map((a) =>
        this.normalizarEmail(a.email) === norm ? { ...a, selecionada: true } : a
      )
    );
  }

  toggleInstrucoesOwa(): void {
    this.instrucoesOwaAbertas.update((v) => !v);
  }

  private itemToPayload(item: AssinaturaItem): AssinaturaPayload {
    return {
      email: item.email,
      tipo: item.tipo,
      nome: item.nome,
      cargo: item.cargo,
      telefone: item.telefone,
      celular: item.celular,
      dominioEstilo: item.dominioEstilo,
    };
  }

  async copiarParaOutlookWeb(item: AssinaturaItem): Promise<void> {
    if (!this.itemValido(item)) {
      this.toast.error('Este domínio não possui template de assinatura.');
      return;
    }

    const html = buildAssinaturaHtmlForOwa(this.itemToPayload(item));
    if (!html) {
      this.toast.error('Não foi possível gerar o HTML da assinatura.');
      return;
    }

    try {
      const mode = await copyAssinaturaHtmlToClipboard(html);
      if (mode === 'html') {
        this.toast.success(`Assinatura de ${item.email} copiada. Cole no Outlook Web (Ctrl+V).`);
      } else {
        this.toast.success(
          `HTML copiado como texto. Cole no editor de assinatura do Outlook Web com Ctrl+V.`
        );
      }
      if (!this.instrucoesOwaAbertas()) {
        this.instrucoesOwaAbertas.set(true);
      }
    } catch {
      this.toast.error('Não foi possível copiar. Verifique as permissões do navegador.');
    }
  }

  baixarScript(): void {
    this.sincronizarPadrao();
    const selecionadas = this.selecionadasValidas();

    if (!selecionadas.length) return;

    const emailPadrao = this.emailPadrao();
    if (!emailPadrao) {
      this.toast.error('Selecione a assinatura padrao do Outlook.');
      return;
    }

    const assinaturas: AssinaturaPayload[] = selecionadas.map((a) => {
      if (a.tipo === 'compartilhada') {
        return {
          email: a.email,
          tipo: 'compartilhada',
          nome: a.nome,
          cargo: a.cargo,
          telefone: a.telefone,
          celular: a.celular,
        };
      }
      return {
        email: a.email,
        tipo: 'pessoal',
        nome: a.nome,
        cargo: a.cargo,
        telefone: a.telefone,
        celular: a.celular,
      };
    });

    this.gerando.set(true);
    this.assinaturasService.gerarScript({ assinaturas, emailPadrao }).subscribe({
      next: (blob) => {
        this.assinaturasService.downloadBlob(blob, 'Instalar-Assinaturas.bat');
        this.gerando.set(false);
        this.toast.success('Instalador baixado com sucesso.');
      },
      error: async (err: HttpErrorResponse) => {
        this.gerando.set(false);
        let msg = 'Erro ao gerar o script.';
        if (err.error instanceof Blob) {
          try {
            const text = await err.error.text();
            const parsed = JSON.parse(text);
            msg = parsed.mensagem || msg;
          } catch {
            /* ignora */
          }
        } else if (err.error?.mensagem) {
          msg = err.error.mensagem;
        }
        this.toast.error(msg);
      },
    });
  }
}
