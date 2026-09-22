import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, Observable } from 'rxjs';
import {
  NscAprovacaoItem,
  NscAprovacaoStatus,
  NscCertificadoDetalhe,
  NscColaboradorAdmin,
  NscConfig,
  NscNotificacaoLog,
  NscRegraDepartamento,
  NscResumo,
  NscStatus,
} from '../../../models/nsc.model';
import { AlertasService } from '../../../services/alertas.service';
import { NscService } from '../../../services/nsc.service';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { baixarBlob } from '../../../utils/cipa-admin.util';
import {
  formatarDataNsc,
  gerarPdfRelatorioNsc,
  labelStatusNsc,
} from '../../../utils/nsc-admin.util';
import { previewCertificadoBlob } from '../../../utils/nsc-certificado-preview';

type AbaNsc =
  | 'departamentos'
  | 'colaboradores'
  | 'aprovacoes'
  | 'relatorios'
  | 'notificacoes'
  | 'historico';

type NscDisparoId =
  | 'antecedencia_60'
  | 'antecedencia_30'
  | 'antecedencia_15'
  | 'antecedencia_7'
  | 'antecedencia_1'
  | 'vencido'
  | 'gestor_a_vencer'
  | 'gestor_vencido'
  | 'resumo_rh';

interface DisparoUiMeta {
  id: NscDisparoId;
  titulo: string;
  badge: string;
  cardClass: string;
  headClass: string;
  badgeClass: string;
  dias: number | null;
  antecedenciaLabel: string;
  template: string;
  assunto: string;
}

const DISPARO_UI: DisparoUiMeta[] = [
  {
    id: 'antecedencia_60',
    titulo: '60 dias',
    badge: 'Baixa urgência',
    cardClass: 'on-green',
    headClass: 'th-green',
    badgeClass: 'tbadge-green',
    dias: 60,
    antecedenciaLabel: '60',
    template: 'nsc-colaborador.html',
    assunto: 'Não se Cale — certificado vence em 60 dia(s)',
  },
  {
    id: 'antecedencia_30',
    titulo: '30 dias',
    badge: 'Atenção',
    cardClass: 'on-purple',
    headClass: 'th-purple',
    badgeClass: 'tbadge-purple',
    dias: 30,
    antecedenciaLabel: '30',
    template: 'nsc-colaborador.html',
    assunto: 'Não se Cale — certificado vence em 30 dia(s)',
  },
  {
    id: 'antecedencia_15',
    titulo: '15 dias',
    badge: 'Atenção',
    cardClass: 'on-blue',
    headClass: 'th-blue',
    badgeClass: 'tbadge-blue',
    dias: 15,
    antecedenciaLabel: '15',
    template: 'nsc-colaborador.html',
    assunto: 'Não se Cale — certificado vence em 15 dia(s)',
  },
  {
    id: 'antecedencia_7',
    titulo: '7 dias',
    badge: 'Atenção',
    cardClass: 'on-orange',
    headClass: 'th-orange',
    badgeClass: 'tbadge-orange',
    dias: 7,
    antecedenciaLabel: '7',
    template: 'nsc-colaborador.html',
    assunto: 'Não se Cale — certificado vence em 7 dia(s)',
  },
  {
    id: 'antecedencia_1',
    titulo: '1 dia',
    badge: 'Urgente',
    cardClass: 'on-amber',
    headClass: 'th-amber',
    badgeClass: 'tbadge-amber',
    dias: 1,
    antecedenciaLabel: '1',
    template: 'nsc-colaborador.html',
    assunto: 'Não se Cale — certificado vence em 1 dia(s)',
  },
  {
    id: 'vencido',
    titulo: 'Hoje / vencidos',
    badge: 'Urgente',
    cardClass: 'on-dark',
    headClass: 'th-dark',
    badgeClass: 'tbadge-dark',
    dias: 0,
    antecedenciaLabel: '0',
    template: 'nsc-colaborador.html',
    assunto: 'Não se Cale — certificado vencido',
  },
  {
    id: 'gestor_a_vencer',
    titulo: 'Gestor · a vencer',
    badge: 'Gestor',
    cardClass: 'on-purple',
    headClass: 'th-purple',
    badgeClass: 'tbadge-purple',
    dias: null,
    antecedenciaLabel: '—',
    template: 'nsc-gestor.html',
    assunto: 'Não se Cale — [nome] com certificado a vencer',
  },
  {
    id: 'gestor_vencido',
    titulo: 'Gestor · vencido',
    badge: 'Urgente',
    cardClass: 'on-dark',
    headClass: 'th-dark',
    badgeClass: 'tbadge-dark',
    dias: 0,
    antecedenciaLabel: '0',
    template: 'nsc-gestor.html',
    assunto: 'Não se Cale — [nome] com certificado vencido',
  },
  {
    id: 'resumo_rh',
    titulo: 'Resumo RH',
    badge: 'Semanal',
    cardClass: 'on-blue',
    headClass: 'th-blue',
    badgeClass: 'tbadge-blue',
    dias: null,
    antecedenciaLabel: '—',
    template: 'nsc-resumo-rh.html',
    assunto: 'Não se Cale — resumo semanal de pendências',
  },
];

