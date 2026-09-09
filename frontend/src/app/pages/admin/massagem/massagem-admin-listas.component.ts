import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MassagemService } from '../../../services/massagem.service';
import { AlertasService } from '../../../services/alertas.service';
import {
  MassagemEmailLista,
  MassagemEmailListaItem,
  MassagemEmpresa,
} from '../../../models/massagem.model';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';

@Component({
  selector: 'app-massagem-admin-listas',
  standalone: true,
  imports: [FormsModule, AdminModalComponent],
  templateUrl: './massagem-admin-listas.component.html',
  styleUrl: './massagem-admin-listas.component.scss',
})
export class MassagemAdminListasComponent implements OnInit {
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);

  readonly empresas = input<MassagemEmpresa[]>([]);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly adding = signal(false);
  readonly listas = signal<MassagemEmailLista[]>([]);
  readonly itens = signal<MassagemEmailListaItem[]>([]);
  readonly busca = signal('');
  readonly buscaItens = signal('');
  private buscaTimer: ReturnType<typeof setTimeout> | null = null;
  private buscaItensTimer: ReturnType<typeof setTimeout> | null = null;
  buscaInput = '';
  buscaItensInput = '';

  readonly modalListaAberto = signal(false);
  readonly modalItensAberto = signal(false);
  readonly editListaId = signal<string | null>(null);
  readonly listaItens = signal<MassagemEmailLista | null>(null);

  formLista = { empresaId: '', nome: '', descricao: '' };
  formItem = { email: '', nome: '' };

  readonly listasFiltradas = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const list = this.listas();
    if (!q) return list;
    return list.filter(
      (l) =>
        l.nome.toLowerCase().includes(q) ||
        (l.descricao || '').toLowerCase().includes(q) ||
        l.empresaNm.toLowerCase().includes(q)
    );
  });

  readonly itensFiltrados = computed(() => {
    const q = this.buscaItens().trim().toLowerCase();
    const list = this.itens();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.email.toLowerCase().includes(q) ||
        (i.nome || '').toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.loading.set(true);
    this.api.listEmailListas().subscribe({
      next: (list) => {
        this.listas.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar listas.');
        this.loading.set(false);
      },
    });
  }

  onBusca(value: string): void {
    this.buscaInput = value;
    if (this.buscaTimer) clearTimeout(this.buscaTimer);
    this.buscaTimer = setTimeout(() => this.busca.set(value), 300);
  }

  onBuscaItens(value: string): void {
    this.buscaItensInput = value;
    if (this.buscaItensTimer) clearTimeout(this.buscaItensTimer);
    this.buscaItensTimer = setTimeout(() => this.buscaItens.set(value), 300);
  }

  abrirNova(): void {
    const empresas = this.empresas();
    if (!empresas.length) {
      this.alertas.erro('Cadastre uma empresa na aba Empresas antes de criar a lista.');
      return;
    }
    this.editListaId.set(null);
    this.formLista = { empresaId: '', nome: '', descricao: '' };
    this.modalListaAberto.set(true);
  }

  onEmpresaChange(empresaId: string): void {
    this.formLista.empresaId = empresaId;
  }

  abrirEditar(lista: MassagemEmailLista): void {
    this.editListaId.set(lista.id);
    this.formLista = {
      empresaId: lista.empresaId,
      nome: lista.nome,
      descricao: lista.descricao || '',
    };
    this.modalListaAberto.set(true);
  }

  salvarLista(): void {
    const nome = this.formLista.nome.trim();
    if (!nome) {
      this.alertas.erro('Informe o nome da lista.');
      return;
    }
    const id = this.editListaId();
    this.saving.set(true);
    const descricao = this.formLista.descricao.trim();
    const req = id
      ? this.api.updateEmailLista(id, { nome, descricao })
      : this.api.createEmailLista({
          empresaId: this.formLista.empresaId,
          nome,
          descricao,
        });
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalListaAberto.set(false);
        this.alertas.sucesso(id ? 'Lista atualizada.' : 'Lista criada.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao salvar lista.');
      },
    });
  }

  excluirLista(lista: MassagemEmailLista): void {
    this.alertas
      .confirmarExclusao({
        texto: `Excluir a lista “${lista.nome}”? Os e-mails cadastrados também serão removidos.`,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.removeEmailLista(lista.id).subscribe({
          next: () => {
            this.alertas.sucesso('Lista excluída.');
            this.carregar();
          },
          error: (err: HttpErrorResponse) => {
            this.alertas.erro(err.error?.mensagem || 'Erro ao excluir lista.');
          },
        });
      });
  }

  abrirItens(lista: MassagemEmailLista): void {
    this.listaItens.set(lista);
    this.formItem = { email: '', nome: '' };
    this.buscaItensInput = '';
    this.buscaItens.set('');
    this.modalItensAberto.set(true);
    this.carregarItens(lista.id);
  }

  fecharItens(): void {
    this.modalItensAberto.set(false);
    this.listaItens.set(null);
    this.itens.set([]);
    this.carregar();
  }

  carregarItens(listaId: string): void {
    this.api.listEmailListaItens(listaId).subscribe({
      next: (list) => this.itens.set(list),
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar e-mails.');
        this.itens.set([]);
      },
    });
  }

  adicionarItem(): void {
    const lista = this.listaItens();
    if (!lista) return;
    const email = this.formItem.email.trim();
    if (!email) {
      this.alertas.erro('Informe o e-mail.');
      return;
    }
    this.adding.set(true);
    this.api
      .addEmailListaItem(lista.id, { email, nome: this.formItem.nome.trim() })
      .subscribe({
        next: () => {
          this.adding.set(false);
          this.formItem = { email: '', nome: '' };
          this.alertas.sucesso('E-mail adicionado.');
          this.carregarItens(lista.id);
        },
        error: (err: HttpErrorResponse) => {
          this.adding.set(false);
          this.alertas.erro(err.error?.mensagem || 'Erro ao adicionar e-mail.');
        },
      });
  }

  removerItem(item: MassagemEmailListaItem): void {
    const lista = this.listaItens();
    if (!lista) return;
    this.alertas
      .confirmarExclusao({ texto: `Remover ${item.email} da lista?` })
      .then((ok) => {
        if (!ok) return;
        this.api.removeEmailListaItem(lista.id, item.id).subscribe({
          next: () => {
            this.alertas.sucesso('E-mail removido.');
            this.carregarItens(lista.id);
          },
          error: (err: HttpErrorResponse) => {
            this.alertas.erro(err.error?.mensagem || 'Erro ao remover e-mail.');
          },
        });
      });
  }

}
