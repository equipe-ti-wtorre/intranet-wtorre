import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MassagemService } from '../../../services/massagem.service';
import { AlertasService } from '../../../services/alertas.service';
import {
  MassagemEmailLista,
  MassagemEmailTemplate,
  MassagemEmpresa,
  MassagemEvento,
} from '../../../models/massagem.model';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { formatData } from '../../massagem/shared/massagem-ui.utils';

type GrupoEventos = {
  chave: string;
  nome: string;
  cor: string;
  eventos: MassagemEvento[];
};

@Component({
  selector: 'app-massagem-admin-disparo',
  standalone: true,
  imports: [FormsModule, AdminModalComponent],
  templateUrl: './massagem-admin-disparo.component.html',
  styleUrl: './massagem-admin-disparo.component.scss',
})
export class MassagemAdminDisparoComponent implements OnInit {
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);

  readonly empresas = input<MassagemEmpresa[]>([]);
  readonly emailsTeste = input<string[]>([]);

  readonly loading = signal(true);
  readonly enviando = signal(false);
  readonly eventos = signal<MassagemEvento[]>([]);
  readonly listas = signal<MassagemEmailLista[]>([]);
  readonly templates = signal<MassagemEmailTemplate[]>([]);
  readonly filtroEmpresa = signal('');
  readonly eventosSubAba = signal<'ativos' | 'inativos'>('ativos');
  readonly gruposExpandidos = signal<Record<string, boolean>>({});
  readonly modalAberto = signal(false);
  readonly eventoEnvio = signal<MassagemEvento | null>(null);
  codigoTemplate = 'disparo_evento';

  readonly templatesAtivos = computed(() => {
    const list = this.templates().filter((t) => t.ativo);
    return [...list].sort((a, b) => {
      if (a.codigo === 'disparo_evento') return -1;
      if (b.codigo === 'disparo_evento') return 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  });

  readonly eventosFiltrados = computed(() => {
    const hoje = this.hojeIso();
    const sub = this.eventosSubAba();
    const filtro = this.filtroEmpresa().trim().toLowerCase();
    return this.eventos().filter((e) => {
      const data = (e.data || '').slice(0, 10);
      if (!data || data < hoje) return false;
      if (sub === 'ativos' && e.status !== 'ativo') return false;
      if (sub === 'inativos' && e.status === 'ativo') return false;
      if (filtro && (e.unidade || '').toLowerCase() !== filtro) return false;
      return true;
    });
  });

  readonly gruposDaSubAba = computed((): GrupoEventos[] => this.agruparEventos(this.eventosFiltrados()));

  readonly destinoResumo = computed(() => {
    const ev = this.eventoEnvio();
    if (!ev) return null;
    const unidade = (ev.unidade || '').trim().toLowerCase();
    const listasEmpresa = this.listas().filter(
      (l) => l.empresaNm.trim().toLowerCase() === unidade && l.totalEmails > 0
    );
    const totalEmails = listasEmpresa.reduce((acc, l) => acc + (l.totalEmails || 0), 0);
    if (totalEmails > 0) {
      const detalhe =
        listasEmpresa.length === 1
          ? `Lista “${listasEmpresa[0].nome}”: ${totalEmails} e-mail(s)`
          : `${listasEmpresa.length} listas da empresa: ${totalEmails} e-mail(s)`;
      return {
        tipo: 'lista' as const,
        titulo: listasEmpresa[0].empresaNm,
        detalhe,
      };
    }
    const testes = this.emailsTeste();
    if (testes.length) {
      return {
        tipo: 'teste' as const,
        titulo: 'E-mails de teste',
        detalhe: `Lista da empresa vazia — envio para ${testes.length} e-mail(s) de teste.`,
      };
    }
    return {
      tipo: 'vazio' as const,
      titulo: 'Nenhum destino',
      detalhe: 'Cadastre a lista da empresa na aba Listas.',
    };
  });

  ngOnInit(): void {
    this.carregar();
  }

  selecionarSubAba(sub: 'ativos' | 'inativos'): void {
    this.eventosSubAba.set(sub);
  }

  grupoExpandido(chave: string): boolean {
    return this.gruposExpandidos()[chave] !== false;
  }

  toggleGrupo(chave: string): void {
    const cur = this.gruposExpandidos();
    this.gruposExpandidos.set({ ...cur, [chave]: cur[chave] === false });
  }

  metaEvento(ev: MassagemEvento): string {
    const data = formatData(ev.data, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const local = ev.local || '—';
    const masso = ev.masso || '—';
    const n = ev.horarios?.length || 0;
    const dur = ev.duracaoMin || 60;
    return `${data} · ${local} · ${masso} · ${n} horários · ${dur} min`;
  }

  emptyListaEventos(): string {
    return this.eventosSubAba() === 'inativos' ? 'Nenhum evento inativo.' : 'Nenhum evento ativo.';
  }

  private agruparEventos(list: MassagemEvento[]): GrupoEventos[] {
    const empresas = this.empresas();
    const map = new Map<string, GrupoEventos>();
    for (const ev of list) {
      const nome = (ev.unidade || '').trim() || 'Sem empresa';
      const chave = nome.toLowerCase();
      let g = map.get(chave);
      if (!g) {
        const emp = empresas.find((e) => e.nm.trim().toLowerCase() === chave);
        g = { chave, nome, cor: emp?.cor || '#6B7280', eventos: [] };
        map.set(chave, g);
      }
      g.eventos.push(ev);
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  private hojeIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  carregar(): void {
    this.loading.set(true);
    this.api.listEventos(true).subscribe({
      next: (list) => {
        this.eventos.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar sessões.');
        this.loading.set(false);
      },
    });
    this.api.listEmailListas().subscribe({
      next: (list) => this.listas.set(list),
      error: () => this.listas.set([]),
    });
    this.api.listEmailTemplates().subscribe({
      next: (list) => this.templates.set(list),
      error: () => this.templates.set([]),
    });
  }

  rotuloTemplate(t: MassagemEmailTemplate): string {
    if (t.codigo === 'disparo_evento') return t.nome;
    return `${t.nome} (backup / envio manual)`;
  }

  abrirEnvio(ev: MassagemEvento): void {
    this.eventoEnvio.set(ev);
    const ativos = this.templatesAtivos();
    const padrao = ativos.find((t) => t.codigo === 'disparo_evento');
    this.codigoTemplate = padrao?.codigo || ativos[0]?.codigo || 'disparo_evento';
    this.modalAberto.set(true);
  }

  fecharEnvio(): void {
    this.modalAberto.set(false);
    this.eventoEnvio.set(null);
  }

  confirmarEnvio(): void {
    const ev = this.eventoEnvio();
    if (!ev) return;
    const dest = this.destinoResumo();
    if (dest?.tipo === 'vazio') {
      this.alertas.erro(dest.detalhe);
      return;
    }
    this.enviando.set(true);
    this.api.dispararEvento(ev.id, { codigoTemplate: this.codigoTemplate }).subscribe({
      next: (res) => {
        this.enviando.set(false);
        this.fecharEnvio();
        if (res.enviados > 0 || res.aceito) {
          this.alertas.sucesso(res.mensagem || `E-mail disparado (${res.enviados}).`);
        } else {
          this.alertas.erro(res.mensagem || 'Nenhum e-mail enviado.');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.enviando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao disparar e-mail.');
      },
    });
  }
}