function ordenarPorNome(lista: NscColaboradorAdmin[]): NscColaboradorAdmin[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function casaBusca(c: NscColaboradorAdmin, q: string): boolean {
  if (!q) return true;
  const hay = `${c.nome} ${c.cargo || ''} ${c.departamento || ''} ${c.email || ''}`.toLowerCase();
  return hay.includes(q);
}

@Component({
  selector: 'app-nao-se-cale-admin',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent],
  templateUrl: './nao-se-cale-admin.component.html',
  styleUrl: './nao-se-cale-admin.component.scss',
})
export class NaoSeCaleAdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(NscService);
  private readonly alertas = inject(AlertasService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly busca$ = new Subject<string>();
  private previewUrl: string | null = null;
  private thumbObjectUrl: string | null = null;
  private thumbSeq = 0;

  readonly aba = signal<AbaNsc>('departamentos');
  readonly carregando = signal(false);
  readonly salvando = signal(false);
  readonly erro = signal('');
  readonly busca = signal('');
  readonly departamento = signal('');
  readonly statusFiltro = signal<NscStatus | ''>('');
  readonly relatorioDepto = signal('');
  readonly relatorioColabs = signal<NscColaboradorAdmin[]>([]);
  readonly exportando = signal(false);
  readonly historico = signal<NscNotificacaoLog[]>([]);
  readonly historicoCarregando = signal(false);
  readonly historicoTipo = signal('');
  readonly historicoStatus = signal('');
  readonly historicoBusca = signal('');

  readonly aprovacoes = signal<NscAprovacaoItem[]>([]);
  readonly aprovacoesPendentes = signal(0);
  readonly aprovacoesCarregando = signal(false);
  readonly aprovacaoFiltro = signal<NscAprovacaoStatus>('pendente');
  readonly recusaAberto = signal(false);
  readonly recusaEnvio = signal<NscAprovacaoItem | null>(null);
  readonly recusaMotivo = signal('');
  readonly recusaSalvando = signal(false);
  readonly aprovacaoAberto = signal(false);
  readonly aprovacaoEnvio = signal<NscAprovacaoItem | null>(null);
  readonly aprovacaoMotivo = signal('');
  readonly aprovacaoSalvando = signal(false);

  readonly colaboradores = signal<NscColaboradorAdmin[]>([]);
  readonly resumo = signal<NscResumo | null>(null);
  readonly regras = signal<NscRegraDepartamento[]>([]);
  readonly config = signal<NscConfig | null>(null);
  readonly emailsRhTexto = signal('');
  readonly contagensDepto = signal<Record<string, number>>({});
  readonly todosAd = signal<NscColaboradorAdmin[]>([]);
  readonly deptoAberto = signal<string | null>(null);
  readonly pickerModo = signal<'colaboradores' | 'gestores'>('colaboradores');
  readonly pickerDepto = signal('');

  readonly modalAberto = signal(false);
  readonly detalhe = signal<NscCertificadoDetalhe | null>(null);
  readonly thumbUrl = signal<string | null>(null);
  readonly thumbCarregando = signal(false);
  readonly thumbErro = signal('');
  readonly thumbEnvioId = signal<number | null>(null);

  readonly pickerAberto = signal(false);
  readonly pickerCarregando = signal(false);
  readonly pickerSalvando = signal(false);
  readonly pickerBusca = signal('');
  readonly pickerDisponiveis = signal<NscColaboradorAdmin[]>([]);
  readonly pickerNaLista = signal<NscColaboradorAdmin[]>([]);
  private pickerBaselineIds = new Set<string>();

  readonly departamentos = computed(() => {
    const set = new Set<string>();
    for (const c of this.colaboradores()) {
      if (c.departamento) set.add(c.departamento);
    }
    for (const r of this.regras()) set.add(r.departamento_ou);
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  readonly relatorioDeptos = computed(() => {
    const rows = this.resumo()?.por_departamento || [];
    const d = this.relatorioDepto();
    return d ? rows.filter((r) => r.departamento === d) : rows;
  });

  readonly relatorioColabsFiltrados = computed(() => {
    const d = this.relatorioDepto();
    const lista = this.relatorioColabs();
    if (!d) return lista;
    if (d === 'Sem departamento') return lista.filter((c) => !c.departamento?.trim());
    return lista.filter((c) => c.departamento === d);
  });

  readonly relatorioResumoFiltrado = computed(() => {
    const rows = this.relatorioDeptos();
    if (!this.relatorioDepto() || rows.length !== 1) return this.resumo();
    const d = rows[0];
    return {
      obrigatorios: d.obrigatorios,
      validos: d.validos,
      a_vencer: d.a_vencer,
      vencidos: d.vencidos,
      pendentes: d.pendentes,
      aguardando_aprovacao: d.aguardando_aprovacao || 0,
      irregulares: d.irregulares,
      por_departamento: rows,
    };
  });

  readonly pickerDisponiveisFiltrados = computed(() => {
    const q = this.pickerBusca().trim().toLowerCase();
    return this.pickerDisponiveis().filter((c) => casaBusca(c, q));
  });

  readonly pickerDirty = computed(() => {
    const agora = new Set(this.pickerNaLista().map((c) => c.ad_object_id));
    if (agora.size !== this.pickerBaselineIds.size) return true;
    for (const id of agora) {
      if (!this.pickerBaselineIds.has(id)) return true;
    }
    return false;
  });

  readonly disparoUi = DISPARO_UI;
  readonly previewAberto = signal(false);
  readonly previewTitulo = signal('');
  readonly previewHtml = signal<SafeHtml | null>(null);
  readonly carregandoPreview = signal(false);

  readonly pickerTitulo = computed(() =>
    this.pickerModo() === 'gestores'
      ? 'Vincular gestores ao departamento'
      : 'Adicionar colaboradores à certificação'
  );
  readonly pickerSubtitulo = computed(() =>
    this.pickerModo() === 'gestores'
      ? `Quem recebe avisos de vencimento em ${this.pickerDepto() || 'departamento'}.`
      : 'Inclua quem atua em eventos e deve apresentar o certificado Não se Cale.'
  );
  readonly pickerSaveLabel = computed(() =>
    this.pickerModo() === 'gestores' ? 'Guardar gestores' : 'Adicionar à lista'
  );
  readonly pickerKickerDireita = computed(() =>
    this.pickerModo() === 'gestores' ? 'Gestores do departamento' : 'Na certificação'
  );
  readonly pickerRodape = computed(() =>
    this.pickerModo() === 'gestores'
      ? 'Clique em Incluir para vincular o gestor'
      : 'Clique em Incluir para adicionar à certificação'
  );

  ngOnInit(): void {
    this.busca$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((q) => {
      this.busca.set(q);
      this.carregarColaboradores();
    });
    this.carregarTudo();
  }

  ngOnDestroy(): void {
    this.revokePreview();
    this.revokeThumb();
    this.busca$.complete();
  }

  selecionarAba(aba: AbaNsc): void {
    this.aba.set(aba);
    if (aba === 'departamentos' && !this.regras().length) {
      this.carregarRegras();
    }
    if (aba === 'notificacoes' && !this.config()) {
      this.carregarConfig();
    }
    if (aba === 'relatorios') {
      this.carregarResumo();
      this.carregarRelatorioColabs();
    }
    if (aba === 'historico') {
      this.carregarHistorico();
    }
    if (aba === 'aprovacoes') {
      this.carregarAprovacoes();
    }
  }

  onBusca(value: string): void {
    this.busca$.next(value.trim());
  }

  filtrar(): void {
    this.carregarColaboradores();
    this.carregarResumo();
  }

  carregarTudo(): void {
    this.carregarResumo();
    this.carregarColaboradores();
    this.carregarRegras();
    this.carregarConfig();
    this.carregarContagens();
    this.carregarAprovacoes();
  }

  carregarContagens(): void {
    this.api.listarColaboradores({ somente_obrigatorios: false }).subscribe({
      next: (res) => {
        this.todosAd.set(res.colaboradores);
        const map: Record<string, number> = {};
        for (const c of res.colaboradores) {
          const d = c.departamento?.trim();
          if (!d) continue;
          map[d] = (map[d] || 0) + 1;
        }
        this.contagensDepto.set(map);
      },
      error: () => {
        this.todosAd.set([]);
        this.contagensDepto.set({});
      },
    });
  }

  qtdDepto(nome: string): number {
    return this.contagensDepto()[nome] || 0;
  }

  colabsDoDepto(nome: string): NscColaboradorAdmin[] {
    return this.todosAd().filter((c) => (c.departamento || '') === nome);
  }

  toggleDepto(nome: string): void {
    this.deptoAberto.update((atual) => (atual === nome ? null : nome));
  }

  toneStatus(status: NscStatus): 'ok' | 'wait' | 'bad' | 'neutral' {
    if (status === 'valido') return 'ok';
    if (status === 'a_vencer' || status === 'aguardando_aprovacao') return 'wait';
    if (status === 'vencido') return 'bad';
    return 'neutral';
  }

  carregarResumo(): void {
    this.api.resumo().subscribe({
      next: (r) => this.resumo.set(r),
      error: () => this.resumo.set(null),
    });
  }

  carregarColaboradores(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api
      .listarColaboradores({
        busca: this.busca() || undefined,
        departamento: this.departamento() || undefined,
        status: this.statusFiltro() || undefined,
        somente_obrigatorios: true,
      })
      .subscribe({
        next: (res) => {
          this.colaboradores.set(res.colaboradores);
          this.carregando.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.erro.set(err.error?.mensagem || 'Erro ao carregar colaboradores.');
          this.carregando.set(false);
        },
      });
  }

  carregarRegras(): void {
    this.api.regras().subscribe({
      next: (res) => this.regras.set(res.regras),
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar departamentos.'),
    });
  }

  carregarConfig(): void {
    this.api.getConfig().subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.emailsRhTexto.set((cfg.emails_rh || []).join(', '));
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar configurações.'),
    });
  }

  removerDaLista(c: NscColaboradorAdmin): void {
    this.api.patchObrigatorio(c.ad_object_id, false).subscribe({
      next: () => {
        this.colaboradores.update((lista) => lista.filter((item) => item.ad_object_id !== c.ad_object_id));
        this.carregarResumo();
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível remover da lista.'),
    });
  }

  abrirPicker(): void {
    this.pickerModo.set('colaboradores');
    this.pickerDepto.set('');
    this.pickerAberto.set(true);
    this.pickerCarregando.set(true);
    this.pickerBusca.set('');
    this.api.listarColaboradores({ somente_obrigatorios: false }).subscribe({
      next: (res) => {
        const naLista = ordenarPorNome(res.colaboradores.filter((c) => c.obrigatorio_efetivo));
        const disponiveis = ordenarPorNome(res.colaboradores.filter((c) => !c.obrigatorio_efetivo));
        this.pickerNaLista.set(naLista);
        this.pickerDisponiveis.set(disponiveis);
        this.pickerBaselineIds = new Set(naLista.map((c) => c.ad_object_id));
        this.pickerCarregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.pickerCarregando.set(false);
        this.pickerAberto.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar o diretório.');
      },
    });
  }

  abrirPickerGestores(r: NscRegraDepartamento, event?: Event): void {
    event?.stopPropagation();
    this.pickerModo.set('gestores');
    this.pickerDepto.set(r.departamento_ou);
    this.pickerAberto.set(true);
    this.pickerCarregando.set(true);
    this.pickerBusca.set('');
    const ids = new Set((r.gestores || []).map((g) => g.ad_object_id));
    this.api.listarColaboradores({ somente_obrigatorios: false }).subscribe({
      next: (res) => {
        const naLista = ordenarPorNome(res.colaboradores.filter((c) => ids.has(c.ad_object_id)));
        const disponiveis = ordenarPorNome(res.colaboradores.filter((c) => !ids.has(c.ad_object_id)));
        this.pickerNaLista.set(naLista);
        this.pickerDisponiveis.set(disponiveis);
        this.pickerBaselineIds = new Set(naLista.map((c) => c.ad_object_id));
        this.pickerCarregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.pickerCarregando.set(false);
        this.pickerAberto.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar o diretório.');
      },
    });
  }

  fecharPicker(): void {
    this.pickerAberto.set(false);
    this.pickerSalvando.set(false);
    this.pickerDisponiveis.set([]);
    this.pickerNaLista.set([]);
    this.pickerBaselineIds = new Set();
    this.pickerBusca.set('');
    this.pickerModo.set('colaboradores');
    this.pickerDepto.set('');
  }

  incluirNoPicker(c: NscColaboradorAdmin): void {
    this.pickerDisponiveis.update((lista) => lista.filter((item) => item.ad_object_id !== c.ad_object_id));
    this.pickerNaLista.update((lista) => ordenarPorNome([...lista, c]));
  }

  incluirTodosFiltrados(): void {
    const mover = this.pickerDisponiveisFiltrados();
    if (!mover.length) return;
    const ids = new Set(mover.map((c) => c.ad_object_id));
    this.pickerDisponiveis.update((lista) => lista.filter((c) => !ids.has(c.ad_object_id)));
    this.pickerNaLista.update((lista) => ordenarPorNome([...lista, ...mover]));
  }

  removerDoPicker(c: NscColaboradorAdmin): void {
    this.pickerNaLista.update((lista) => lista.filter((item) => item.ad_object_id !== c.ad_object_id));
    this.pickerDisponiveis.update((lista) => ordenarPorNome([...lista, c]));
  }

  removerTodosDoPicker(): void {
    const mover = this.pickerNaLista();
    if (!mover.length) return;
    this.pickerNaLista.set([]);
    this.pickerDisponiveis.update((lista) => ordenarPorNome([...lista, ...mover]));
  }

  confirmarPicker(): void {
    if (this.pickerModo() === 'gestores') {
      this.confirmarPickerGestores();
      return;
    }
    const agora = new Set(this.pickerNaLista().map((c) => c.ad_object_id));
    const incluir = [...agora].filter((id) => !this.pickerBaselineIds.has(id));
    const remover = [...this.pickerBaselineIds].filter((id) => !agora.has(id));
    if (!incluir.length && !remover.length) {
      this.fecharPicker();
      return;
    }
    const reqs: Observable<{ atualizados: number; ignorados: number }>[] = [];
    if (incluir.length) reqs.push(this.api.patchObrigatorioLote(incluir, true));
    if (remover.length) reqs.push(this.api.patchObrigatorioLote(remover, false));
    this.pickerSalvando.set(true);
    forkJoin(reqs).subscribe({
      next: () => {
        this.fecharPicker();
        this.carregarColaboradores();
        this.carregarResumo();
        this.alertas.sucesso('Lista de colaboradores atualizada.');
      },
      error: (err: HttpErrorResponse) => {
        this.pickerSalvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao atualizar a lista.');
      },
    });
  }

  private confirmarPickerGestores(): void {
    const depto = this.pickerDepto();
    if (!depto) return;
    this.pickerSalvando.set(true);
    const ids = this.pickerNaLista().map((c) => c.ad_object_id);
    this.api.salvarGestoresDepartamento(depto, ids).subscribe({
      next: (res) => {
        this.regras.set(res.regras);
        this.fecharPicker();
        this.alertas.sucesso('Gestores do departamento atualizados.');
      },
      error: (err: HttpErrorResponse) => {
        this.pickerSalvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao guardar os gestores.');
      },
    });
  }

  labelStatus(status: NscStatus): string {
    return labelStatusNsc(status);
  }

  textoMotivoAprovacao(item: NscAprovacaoItem): string {
    if (item.aprovacao === 'rejeitado') {
      return item.motivo_rejeicao || item.motivo_aprovacao || '—';
    }
    return item.motivo_aprovacao || '—';
  }

  carregarAprovacoes(): void {
    this.aprovacoesCarregando.set(true);
    this.api.listarAprovacoes(this.aprovacaoFiltro()).subscribe({
      next: (res) => {
        this.aprovacoes.set(res.aprovacoes);
        this.aprovacoesPendentes.set(res.pendentes);
        this.aprovacoesCarregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.aprovacoesCarregando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar as aprovações.');
      },
    });
  }

  filtrarAprovacoes(status: NscAprovacaoStatus): void {
    this.aprovacaoFiltro.set(status);
    this.carregarAprovacoes();
  }

  verArquivoAprovacao(item: NscAprovacaoItem, download = false): void {
    if (download) {
      this.baixarEnvio(item.ad_object_id, item.id, item.nome_arquivo);
      return;
    }
    this.api.certificadoAdmin(item.ad_object_id).subscribe({
      next: (det) => {
        this.detalhe.set(det);
        this.modalAberto.set(true);
        this.carregarMiniatura(item.ad_object_id, item.id);
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar o certificado.'),
    });
  }

  abrirAprovacao(item: NscAprovacaoItem): void {
    this.aprovacaoEnvio.set(item);
    this.aprovacaoMotivo.set(item.motivo_aprovacao || '');
    this.aprovacaoAberto.set(true);
  }

  fecharAprovacao(): void {
    this.aprovacaoAberto.set(false);
    this.aprovacaoEnvio.set(null);
    this.aprovacaoMotivo.set('');
  }

  confirmarAprovacao(): void {
    const item = this.aprovacaoEnvio();
    const motivo = this.aprovacaoMotivo().trim();
    if (!item) return;
    if (!motivo) {
      this.alertas.erro('Informe o motivo da aprovação.');
      return;
    }
    this.aprovacaoSalvando.set(true);
    this.api.aprovarEnvio(item.id, motivo).subscribe({
      next: () => {
        this.aprovacaoSalvando.set(false);
        this.fecharAprovacao();
        this.alertas.sucesso('Certificado aprovado.');
        this.carregarAprovacoes();
        this.carregarColaboradores();
        this.carregarResumo();
      },
      error: (err: HttpErrorResponse) => {
        this.aprovacaoSalvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao aprovar o certificado.');
      },
    });
  }

  abrirRecusa(item: NscAprovacaoItem): void {
    this.recusaEnvio.set(item);
    this.recusaMotivo.set('');
    this.recusaAberto.set(true);
  }

  fecharRecusa(): void {
    this.recusaAberto.set(false);
    this.recusaEnvio.set(null);
    this.recusaMotivo.set('');
  }

  confirmarRecusa(): void {
    const item = this.recusaEnvio();
    const motivo = this.recusaMotivo().trim();
    if (!item) return;
    if (!motivo) {
      this.alertas.erro('Informe o motivo da recusa.');
      return;
    }
    this.recusaSalvando.set(true);
    this.api.rejeitarEnvio(item.id, motivo).subscribe({
      next: () => {
        this.recusaSalvando.set(false);
        this.fecharRecusa();
        this.alertas.sucesso('Certificado recusado.');
        this.carregarAprovacoes();
        this.carregarColaboradores();
        this.carregarResumo();
      },
      error: (err: HttpErrorResponse) => {
        this.recusaSalvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao recusar o certificado.');
      },
    });
  }

  formatarValidade(iso: string | null | undefined): string {
    return formatarDataNsc(iso);
  }

  carregarRelatorioColabs(): void {
    this.api.listarColaboradores({ somente_obrigatorios: true }).subscribe({
      next: (res) => this.relatorioColabs.set(res.colaboradores),
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar o relatório.'),
    });
  }

  exportarXlsx(): void {
    this.exportando.set(true);
    this.api.exportarRelatorioXlsx(this.relatorioDepto() || undefined).subscribe({
      next: (blob) => {
        const stamp = new Date().toISOString().slice(0, 10);
        baixarBlob(blob, `nsc-relatorio-${stamp}.xlsx`);
        this.exportando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.exportando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível gerar o Excel.');
      },
    });
  }

  carregarHistorico(): void {
    this.historicoCarregando.set(true);
    this.api
      .listarNotificacoes({
        tipo: this.historicoTipo() || undefined,
        status: this.historicoStatus() || undefined,
        busca: this.historicoBusca().trim() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.historico.set(res.notificacoes || []);
          this.historicoCarregando.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.historicoCarregando.set(false);
          this.alertas.erro(err.error?.mensagem || 'Erro ao carregar o histórico.');
        },
      });
  }

  labelTipoNotificacao(tipo: string): string {
    if (tipo === 'vencido') return 'Certificado vencido';
    if (tipo === 'gestor_vencido') return 'Gestor (vencido)';
    if (tipo === 'gestor_a_vencer') return 'Gestor (a vencer)';
    if (tipo === 'resumo_rh') return 'Resumo semanal RH';
    if (tipo === 'aprovacao_rh') return 'Aprovação de certificado';
    const ante = tipo.match(/^antecedencia_(\d+)$/);
    if (ante) return `Aviso de ${ante[1]} dia(s)`;
    return tipo;
  }

  nomeNotificacao(n: NscNotificacaoLog): string {
    if (n.ad_object_id === 'rh') return 'RH';
    return n.colaborador_nome || '—';
  }

  exportarPdf(): void {
    const kpis = this.relatorioResumoFiltrado();
    if (!kpis) {
      this.alertas.erro('Não há dados para exportar.');
      return;
    }
    gerarPdfRelatorioNsc(
      kpis,
      this.relatorioDeptos(),
      this.relatorioColabsFiltrados(),
      this.relatorioDepto() || undefined
    );
  }

  verCertificado(c: NscColaboradorAdmin): void {
    this.api.certificadoAdmin(c.ad_object_id).subscribe({
      next: (det) => {
        this.detalhe.set(det);
        this.modalAberto.set(true);
        this.carregarMiniatura(c.ad_object_id, det.vigente?.id ?? det.historico[0]?.id);
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar o certificado.'),
    });
  }

  verHistorico(h: { id: number }): void {
    const ad = this.detalhe()?.colaborador.ad_object_id;
    if (!ad) return;
    this.carregarMiniatura(ad, h.id);
  }

  baixarHistorico(h: { id: number; nome_arquivo: string }): void {
    const ad = this.detalhe()?.colaborador.ad_object_id;
    if (!ad) return;
    this.baixarEnvio(ad, h.id, h.nome_arquivo, true);
  }

  async removerHistorico(h: { id: number; nome_arquivo: string }): Promise<void> {
    const ad = this.detalhe()?.colaborador.ad_object_id;
    if (!ad) return;
    const ok = await this.alertas.confirmarExclusao({
      titulo: 'Remover certificado',
      texto: `Excluir "${h.nome_arquivo}"? Esta ação não pode ser desfeita.`,
    });
    if (!ok) return;
    this.aplicarRemocaoAdmin(ad, h.id);
  }

  async removerAprovacao(item: NscAprovacaoItem): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: 'Remover certificado',
      texto: `Excluir o envio de ${item.colaborador_nome || 'colaborador'}? Esta ação não pode ser desfeita.`,
    });
    if (!ok) return;
    this.api.removerAdmin(item.ad_object_id, item.id).subscribe({
      next: () => {
        this.alertas.sucesso('Certificado removido.');
        this.carregarAprovacoes();
        this.carregarColaboradores();
        this.carregarResumo();
        if (this.detalhe()?.colaborador.ad_object_id === item.ad_object_id) {
          this.fecharModal();
        }
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível remover o certificado.'),
    });
  }

  private aplicarRemocaoAdmin(adObjectId: string, envioId: number): void {
    this.api.removerAdmin(adObjectId, envioId).subscribe({
      next: (det) => {
        this.alertas.sucesso('Certificado removido.');
        this.detalhe.set(det);
        this.carregarColaboradores();
        this.carregarResumo();
        this.carregarAprovacoes();
        if (!det.historico.length) {
          this.fecharModal();
          return;
        }
        if (this.thumbEnvioId() === envioId) {
          this.carregarMiniatura(adObjectId, det.vigente?.id ?? det.historico[0]?.id);
        }
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível remover o certificado.'),
    });
  }

  abrirArquivo(download = false): void {
    const ad = this.detalhe()?.colaborador.ad_object_id;
    if (!ad) return;
    const envioId = this.thumbEnvioId() || this.detalhe()?.vigente?.id;
    const nome =
      this.detalhe()?.historico.find((h) => h.id === envioId)?.nome_arquivo ||
      this.detalhe()?.vigente?.nome_arquivo ||
      'certificado';
    this.baixarEnvio(ad, envioId, nome, download);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.detalhe.set(null);
    this.thumbEnvioId.set(null);
    this.thumbErro.set('');
    this.revokeThumb();
  }

  toggleRegra(r: NscRegraDepartamento, checked: boolean): void {
    const previous = this.regras();
    const next = previous.map((item) =>
      item.departamento_ou === r.departamento_ou ? { ...item, obrigatorio: checked } : item
    );
    this.regras.set(next);
    this.api.salvarRegras(next).subscribe({
      next: (res) => {
        this.regras.set(res.regras);
        this.carregarColaboradores();
        this.carregarResumo();
      },
      error: (err: HttpErrorResponse) => {
        this.regras.set(previous);
        this.alertas.erro(err.error?.mensagem || 'Falha ao salvar regras.');
      },
    });
  }

  disparoAtivo(meta: DisparoUiMeta): boolean {
    const cfg = this.config();
    if (!cfg) return false;
    if (meta.id.startsWith('antecedencia_') && meta.dias != null) {
      return cfg.notificar_colaborador && cfg.antecedencias_aviso.includes(meta.dias);
    }
    if (meta.id === 'vencido') return cfg.notificar_colaborador;
    if (meta.id === 'gestor_a_vencer' || meta.id === 'gestor_vencido') return cfg.notificar_gestor;
    if (meta.id === 'resumo_rh') return cfg.resumo_semanal_rh;
    return false;
  }

  toggleDisparo(meta: DisparoUiMeta, ativo: boolean): void {
    const cfg = this.config();
    if (!cfg) return;
    if (meta.id.startsWith('antecedencia_') && meta.dias != null) {
      const set = new Set(cfg.antecedencias_aviso);
      if (ativo) set.add(meta.dias);
      else set.delete(meta.dias);
      this.config.set({
        ...cfg,
        notificar_colaborador: ativo ? true : cfg.notificar_colaborador,
        antecedencias_aviso: [...set].sort((a, b) => b - a),
      });
      return;
    }
    if (meta.id === 'vencido') {
      this.atualizarFlag('notificar_colaborador', ativo);
      return;
    }
    if (meta.id === 'gestor_a_vencer' || meta.id === 'gestor_vencido') {
      this.atualizarFlag('notificar_gestor', ativo);
      return;
    }
    if (meta.id === 'resumo_rh') {
      this.atualizarFlag('resumo_semanal_rh', ativo);
    }
  }

  previewDisparo(meta: DisparoUiMeta): void {
    const tipo = meta.id.startsWith('antecedencia_') ? 'antecedencia' : meta.id;
    this.carregandoPreview.set(true);
    this.api.previewNotificacao(tipo, meta.dias ?? undefined).subscribe({
      next: (res) => {
        this.previewTitulo.set(res.assunto || `Template — ${meta.titulo}`);
        this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(res.html));
        this.previewAberto.set(true);
        this.carregandoPreview.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoPreview.set(false);
        this.alertas.erro(err.error?.mensagem || 'Erro ao pré-visualizar o e-mail.');
      },
    });
  }

  fecharPreview(): void {
    this.previewAberto.set(false);
    this.previewHtml.set(null);
    this.previewTitulo.set('');
  }

  atualizarFlag(campo: keyof NscConfig, value: boolean): void {
    const cfg = this.config();
    if (!cfg) return;
    this.config.set({ ...cfg, [campo]: value });
  }

  salvarConfig(): void {
    const cfg = this.config();
    if (!cfg) return;
    const emails = this.emailsRhTexto()
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    this.salvando.set(true);
    this.api.salvarConfig({ ...cfg, emails_rh: emails }).subscribe({
      next: (salvo) => {
        this.config.set(salvo);
        this.emailsRhTexto.set((salvo.emails_rh || []).join(', '));
        this.salvando.set(false);
        this.alertas.sucesso('Política de notificações salva.');
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Falha ao salvar configurações.');
      },
    });
  }

  private baixarEnvio(
    adObjectId: string,
    envioId: number | null | undefined,
    nomeArquivo: string,
    download = true
  ): void {
    this.api.baixarAdmin(adObjectId, download, envioId ?? undefined).subscribe({
      next: (blob) => {
        this.revokePreview();
        const url = URL.createObjectURL(blob);
        this.previewUrl = url;
        if (download) {
          const a = document.createElement('a');
          a.href = url;
          a.download = nomeArquivo || 'certificado';
          a.click();
        } else {
          window.open(url, '_blank', 'noopener');
        }
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir o arquivo.'),
    });
  }

  private carregarMiniatura(adObjectId: string, envioId?: number): void {
    const seq = ++this.thumbSeq;
    this.revokeThumb();
    this.thumbEnvioId.set(envioId ?? null);
    this.thumbErro.set('');
    this.thumbCarregando.set(true);

    const aplicar = (url: string) => {
      if (seq !== this.thumbSeq) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      this.thumbObjectUrl = url.startsWith('blob:') ? url : null;
      this.thumbUrl.set(url);
      this.thumbCarregando.set(false);
    };

    const fallbackServidor = () => {
      this.api.miniaturaAdmin(adObjectId, envioId).subscribe({
        next: (blob) => {
          if (seq !== this.thumbSeq) return;
          if (!blob?.size || (blob.type && !blob.type.startsWith('image/'))) {
            this.thumbCarregando.set(false);
            this.thumbErro.set('Não foi possível exibir a miniatura. Use Abrir arquivo.');
            return;
          }
          aplicar(URL.createObjectURL(blob));
        },
        error: () => {
          if (seq !== this.thumbSeq) return;
          this.thumbCarregando.set(false);
          this.thumbErro.set('Não foi possível exibir a miniatura. Use Abrir arquivo.');
        },
      });
    };

    this.api.baixarAdmin(adObjectId, false, envioId).subscribe({
      next: (blob) => {
        if (seq !== this.thumbSeq) return;
        void previewCertificadoBlob(blob)
          .then(aplicar)
          .catch(fallbackServidor);
      },
      error: fallbackServidor,
    });
  }

  private revokePreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }

  private revokeThumb(): void {
    if (this.thumbObjectUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(this.thumbObjectUrl);
    }
    this.thumbObjectUrl = null;
    this.thumbUrl.set(null);
    this.thumbCarregando.set(false);
  }
}
