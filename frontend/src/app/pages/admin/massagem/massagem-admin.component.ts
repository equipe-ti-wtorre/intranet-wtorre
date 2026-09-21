import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MassagemService } from '../../../services/massagem.service';
import { AlertasService } from '../../../services/alertas.service';
import {
  MassagemAdminReserva,
  MassagemEmailTemplate,
  MassagemEmailTemplateMetaItem,
  MassagemEmpresa,
  MassagemEvento,
  MassagemFilaItem,
  MassagemPausa,
  MassagemPunicao,
} from '../../../models/massagem.model';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { formatData, statusBadgeClass, statusLabel } from '../../massagem/shared/massagem-ui.utils';
import { exportMassagemPresencaPdf } from '../../../utils/massagem-presenca-pdf.util';
import { MassagemAdminDisparoComponent } from './massagem-admin-disparo.component';
import { MassagemAdminEnviosComponent } from './massagem-admin-envios.component';
import { MassagemAdminListasComponent } from './massagem-admin-listas.component';
import { MassagemLayoutAdminComponent } from './massagem-layout-admin.component';

type Aba = 'empresas' | 'layout' | 'eventos' | 'email' | 'punicoes';
type SubAba = 'disparo' | 'envios' | 'templates' | 'listas';
type EventosSubAba = 'ativos' | 'inativos' | 'historico';
type SlotPreview =
  | { kind: 'sessao'; hora: string }
  | { kind: 'pausa'; nome: string; inicio: string; fim: string; duracaoMin: number };
type GrupoEventos = {
  chave: string;
  nome: string;
  cor: string;
  eventos: MassagemEvento[];
};

const UNIDADE_PERSONALIZADO = '__personalizado__';

