import { Component, Input, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  CamaroteUnidade,
  CamarotesDashboard,
  ReceitaTrimestre,
  SituacaoUnidade,
  VencimentoMes,
} from '../../models/camarote.model';
import { CamarotesService } from '../../services/camarotes.service';
import { AlertasService } from '../../services/alertas.service';
import {
  CamarotesKpiModalComponent,
  KpiModalModo,
} from './camarotes-kpi-modal.component';
import { formatarAndar, normalizarAndarChave } from '../../utils/camarote-andar.util';

const TIPOS_ORDEM = ['Cessionário', 'Patrocinador', 'SEP', 'Outros'] as const;

const CORES_TIPO: Record<string, string> = {
  Cessionário: 'var(--wtorre)',
  Patrocinador: 'var(--warn, #e0a52e)',
  SEP: 'var(--status-green)',
  Outros: 'var(--ink-dim)',
};

interface ModalDrilldownConfig {
  titulo: string;
  subtitulo: string;
  modo: KpiModalModo;
  fetch: {
    tipo: 'camarote';
    situacao?: SituacaoUnidade;
    setor?: string;
    dias_restantes_min?: number;
    dias_restantes_max?: number;
  };
  filtro?: (u: CamaroteUnidade) => boolean;
  countEsperado?: number;
  vazioMsg?: string;
}

interface KpiConfig {
  titulo: string;
  subtitulo: (diasVenceBreve: number) => string;
  modo: KpiModalModo;
  contagem: (dashboard: CamarotesDashboard) => number;
}

const KPI_CONFIG: Record<SituacaoUnidade, KpiConfig> = {
  vencido: {
    titulo: 'Vence hoje / vencidos',
    subtitulo: () => 'Contratos que vencem hoje ou já estão vencidos',
    modo: 'contrato',
    contagem: (d) => d.camarotes.alertas.vencidos,
  },
  vence_breve: {
    titulo: 'Vencem em 90 dias',
    subtitulo: () => 'Contratos que vencem entre 31 e 90 dias',
    modo: 'contrato',
    contagem: (d) => d.camarotes.alertas.vence_breve,
  },
  vago: {
    titulo: 'Camarotes vagos',
    subtitulo: () => 'Unidades disponíveis para locação',
    modo: 'vago',
    contagem: (d) => d.camarotes.alertas.vagos,
  },
  ativo: {
    titulo: 'Ocupados',
    subtitulo: () => 'Contratos ativos em operação',
    modo: 'contrato',
    contagem: (d) => d.camarotes.alertas.ativos,
  },
};

function temCessionario(u: CamaroteUnidade): boolean {
  const c = u.cessionario?.trim().toLowerCase() || '';
  return !!c && c !== '-' && c !== 'vago' && c !== '—';
}

@Component({
  selector: 'app-camarotes-dashboard',
  standalone: true,
  imports: [DecimalPipe, CamarotesKpiModalComponent],
  templateUrl: './camarotes-dashboard.component.html',
  styleUrl: './camarotes-dashboard.component.scss',
})
export class CamarotesDashboardComponent {
  @Input({ required: true }) dashboard!: CamarotesDashboard;

  private readonly camarotesService = inject(CamarotesService);
  private readonly alertas = inject(AlertasService);

  readonly setores = ['Oeste', 'Norte', 'Leste', 'Sul'];

  readonly modalAberto = signal(false);
  readonly modalCarregando = signal(false);
  readonly modalErro = signal('');
  readonly modalUnidades = signal<CamaroteUnidade[]>([]);
  readonly modalTitulo = signal('');
  readonly modalSubtitulo = signal('');
  readonly modalModo = signal<KpiModalModo>('contrato');