@Component({
  selector: 'app-massagem-admin',
  standalone: true,
  imports: [
    FormsModule,
    AdminModalComponent,
    MassagemAdminDisparoComponent,
    MassagemAdminEnviosComponent,
    MassagemAdminListasComponent,
    MassagemLayoutAdminComponent,
  ],
  templateUrl: './massagem-admin.component.html',
  styleUrl: './massagem-admin.component.scss',
})
export class MassagemAdminComponent implements OnInit {
  private readonly api = inject(MassagemService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  readonly unidadePersonalizado = UNIDADE_PERSONALIZADO;
  readonly aba = signal<Aba>('eventos');
  readonly sub = signal<SubAba>('disparo');
  readonly eventosSubAba = signal<EventosSubAba>('ativos');
  readonly gruposExpandidos = signal<Record<string, boolean>>({});
  readonly loading = signal(true);
  readonly loadingEventos = signal(false);
  readonly loadingTemplates = signal(false);
  readonly saving = signal(false);
  readonly erroSalvarEvento = signal('');
  readonly empresas = signal<MassagemEmpresa[]>([]);
  readonly emailsTeste = signal<string[]>([]);
  readonly eventos = signal<MassagemEvento[]>([]);
  readonly templates = signal<MassagemEmailTemplate[]>([]);
  readonly templateMeta = signal<MassagemEmailTemplateMetaItem[]>([]);
  readonly buscaTemplate = signal('');
  private buscaTemplateTimer: ReturnType<typeof setTimeout> | null = null;
  buscaTemplateInput = '';
  readonly modalEmpresaAberto = signal(false);
  readonly modalEventoAberto = signal(false);
  readonly modalDetalhesAberto = signal(false);
  readonly previewAberto = signal(false);
  readonly previewHtml = signal<SafeHtml | ''>('');
  readonly previewAssunto = signal('');
  readonly editEmpresaId = signal<string | null>(null);
  readonly editEventoId = signal<string | null>(null);
  readonly eventoDetalhe = signal<MassagemEvento | null>(null);
  readonly reservas = signal<MassagemAdminReserva[]>([]);
  readonly fila = signal<MassagemFilaItem[]>([]);
  readonly punicoes = signal<MassagemPunicao[]>([]);
  readonly loadingPunicoes = signal(false);
  readonly savingPunicaoConfig = signal(false);
  readonly buscaPunicao = signal('');
  private buscaPunicaoTimer: ReturnType<typeof setTimeout> | null = null;
  buscaPunicaoInput = '';
  sessoesPunicaoInput = 1;
  readonly slotsPreview = signal<SlotPreview[]>([]);

  readonly presentesDetalhe = computed(() =>
    this.reservas()
      .filter((r) => r.status === 'presente')
      .sort((a, b) => a.hora.localeCompare(b.hora))
  );
  readonly faltasDetalhe = computed(() =>
    this.reservas()
      .filter((r) => r.status === 'falta')
      .sort((a, b) => a.hora.localeCompare(b.hora))
  );
  readonly punicoesFiltradas = computed(() => {
    const q = this.buscaPunicao().trim().toLowerCase();
    const list = this.punicoes();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.eventoNm || '').toLowerCase().includes(q)
    );
  });
  readonly unidadesPreset = computed(() => this.empresas().map((e) => e.nm));
  readonly modalEventoTitulo = computed(() =>
    this.editEventoId() ? 'Editar evento' : 'Criar evento'
  );
  readonly eventoEditando = computed(() => {
    const id = this.editEventoId();
    if (!id) return null;
    return this.eventos().find((e) => e.id === id) ?? null;
  });
  readonly templatesFiltrados = computed(() => {
    const q = this.buscaTemplate().trim().toLowerCase();
    const list = this.templates();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.nome.toLowerCase().includes(q) ||
        t.codigo.toLowerCase().includes(q) ||
        t.assunto.toLowerCase().includes(q)
    );
  });

  readonly eventosAtivos = computed(() => {
    const hoje = this.hojeIso();
    return this.eventos()
      .filter(
        (e) => e.status === 'ativo' && this.dataIso(e) >= hoje && !this.eventoEncerradoHoje(e)
      )
      .sort((a, b) => this.dataIso(a).localeCompare(this.dataIso(b)) || a.nm.localeCompare(b.nm));
  });

  readonly eventosInativos = computed(() => {
    const hoje = this.hojeIso();
    return this.eventos()
      .filter(
        (e) => e.status !== 'ativo' && this.dataIso(e) >= hoje && !this.eventoEncerradoHoje(e)
      )
      .sort((a, b) => this.dataIso(a).localeCompare(this.dataIso(b)) || a.nm.localeCompare(b.nm));
  });

  readonly eventosHistorico = computed(() => {
    const hoje = this.hojeIso();
    return this.eventos()
      .filter((e) => this.dataIso(e) < hoje || this.eventoEncerradoHoje(e))
      .sort((a, b) => this.dataIso(b).localeCompare(this.dataIso(a)) || a.nm.localeCompare(b.nm));
  });

  readonly gruposDaSubAba = computed((): GrupoEventos[] => {
    const sub = this.eventosSubAba();
    if (sub === 'historico') return [];
    const list = sub === 'inativos' ? this.eventosInativos() : this.eventosAtivos();
    return this.agruparEventos(list);
  });

  readonly podeExportarPresenca = computed(() => {
    const ev = this.eventoDetalhe();
    if (!ev) return false;
    return this.eventoJaEncerrado(ev);
  });

  formEmpresa = { nm: '', cor: '#6B7280' };

  formEvento = {
    nm: '',
    masso: '',
    local: '',
    unidadePreset: '' as string,
    unidadeCustom: '',
    data: '',
    inicio: '',
    fim: '',
    duracaoMin: 15,
    pausas: [] as MassagemPausa[],
    ativo: true,
  };

  formatDataCurta = (iso: string) =>
    formatData(iso, { day: '2-digit', month: 'short', year: 'numeric' });
  formatDataLong = (iso: string) =>
    formatData(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  badge = statusBadgeClass;
  label = statusLabel;

  ngOnInit(): void {
    this.aplicarQuery();
    this.carregar();
    if (this.aba() === 'eventos') {
      this.carregarEventos();
    }
    if (this.aba() === 'email' && this.sub() === 'templates') {
      this.carregarTemplates();
    }
    if (this.aba() === 'punicoes') {
      this.carregarPunicoes();
    }
  }

  private aplicarQuery(): void {
    const abaQ = this.route.snapshot.queryParamMap.get('aba');
    const subQ = this.route.snapshot.queryParamMap.get('sub');
    if (abaQ === 'templates') {
      this.aba.set('email');
      this.sub.set('templates');
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { aba: 'email', sub: 'templates' },
        replaceUrl: true,
      });
      return;
    }
    if (abaQ === 'email') {
      this.aba.set('email');
      this.sub.set(
        subQ === 'templates' || subQ === 'listas' || subQ === 'envios' ? subQ : 'disparo'
      );
      return;
    }
    if (abaQ === 'eventos' || abaQ === 'layout' || abaQ === 'empresas' || abaQ === 'punicoes') {
      this.aba.set(abaQ);
    }
  }

  selecionarAba(aba: Aba): void {
    this.aba.set(aba);
    const sub = aba === 'email' ? this.sub() || 'disparo' : null;
    if (aba === 'email' && !this.sub()) this.sub.set('disparo');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba, sub },
      replaceUrl: true,
    });
    if (aba === 'eventos') {
      this.carregarEventos();
    }
    if (aba === 'email' && this.sub() === 'templates') {
      this.carregarTemplates();
    }
    if (aba === 'punicoes') {
      this.carregarPunicoes();
    }
  }

  selecionarSub(sub: SubAba): void {
    this.aba.set('email');
    this.sub.set(sub);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba: 'email', sub },
      replaceUrl: true,
    });
    if (sub === 'templates') {
      this.carregarTemplates();
    }
  }

  carregar(): void {
    this.loading.set(true);
    this.api.listEmpresasAdmin().subscribe({
      next: (list) => {
        this.empresas.set(list);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar empresas.');
        this.loading.set(false);
      },
    });
    this.api.getConfig().subscribe({
      next: (cfg) => {
        this.emailsTeste.set(cfg.emailsTeste || []);
        this.sessoesPunicaoInput = Number(cfg.sessoesPunicao) >= 0 ? Number(cfg.sessoesPunicao) : 1;
      },
      error: () => this.emailsTeste.set([]),
    });
  }

  carregarEventos(opts?: { focarId?: string }): void {
    this.loadingEventos.set(true);
    this.api.listEventos(true).subscribe({
      next: (list) => {
        this.eventos.set(list);
        this.expandirGruposPadrao(list);
        this.loadingEventos.set(false);
        if (opts?.focarId) {
          const ev = list.find((e) => e.id === opts.focarId);
          if (ev) this.eventosSubAba.set(this.abaDestinoEvento(ev));
        }
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar eventos.');
        this.loadingEventos.set(false);
      },
    });
  }

  emptyListaEventos(): string {
    if (this.eventosSubAba() === 'inativos') return 'Nenhum evento inativo.';
    return 'Nenhum evento ativo. Clique em Criar evento para começar.';
  }

  private hojeIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private dataIso(ev: { data?: string } | MassagemEvento): string {
    return (ev.data || '').slice(0, 10);
  }

  private horaEncerramento(ev: {
    horarioFim?: string | null;
    horarios?: string[];
  }): string {
    const fim = String(ev.horarioFim || '').slice(0, 5);
    if (fim) return fim;
    const hrs = [...(ev.horarios || [])]
      .map((h) => String(h || '').slice(0, 5))
      .filter(Boolean)
      .sort();
    return hrs.length ? hrs[hrs.length - 1] : '';
  }

  /** Evento de hoje cujo horário de fim já passou — vai para Histórico, não Inativos. */
  private eventoEncerradoHoje(ev: {
    data?: string;
    horarioFim?: string | null;
    horarios?: string[];
  }): boolean {
    if (this.dataIso(ev) !== this.hojeIso()) return false;
    const hora = this.horaEncerramento(ev);
    return !!hora && hora <= this.agoraHora();
  }

  private eventoJaEncerrado(ev: {
    data?: string;
    horarioFim?: string | null;
    horarios?: string[];
  }): boolean {
    const data = this.dataIso(ev);
    const hoje = this.hojeIso();
    if (data && data < hoje) return true;
    return this.eventoEncerradoHoje(ev);
  }

  private abaDestinoEvento(ev: {
    status?: string;
    data?: string;
    horarioFim?: string | null;
    horarios?: string[];
  }): EventosSubAba {
    const data = this.dataIso(ev);
    const hoje = this.hojeIso();
    if ((data && data < hoje) || this.eventoEncerradoHoje(ev)) return 'historico';
    if (ev.status !== 'ativo') return 'inativos';
    return 'ativos';
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

  private expandirGruposPadrao(list: MassagemEvento[]): void {
    const hoje = this.hojeIso();
    const next: Record<string, boolean> = { ...this.gruposExpandidos() };
    for (const ev of list) {
      if ((ev.data || '').slice(0, 10) < hoje || this.eventoEncerradoHoje(ev)) continue;
      const chave = ((ev.unidade || '').trim() || 'Sem empresa').toLowerCase();
      if (next[chave] === undefined) next[chave] = true;
    }
    this.gruposExpandidos.set(next);
  }

  selecionarSubAbaEventos(sub: EventosSubAba): void {
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
    const data = this.formatDataLong(ev.data);
    const local = ev.local || '—';
    const masso = ev.masso || '—';
    const n = ev.horarios?.length || 0;
    const dur = ev.duracaoMin || 60;
    return `${data} · ${local} · ${masso} · ${n} horários · ${dur} min`;
  }

  ocupacaoTexto(ev: MassagemEvento): string {
    const o = ev.ocupacao;
    if (!o) return '—';
    return `${o.ocupados}/${o.total}`;
  }

  abrirNova(): void {
    this.editEmpresaId.set(null);
    this.formEmpresa = { nm: '', cor: '#6B7280' };
    this.modalEmpresaAberto.set(true);
  }

  abrirEditar(e: MassagemEmpresa): void {
    this.editEmpresaId.set(e.id);
    this.formEmpresa = { nm: e.nm, cor: e.cor || '#6B7280' };
    this.modalEmpresaAberto.set(true);
  }

  salvarEmpresa(): void {
    const body = {
      nm: this.formEmpresa.nm.trim(),
      cor: this.formEmpresa.cor.trim() || '#6B7280',
    };
    if (!body.nm) {
      this.alertas.erro('Informe o nome da empresa.');
      return;
    }
    this.saving.set(true);
    const id = this.editEmpresaId();
    const req = id ? this.api.updateEmpresa(id, body) : this.api.createEmpresa(body);
    req.subscribe({
      next: () => {
        this.alertas.sucesso(id ? 'Empresa atualizada.' : 'Empresa criada.');
        this.modalEmpresaAberto.set(false);
        this.saving.set(false);
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao salvar empresa.');
        this.saving.set(false);
      },
    });
  }

  excluirEmpresa(e: MassagemEmpresa): void {
    this.alertas.confirmarExclusao({ texto: `Excluir "${e.nm}"?` }).then((ok) => {
      if (!ok) return;
      this.api.removeEmpresa(e.id).subscribe({
        next: () => {
          this.alertas.sucesso('Empresa excluída.');
          this.carregar();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao excluir.');
        },
      });
    });
  }

  isUnidadeCustom(): boolean {
    return this.formEvento.unidadePreset === UNIDADE_PERSONALIZADO;
  }

  abrirNovoEvento(): void {
    this.editEventoId.set(null);
    this.erroSalvarEvento.set('');
    this.formEvento = {
      nm: '',
      masso: '',
      local: '',
      unidadePreset: '',
      unidadeCustom: '',
      data: '',
      inicio: '',
      fim: '',
      duracaoMin: 15,
      pausas: [],
      ativo: true,
    };
    this.slotsPreview.set([]);
    this.modalEventoAberto.set(true);
  }

  abrirEditarEvento(ev: MassagemEvento): void {
    this.erroSalvarEvento.set('');
    this.editEventoId.set(ev.id);
    this.preencherFormEvento(ev, ev.status === 'ativo');
    this.modalEventoAberto.set(true);
  }

  abrirClonarEvento(ev: MassagemEvento, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.erroSalvarEvento.set('');
    this.editEventoId.set(null);
    this.preencherFormEvento(ev, true, { limparData: true });
    this.modalEventoAberto.set(false);
    setTimeout(() => this.modalEventoAberto.set(true), 0);
  }

  private preencherFormEvento(
    ev: MassagemEvento,
    ativo: boolean,
    opts?: { limparData?: boolean }
  ): void {
    const hrs = ev.horarios || [];
    const dur = ev.duracaoMin || 50;
    const pausas = (Array.isArray(ev.pausas) ? ev.pausas : []).map((p) => ({
      nome: p.nome || '',
      inicio: p.inicio || '',
      fim: p.fim || '',
    }));
    let inicio = ev.horarioInicio || hrs[0] || '08:00';
    let fim = ev.horarioFim || '';
    if (!fim && hrs.length) {
      fim = hrs[hrs.length - 1];
    }
    if (!fim) {
      const lastPausa = pausas.reduce((acc, p) => (p.fim > acc ? p.fim : acc), '');
      fim = lastPausa || '17:00';
    }
    const presets = this.unidadesPreset();
    const isPreset = presets.includes(ev.unidade);
    this.formEvento = {
      nm: ev.nm,
      masso: ev.masso,
      local: ev.local,
      unidadePreset: isPreset ? ev.unidade : UNIDADE_PERSONALIZADO,
      unidadeCustom: isPreset ? '' : ev.unidade || '',
      data: opts?.limparData ? '' : this.dataIso(ev),
      inicio,
      fim,
      duracaoMin: dur,
      pausas,
      ativo,
    };
    this.gerarHorarios();
  }

  private agoraHora(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  fecharModalEvento(): void {
    this.modalEventoAberto.set(false);
    this.editEventoId.set(null);
    this.erroSalvarEvento.set('');
  }

  gerarHorarios(): void {
    this.slotsPreview.set(this.montarPreview());
  }

  adicionarPausa(): void {
    this.formEvento.pausas = [...this.formEvento.pausas, { nome: '', inicio: '', fim: '' }];
    this.gerarHorarios();
  }

  removerPausa(index: number): void {
    this.formEvento.pausas = this.formEvento.pausas.filter((_, i) => i !== index);
    this.gerarHorarios();
  }

  duracaoPausaLabel(p: MassagemPausa): string {
    const min = this.duracaoPausaMin(p);
    if (min <= 0) return '';
    return `${min} min de pausa`;
  }

  previewTrack(s: SlotPreview): string {
    return s.kind === 'sessao' ? `s-${s.hora}` : `p-${s.inicio}-${s.nome}`;
  }

  /** Duração exibida da pausa: intervalo De → Até (como no card). */
  private duracaoPausaMin(p: MassagemPausa): number {
    const a = this.parseMinutos(p.inicio);
    const b = this.parseMinutos(p.fim);
    if (a == null || b == null || b < a) return 0;
    return b - a;
  }

  private duracaoSessaoMin(): number {
    const dur = Number(this.formEvento.duracaoMin);
    return Number.isFinite(dur) && dur > 0 ? dur : 15;
  }

  /** Até é o último horário ainda em pausa; o bloqueio de sessões vai até Até + duração. */
  private fimExclusivoPausaMin(ateMin: number): number {
    return ateMin + this.duracaoSessaoMin();
  }

  private parseMinutos(hora: string): number | null {
    const s = String(hora || '').trim();
    if (!s) return null;
    const [hh, mm] = s.split(':').map(Number);
    if (![hh, mm].every((n) => Number.isFinite(n))) return null;
    return hh * 60 + mm;
  }

  private formatHora(min: number): string {
    const h = Math.floor(min / 60) % 24;
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private pausasValidas(): MassagemPausa[] {
    return this.formEvento.pausas
      .map((p) => ({
        nome: p.nome.trim(),
        inicio: p.inicio,
        fim: p.fim,
      }))
      .filter((p) => {
        const a = this.parseMinutos(p.inicio);
        const b = this.parseMinutos(p.fim);
        return a != null && b != null && b >= a;
      });
  }

  private montarPreview(): SlotPreview[] {
    const horarios = this.calcularSlots();
    const pausas = this.pausasValidas();
    const items: SlotPreview[] = [
      ...horarios.map((hora) => ({ kind: 'sessao' as const, hora })),
      ...pausas.map((p) => {
        return {
          kind: 'pausa' as const,
          nome: p.nome || 'Pausa',
          inicio: p.inicio,
          fim: p.fim,
          duracaoMin: this.duracaoPausaMin(p),
        };
      }),
    ];
    items.sort((a, b) => {
      const ha = a.kind === 'sessao' ? a.hora : a.inicio;
      const hb = b.kind === 'sessao' ? b.hora : b.inicio;
      return ha.localeCompare(hb);
    });
    return items;
  }

  private falhaSalvar(mensagem: string): void {
    this.erroSalvarEvento.set(mensagem);
    this.alertas.erro(mensagem);
  }

  private validarPausasParaSalvar(): MassagemPausa[] | null {
    const { inicio, fim } = this.formEvento;
    const winIni = this.parseMinutos(inicio);
    const winFim = this.parseMinutos(fim);
    const out: MassagemPausa[] = [];
    for (const p of this.formEvento.pausas) {
      const nome = p.nome.trim();
      if (!nome && !p.inicio && !p.fim) continue;
      if (!nome) {
        this.falhaSalvar('Informe o nome de cada pausa.');
        return null;
      }
      const a = this.parseMinutos(p.inicio);
      const b = this.parseMinutos(p.fim);
      if (a == null || b == null) {
        this.falhaSalvar(`Pausa "${nome}": informe os horários De e Até.`);
        return null;
      }
      if (a > b) {
        this.falhaSalvar(`Pausa "${nome}": o horário De deve ser anterior ou igual ao Até.`);
        return null;
      }
      const fimExclusivo = this.fimExclusivoPausaMin(b);
      if (winIni != null && winFim != null && (a < winIni || fimExclusivo > winFim)) {
        this.falhaSalvar(`Pausa "${nome}" deve ficar entre ${inicio} e ${fim}.`);
        return null;
      }
      out.push({ nome, inicio: this.formatHora(a), fim: this.formatHora(b) });
    }
    const sorted = [...out].sort(
      (x, y) => (this.parseMinutos(x.inicio) || 0) - (this.parseMinutos(y.inicio) || 0)
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const prevFimEx = this.fimExclusivoPausaMin(this.parseMinutos(sorted[i - 1].fim) || 0);
      const nextIni = this.parseMinutos(sorted[i].inicio) || 0;
      if (prevFimEx > nextIni) {
        this.falhaSalvar('As pausas não podem se sobrepor.');
        return null;
      }
    }
    return out;
  }

  private resolverUnidade(): string | null {
    if (this.formEvento.unidadePreset === UNIDADE_PERSONALIZADO) {
      const custom = this.formEvento.unidadeCustom.trim();
      return custom || null;
    }
    return this.formEvento.unidadePreset.trim() || null;
  }

  private calcularSlots(): string[] {
    const { inicio, fim, duracaoMin } = this.formEvento;
    if (!inicio || !fim) return [];
    const dur = Number(duracaoMin);
    if (!Number.isFinite(dur) || dur < 1) return [];
    const start = this.parseMinutos(inicio);
    const end = this.parseMinutos(fim);
    if (start == null || end == null) return [];
    const pausas = this.pausasValidas()
      .map((p) => ({
        ini: this.parseMinutos(p.inicio) as number,
        fim: this.fimExclusivoPausaMin(this.parseMinutos(p.fim) as number),
      }))
      .sort((a, b) => a.ini - b.ini);
    const slots: string[] = [];
    let cur = start;
    let guard = 0;
    while (cur <= end && guard < 500) {
      guard += 1;
      const slotEnd = cur + dur;
      const overlap = pausas.find((p) => cur < p.fim && slotEnd > p.ini);
      if (overlap) {
        cur = overlap.fim;
        continue;
      }
      slots.push(this.formatHora(cur));
      cur += dur;
    }
    const horaFim = this.formatHora(end);
    if (end >= start && !slots.includes(horaFim)) {
      const overlapFim = pausas.find((p) => end < p.fim && end + dur > p.ini);
      if (!overlapFim) slots.push(horaFim);
    }
    return slots;
  }

  async salvarEvento(): Promise<void> {
    this.erroSalvarEvento.set('');
    const { nm, masso, local, data, duracaoMin } = this.formEvento;
    const unidade = this.resolverUnidade();
    if (!nm.trim() || !masso.trim() || !local.trim() || !unidade || !data) {
      this.falhaSalvar('Preencha todos os campos obrigatórios.');
      return;
    }
    const dur = Number(duracaoMin);
    if (!Number.isFinite(dur) || dur < 1) {
      this.falhaSalvar('Informe a duração da sessão em minutos (mínimo 1).');
      return;
    }
    const pausas = this.validarPausasParaSalvar();
    if (!pausas) return;
    const horarios = this.calcularSlots();
    if (!horarios.length) {
      this.falhaSalvar('Nenhum horário gerado. Ajuste início, fim, duração e pausas.');
      return;
    }
    const dataIso = String(data).slice(0, 10);
    const hoje = this.hojeIso();
    if (dataIso < hoje) {
      this.falhaSalvar(
        'A data já passou. Altere para hoje ou uma data futura — senão o evento vai para o Histórico e não aparece na página de massagem.'
      );
      return;
    }
    const fim = String(this.formEvento.fim || '').slice(0, 5);
    if (dataIso === hoje && fim && fim <= this.agoraHora()) {
      const ok = await this.alertas.confirmar({
        titulo: 'Horário de hoje já encerrou',
        texto:
          'O último horário já passou. O evento será encerrado na hora e ficará no Histórico, sem aparecer na página de massagem. Deseja salvar mesmo assim?',
        confirmar: 'Salvar mesmo assim',
        icon: 'warning',
      });
      if (!ok) return;
    }
    const body = {
      nm: nm.trim(),
      masso: masso.trim(),
      local: local.trim(),
      unidade,
      data: dataIso,
      horarios,
      duracaoMin: dur,
      pausas,
      horarioInicio: this.formEvento.inicio,
      horarioFim: this.formEvento.fim,
      status: this.formEvento.ativo ? 'ativo' : 'inativo',
    };
    const editId = this.editEventoId();
    this.saving.set(true);
    const req = editId ? this.api.updateEvento(editId, body) : this.api.createEvento(body);
    req.subscribe({
      next: (salvo) => {
        this.saving.set(false);
        this.alertas.sucesso(editId ? 'Evento atualizado.' : 'Evento criado.');
        this.fecharModalEvento();
        this.carregarEventos({ focarId: salvo?.id || editId || undefined });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.falhaSalvar(err.error?.mensagem || 'Erro ao salvar evento.');
      },
    });
  }

  excluirEvento(ev?: MassagemEvento): void {
    const id = ev?.id ?? this.editEventoId();
    const nome = ev?.nm ?? this.formEvento.nm;
    if (!id) return;
    this.alertas
      .confirmarExclusao({
        texto: `Excluir "${nome}"? O evento será removido permanentemente, junto com as reservas e a fila.`,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.removeEvento(id).subscribe({
          next: () => {
            this.alertas.sucesso('Evento excluído.');
            this.fecharModalEvento();
            if (this.eventoDetalhe()?.id === id) this.fecharDetalhes();
            this.carregarEventos();
          },
          error: (err: HttpErrorResponse) => {
            this.alertas.erro(err.error?.mensagem || 'Erro ao excluir evento.');
          },
        });
      });
  }

  toggleStatusEvento(): void {
    const ev = this.eventoEditando();
    if (!ev) return;
    const next = ev.status === 'ativo' ? 'inativo' : 'ativo';
    this.api.updateEvento(ev.id, { status: next }).subscribe({
      next: () => {
        this.alertas.sucesso(
          next === 'ativo'
            ? 'Evento ativado — agora aparece no início.'
            : 'Evento desativado — oculto no início.'
        );
        this.formEvento.ativo = next === 'ativo';
        this.carregarEventos();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao alterar status.');
      },
    });
  }

  abrirDetalhes(ev: MassagemEvento): void {
    this.eventoDetalhe.set(ev);
    this.modalDetalhesAberto.set(true);
    this.api.adminReservas(ev.id).subscribe({
      next: (list) => this.reservas.set(list),
      error: () => this.reservas.set([]),
    });
    this.api.listFila(ev.id).subscribe({
      next: (res) => this.fila.set(res.fila),
      error: () => this.fila.set([]),
    });
  }

  fecharDetalhes(): void {
    this.modalDetalhesAberto.set(false);
    this.eventoDetalhe.set(null);
    this.reservas.set([]);
    this.fila.set([]);
  }

  exportarPdf(): void {
    const ev = this.eventoDetalhe();
    if (!ev) return;
    if (!this.eventoJaEncerrado(ev)) {
      this.alertas.erro('O PDF de presença fica disponível após o término do evento.');
      return;
    }
    this.api.adminReservas(ev.id).subscribe({
      next: (list) => {
        this.reservas.set(list);
        try {
          exportMassagemPresencaPdf({
            titulo: ev.nm,
            unidade: ev.unidade || '—',
            dataLabel: this.formatDataLong(ev.data),
            dataIso: this.dataIso(ev),
            duracaoMin: ev.duracaoMin,
            reservas: list,
          });
          this.alertas.sucesso('PDF exportado.');
        } catch {
          this.alertas.erro('Erro ao gerar PDF.');
        }
      },
      error: () => this.alertas.erro('Erro ao exportar PDF.'),
    });
  }

  horaFim(hora: string): string {
    const dur = this.eventoDetalhe()?.duracaoMin || 50;
    const [h, m] = hora.split(':').map(Number);
    const t = h * 60 + m + dur;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }

  carregarPunicoes(): void {
    this.loadingPunicoes.set(true);
    this.api.listPunicoesAdmin().subscribe({
      next: (list) => {
        this.punicoes.set(list);
        this.loadingPunicoes.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar punições.');
        this.loadingPunicoes.set(false);
      },
    });
  }

  onBuscaPunicao(value: string): void {
    this.buscaPunicaoInput = value;
    if (this.buscaPunicaoTimer) clearTimeout(this.buscaPunicaoTimer);
    this.buscaPunicaoTimer = setTimeout(() => {
      this.buscaPunicao.set(value);
    }, 300);
  }

  salvarSessoesPunicao(): void {
    const n = Number(this.sessoesPunicaoInput);
    if (!Number.isInteger(n) || n < 0 || n > 30) {
      this.alertas.erro('Informe um número inteiro entre 0 e 30.');
      return;
    }
    this.savingPunicaoConfig.set(true);
    this.api.saveConfig({ sessoesPunicao: n }).subscribe({
      next: (cfg) => {
        this.sessoesPunicaoInput = cfg.sessoesPunicao;
        this.savingPunicaoConfig.set(false);
        this.alertas.sucesso('Configuração de punição salva.');
      },
      error: (err: HttpErrorResponse) => {
        this.savingPunicaoConfig.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao salvar configuração.');
      },
    });
  }

  labelLiberaEm(p: MassagemPunicao): string {
    if (p.liberaEm) {
      return `após ${this.formatDataCurta(p.liberaEm)}`;
    }
    return 'após o próximo evento';
  }

  ocupacaoPct(ev: MassagemEvento): number {
    return Math.round(ev.ocupacao?.pct ?? 0);
  }

  carregarTemplates(): void {
    this.loadingTemplates.set(true);
    this.api.listEmailTemplates().subscribe({
      next: (list) => {
        this.templates.set(list);
        this.loadingTemplates.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar templates.');
        this.loadingTemplates.set(false);
      },
    });
    this.api.getEmailTemplateMeta().subscribe({
      next: (meta) => this.templateMeta.set(meta.codigos || []),
      error: () => this.templateMeta.set([]),
    });
  }

  onBuscaTemplate(value: string): void {
    this.buscaTemplateInput = value;
    if (this.buscaTemplateTimer) clearTimeout(this.buscaTemplateTimer);
    this.buscaTemplateTimer = setTimeout(() => {
      this.buscaTemplate.set(value);
    }, 300);
  }

  abrirNovoTemplate(): void {
    void this.router.navigate(['/admin/massagem/templates/novo']);
  }

  abrirEditarTemplate(t: MassagemEmailTemplate): void {
    void this.router.navigate(['/admin/massagem/templates', t.id]);
  }

  excluirTemplate(t: MassagemEmailTemplate): void {
    this.alertas
      .confirmarExclusao({
        texto: `Excluir o template "${t.nome}"? O envio voltará ao HTML padrão do sistema.`,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.removeEmailTemplate(t.id).subscribe({
          next: () => {
            this.alertas.sucesso('Template excluído.');
            this.carregarTemplates();
          },
          error: (err: HttpErrorResponse) => {
            this.alertas.erro(err.error?.mensagem || 'Erro ao excluir template.');
          },
        });
      });
  }

  previewTemplate(t: MassagemEmailTemplate): void {
    this.api.previewEmailTemplate({ id: t.id }).subscribe({
      next: (res) => {
        this.previewAssunto.set(res.assunto || '');
        this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(res.html || ''));
        this.previewAberto.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao gerar preview.');
      },
    });
  }

  fecharPreview(): void {
    this.previewAberto.set(false);
    this.previewHtml.set('');
    this.previewAssunto.set('');
  }

  codigoLabel(codigo: string): string {
    return this.templateMeta().find((m) => m.codigo === codigo)?.nome || codigo;
  }
}