  moeda(valor: number | null | undefined): string {
    if (valor == null) return '—';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  moedaCompacta(valor: number | null | undefined): string {
    if (valor == null) return '—';
    const abs = Math.abs(valor);
    if (abs >= 1_000_000) {
      const mi = valor / 1_000_000;
      return `R$ ${mi.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: mi % 1 === 0 ? 0 : 1 })} mi`;
    }
    if (abs >= 1_000) {
      const mil = valor / 1_000;
      return `R$ ${mil.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: mil % 1 === 0 ? 0 : 1 })} mil`;
    }
    return this.moeda(valor);
  }

  totalUnidades(): number {
    const a = this.dashboard.camarotes.alertas;
    return a.ativos + a.vagos + a.vencidos + a.vence_30d + a.vence_breve;
  }

  ocupacaoPct(): number {
    const total = this.totalUnidades();
    if (!total) return 0;
    return Math.round((this.dashboard.camarotes.alertas.ativos / total) * 100);
  }

  kpiClickable(situacao: SituacaoUnidade): boolean {
    return KPI_CONFIG[situacao].contagem(this.dashboard) > 0;
  }

  abrirKpi(situacao: SituacaoUnidade): void {
    const config = KPI_CONFIG[situacao];
    if (situacao === 'vencido') {
      this.abrirModal({
        titulo: config.titulo,
        subtitulo: config.subtitulo(this.dashboard.dias_vence_breve),
        modo: config.modo,
        fetch: { tipo: 'camarote', dias_restantes_max: 0 },
        countEsperado: config.contagem(this.dashboard),
      });
      return;
    }
    if (situacao === 'vence_breve') {
      this.abrirModal({
        titulo: config.titulo,
        subtitulo: config.subtitulo(this.dashboard.dias_vence_breve),
        modo: config.modo,
        fetch: { tipo: 'camarote', dias_restantes_min: 31, dias_restantes_max: 90 },
        countEsperado: config.contagem(this.dashboard),
      });
      return;
    }
    this.abrirModal({
      titulo: config.titulo,
      subtitulo: config.subtitulo(this.dashboard.dias_vence_breve),
      modo: config.modo,
      fetch: { tipo: 'camarote', situacao },
      countEsperado: config.contagem(this.dashboard),
    });
  }

  vence30dClickable(): boolean {
    return (this.dashboard.camarotes.alertas.vence_30d ?? 0) > 0;
  }

  abrirVence30d(): void {
    const count = this.dashboard.camarotes.alertas.vence_30d ?? 0;
    this.abrirModal({
      titulo: 'Vencem em 30 dias',
      subtitulo: 'Contratos que vencem entre 1 e 30 dias',
      modo: 'contrato',
      fetch: { tipo: 'camarote', dias_restantes_min: 1, dias_restantes_max: 30 },
      countEsperado: count,
    });
  }

  abrirPack30(comPack30: boolean): void {
    const count = comPack30
      ? this.dashboard.camarotes.pack30.com_pack30
      : this.dashboard.camarotes.pack30.sem_pack30;
    this.abrirModal({
      titulo: comPack30 ? 'Com Pack30' : 'Sem Pack30',
      subtitulo: `${count} unidade(s) com contrato ativo`,
      modo: 'pack30',
      fetch: { tipo: 'camarote' },
      filtro: (u) => temCessionario(u) && u.pack30 === comPack30,
      countEsperado: count,
    });
  }

  abrirVvip(): void {
    const total = this.dashboard.camarotes.vagas_vvip.total_vagas;
    this.abrirModal({
      titulo: 'Vagas VVIP',
      subtitulo: `${total} vaga(s) em contratos com cessionário`,
      modo: 'vvip',
      fetch: { tipo: 'camarote' },
      filtro: (u) => (u.vagas_vvip ?? 0) > 0,
      countEsperado: total,
    });
  }

  abrirSetor(setor: string): void {
    const count = this.totalSetor(setor);
    this.abrirModal({
      titulo: `Vagos — Setor ${setor}`,
      subtitulo: `${count} camarote(s) disponível(is)`,
      modo: 'vago',
      fetch: { tipo: 'camarote', setor, situacao: 'vago' },
      countEsperado: count,
    });
  }

  abrirTodosVagos(): void {
    const count = this.totalVagos();
    this.abrirModal({
      titulo: 'Camarotes vagos',
      subtitulo: `${count} unidade(s) disponível(is) para locação`,
      modo: 'vago',
      fetch: { tipo: 'camarote', situacao: 'vago' },
      countEsperado: count,
    });
  }

  abrirTipoCessionario(nome: string, quantidade: number): void {
    this.abrirModal({
      titulo: `Tipo — ${nome}`,
      subtitulo: `${quantidade} contrato(s) ativo(s)`,
      modo: 'contrato',
      fetch: { tipo: 'camarote' },
      filtro: (u) =>
        temCessionario(u) && this.normalizarTipoCessionario(u.tipo_cessionario) === nome,
      countEsperado: quantidade,
    });
  }

  abrirAndarTipo(andarUi: string, tipoNome: string, qtd: number): void {
    this.abrirModal({
      titulo: `${andarUi} — ${tipoNome}`,
      subtitulo: `${qtd} contrato(s) neste andar e tipo`,
      modo: 'contrato',
      fetch: { tipo: 'camarote' },
      filtro: (u) =>
        temCessionario(u) &&
        this.matchAndar(andarUi, u.andar) &&
        this.matchTipoRaw(tipoNome, u.tipo_cessionario),
      countEsperado: qtd,
    });
  }

  onVence30dKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.abrirVence30d();
    }
  }

  onKpiKeydown(event: KeyboardEvent, situacao: SituacaoUnidade): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.abrirKpi(situacao);
    }
  }

  onDrilldownKeydown(event: KeyboardEvent, action: () => void): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }

  fecharKpi(): void {
    this.modalAberto.set(false);
    this.modalCarregando.set(false);
    this.modalErro.set('');
    this.modalUnidades.set([]);
  }

  vvipClickable(): boolean {
    return (this.dashboard.camarotes.vagas_vvip.total_vagas ?? 0) > 0;
  }

  pack30Clickable(com: boolean): boolean {
    return com
      ? this.dashboard.camarotes.pack30.com_pack30 > 0
      : this.dashboard.camarotes.pack30.sem_pack30 > 0;
  }

  private abrirModal(config: ModalDrilldownConfig): void {
    const count = config.countEsperado;
    if (count !== undefined && count <= 0) {
      this.alertas.sucesso(config.vazioMsg || 'Nenhuma unidade nesta categoria.');
      return;
    }

    this.modalTitulo.set(config.titulo);
    this.modalSubtitulo.set(config.subtitulo);
    this.modalModo.set(config.modo);
    this.modalUnidades.set([]);
    this.modalErro.set('');
    this.modalCarregando.set(true);
    this.modalAberto.set(true);

    this.camarotesService.unidades(config.fetch).subscribe({
      next: (lista) => {
        const filtrada = config.filtro ? lista.filter(config.filtro) : lista;
        this.modalUnidades.set(this.ordenarUnidades(filtrada));
        this.modalCarregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.modalErro.set(err.error?.mensagem || 'Erro ao carregar unidades.');
        this.modalCarregando.set(false);
      },
    });
  }

  private normalizarTipoCessionario(valor: string | null | undefined): string {
    const s = String(valor || '').toLowerCase();
    if (s.includes('patroc')) return 'Patrocinador';
    if (s.includes('sep')) return 'SEP';
    if (s.includes('cess')) return 'Cessionário';
    return 'Outros';
  }

  private matchAndar(andarUi: string, andarDb: string | null | undefined): boolean {
    const ui = normalizarAndarChave(andarUi);
    const db = normalizarAndarChave(andarDb);
    if (!ui || !db) return ui === db;
    return ui === db;
  }

  private matchTipoRaw(tipoTag: string, tipoDb: string | null | undefined): boolean {
    const db = String(tipoDb || '').trim();
    if (!db) return tipoTag === 'Outros';
    if (db === tipoTag) return true;
    return this.normalizarTipoCessionario(db) === this.normalizarTipoCessionario(tipoTag);
  }

  private ordenarUnidades(lista: CamaroteUnidade[]): CamaroteUnidade[] {
    return [...lista].sort((a, b) => {
      const setor = (a.setor || '').localeCompare(b.setor || '', 'pt-BR');
      if (setor !== 0) return setor;
      return a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true });
    });
  }

  totalSetor(setor: string): number {
    return this.dashboard.camarotes.disponiveis_por_setor?.[setor]?.total ?? 0;
  }

  numerosSetor(setor: string): string[] {
    return this.dashboard.camarotes.disponiveis_por_setor?.[setor]?.numeros ?? [];
  }

  maxVagosSetor(): number {
    return Math.max(...this.setores.map((s) => this.totalSetor(s)), 1);
  }

  barWidthSetor(setor: string): number {
    const max = this.maxVagosSetor();
    if (!max) return 0;
    return Math.round((this.totalSetor(setor) / max) * 100);
  }

  totalVagos(): number {
    return this.dashboard.camarotes.alertas.vagos;
  }

  tiposOrdenados(): Array<{ nome: string; quantidade: number; valor_total: number }> {
    const resumo = this.dashboard.camarotes.tipo_cessionario.resumo;
    const seen = new Set<string>();
    const result: Array<{ nome: string; quantidade: number; valor_total: number }> = [];

    for (const nome of TIPOS_ORDEM) {
      if (resumo[nome]) {
        result.push({ nome, ...resumo[nome] });
        seen.add(nome);
      }
    }
    for (const [nome, data] of Object.entries(resumo)) {
      if (!seen.has(nome)) {
        result.push({ nome, ...data });
      }
    }
    return result;
  }

  maxQtdTipo(): number {
    const tipos = this.tiposOrdenados();
    return Math.max(...tipos.map((t) => t.quantidade), 1);
  }

  barWidthTipo(qtd: number): number {
    const max = this.maxQtdTipo();
    if (!max) return 0;
    return Math.round((qtd / max) * 100);
  }

  corTipo(tipo: string): string {
    return CORES_TIPO[tipo] ?? CORES_TIPO['Outros'];
  }

  qtdAtivos(): number {
    return this.dashboard.camarotes.metricas.qtd_ativos;
  }

  pack30Total(): number {
    const p = this.dashboard.camarotes.pack30;
    return p.com_pack30 + p.sem_pack30;
  }

  pack30PctCom(): number {
    const total = this.pack30Total();
    if (!total) return 0;
    return Math.round((this.dashboard.camarotes.pack30.com_pack30 / total) * 100);
  }

  andaresEntries(): Array<{ andar: string; tipos: Array<{ nome: string; qtd: number }> }> {
    const porAndar = this.dashboard.camarotes.tipo_cessionario.por_andar;
    if (!porAndar) return [];

    return Object.entries(porAndar)
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
      .map(([andar, tipos]) => ({
        andar: this.formatarAndar(andar),
        tipos: Object.entries(tipos)
          .sort(([a], [b]) => {
            const ia = TIPOS_ORDEM.indexOf(a as (typeof TIPOS_ORDEM)[number]);
            const ib = TIPOS_ORDEM.indexOf(b as (typeof TIPOS_ORDEM)[number]);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          })
          .map(([nome, qtd]) => ({ nome, qtd })),
      }));
  }

  formatarAndar = formatarAndar;

  vencidosTimelineClickable(): boolean {
    return (this.dashboard.vencimentos?.vencidos ?? 0) > 0;
  }

  apos12mClickable(): boolean {
    return (this.dashboard.vencimentos?.apos12m ?? 0) > 0;
  }

  receitaTotal12mClickable(): boolean {
    return (this.dashboard.receitaRenovar?.total12m ?? 0) > 0;
  }

  receitaVencidaClickable(): boolean {
    return (this.dashboard.receitaRenovar?.vencida ?? 0) > 0;
  }

  abrirVencidosTimeline(): void {
    this.abrirKpi('vencido');
  }

  abrirApos12m(): void {
    const v = this.dashboard.vencimentos;
    this.abrirModal({
      titulo: 'Após 12 meses',
      subtitulo: `${v.apos12m} contrato(s) com vencimento a partir de ${this.formatarDataBr(v.refLimite12m)}`,
      modo: 'contrato',
      fetch: { tipo: 'camarote' },
      filtro: (u) => this.matchApos12m(u),
      countEsperado: v.apos12m,
    });
  }

  abrirMesVencimento(mes: VencimentoMes): void {
    if (mes.qtd <= 0) return;
    this.abrirModal({
      titulo: `Vencimentos — ${mes.label.toUpperCase()}`,
      subtitulo: `${mes.qtd} contrato(s) com vencimento em ${mes.ym}`,
      modo: 'contrato',
      fetch: { tipo: 'camarote' },
      filtro: (u) => this.matchMesVencimento(u, mes.ym),
      countEsperado: mes.qtd,
    });
  }

  abrirReceitaTotal12m(): void {
    const r = this.dashboard.receitaRenovar;
    const qtd = this.qtdContratosProximos12m();
    this.abrirModal({
      titulo: 'Receita a renovar — 12 meses',
      subtitulo: `${qtd} contrato(s) · ${this.moeda(r.total12m)} em receita anual`,
      modo: 'contrato',
      fetch: { tipo: 'camarote' },
      filtro: (u) => this.matchReceitaProximos12m(u),
      countEsperado: qtd,
    });
  }

  abrirTrimestreReceita(tri: ReceitaTrimestre): void {
    if (tri.valor <= 0) return;
    this.abrirModal({
      titulo: `Receita — ${tri.label}`,
      subtitulo: `${this.moedaCompacta(tri.valor)} em receita anual neste trimestre`,
      modo: 'contrato',
      fetch: { tipo: 'camarote' },
      filtro: (u) => this.matchTrimestreReceita(u, tri.ano, tri.tri),
    });
  }

  abrirReceitaVencida(): void {
    const v = this.dashboard.receitaRenovar.vencida;
    if (v <= 0) return;
    this.abrirModal({
      titulo: 'Receita vencida',
      subtitulo: `${this.moeda(v)} em receita anual · renovação em aberto`,
      modo: 'contrato',
      fetch: { tipo: 'camarote' },
      filtro: (u) => this.matchReceitaVencida(u),
    });
  }

  qtdContratosProximos12m(): number {
    return (this.dashboard.vencimentos?.meses ?? []).reduce((s, m) => s + m.qtd, 0);
  }

  private dataIso(finalLocacao: string | null | undefined): string {
    return finalLocacao?.slice(0, 10) ?? '';
  }

  private ymFromFinal(finalLocacao: string | null | undefined): string {
    return this.dataIso(finalLocacao).slice(0, 7);
  }

  private formatarDataBr(iso: string): string {
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  private intervaloTrimestre(ano: number, tri: number): { inicio: string; fim: string } {
    const inicios = ['01-01', '04-01', '07-01', '10-01'];
    const fins = ['03-31', '06-30', '09-30', '12-31'];
    return {
      inicio: `${ano}-${inicios[tri - 1]}`,
      fim: `${ano}-${fins[tri - 1]}`,
    };
  }

  private matchMesVencimento(u: CamaroteUnidade, ym: string): boolean {
    return temCessionario(u) && this.ymFromFinal(u.final_locacao) === ym;
  }

  private matchApos12m(u: CamaroteUnidade): boolean {
    const limite = this.dashboard.vencimentos.refLimite12m;
    const d = this.dataIso(u.final_locacao);
    return temCessionario(u) && !!d && d >= limite;
  }

  private matchReceitaProximos12m(u: CamaroteUnidade): boolean {
    const { refHoje, refLimite12m } = this.dashboard.vencimentos;
    const d = this.dataIso(u.final_locacao);
    return (
      temCessionario(u) &&
      (u.valor_anual ?? 0) > 0 &&
      !!d &&
      d >= refHoje &&
      d < refLimite12m
    );
  }

  private matchTrimestreReceita(u: CamaroteUnidade, ano: number, tri: number): boolean {
    const { refHoje, refLimite12m } = this.dashboard.vencimentos;
    const d = this.dataIso(u.final_locacao);
    if (!temCessionario(u) || (u.valor_anual ?? 0) <= 0 || !d) return false;
    if (d < refHoje || d >= refLimite12m) return false;
    const { inicio, fim } = this.intervaloTrimestre(ano, tri);
    return d >= inicio && d <= fim;
  }

  private matchReceitaVencida(u: CamaroteUnidade): boolean {
    const refHoje = this.dashboard.vencimentos.refHoje;
    const d = this.dataIso(u.final_locacao);
    return temCessionario(u) && (u.valor_anual ?? 0) > 0 && !!d && d < refHoje;
  }

  vencimentosVazio(): boolean {
    const v = this.dashboard.vencimentos;
    if (!v?.meses?.length) return true;
    const sumMeses = v.meses.reduce((s, m) => s + m.qtd, 0);
    return v.vencidos + v.apos12m + sumMeses === 0;
  }

  receitaVazia(): boolean {
    const r = this.dashboard.receitaRenovar;
    if (!r) return true;
    return r.total12m === 0 && r.vencida === 0 && !r.trimestres?.length;
  }

  maxVencimentoQtd(): number {
    const meses = this.dashboard.vencimentos?.meses ?? [];
    const max = Math.max(...meses.map((m) => m.qtd), 0);
    return Math.max(max, 1);
  }

  alturaBarraVenc(qtd: number): number {
    if (qtd <= 0) return 8;
    return Math.max(Math.round((qtd / this.maxVencimentoQtd()) * 100), 8);
  }

  maxReceitaTri(): number {
    const trimestres = this.dashboard.receitaRenovar?.trimestres ?? [];
    const max = Math.max(...trimestres.map((t) => t.valor), 0);
    return Math.max(max, 1);
  }

  larguraBarraReceita(valor: number): number {
    if (valor <= 0) return 0;
    return Math.round((valor / this.maxReceitaTri()) * 100);
  }
}
