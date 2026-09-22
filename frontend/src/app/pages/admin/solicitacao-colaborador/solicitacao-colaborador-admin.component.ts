import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgClass, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { AlertasService } from '../../../services/alertas.service';
import { SolicitacaoColaboradorService } from '../../../services/solicitacao-colaborador.service';
import {
  SolicitacaoCampo,
  SolicitacaoColaborador,
  SolicitacaoEmailIndividual,
  SolicitacaoEnvio,
  SolicitacaoGrupo,
  SolicitacaoVisualizador,
  UsuarioAdBusca,
} from '../../../models/solicitacao-colaborador.model';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';

type AbaSolicitacao = 'grupos' | 'individuais' | 'acesso' | 'historico';
type ModoDestinoEmail = 'teste' | 'encaminhar';

const PREFIXO_ENCAMINHADO = /^Encaminhado\s*[—–-]\s*/i;
const PREFIXO_INDIVIDUAL = /^E-mail individual\s*[—–-]\s*/i;

const ASSUNTO_PADRAO = 'Nova solicitação de colaborador — {nome} ({tipo})';
const ASSUNTO_PLACEHOLDERS =
  'Placeholders: {nome}, {sobrenome}, {tipo}, {departamento}, {cargo}, {empresa}, {solicitante}, {data_inicio}';

@Component({
  selector: 'app-solicitacao-colaborador-admin',
  standalone: true,
  imports: [FormsModule, DatePipe, NgClass, NgTemplateOutlet, AdminModalComponent],
  templateUrl: './solicitacao-colaborador-admin.component.html',
  styleUrl: './solicitacao-colaborador-admin.component.scss',
})
export class SolicitacaoColaboradorAdminComponent implements OnInit {
  private readonly service = inject(SolicitacaoColaboradorService);
  private readonly alertas = inject(AlertasService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly busca$ = new Subject<string>();
  private readonly buscaDestinatarios$ = new Subject<string>();
  private readonly buscaIndividual$ = new Subject<string>();
  private readonly buscaTeste$ = new Subject<string>();

  readonly assuntoPadrao = ASSUNTO_PADRAO;
  readonly assuntoPlaceholders = ASSUNTO_PLACEHOLDERS;

  readonly carregando = signal(false);
  readonly mensagem = signal('');
  readonly erro = signal('');

  readonly campos = signal<SolicitacaoCampo[]>([]);
  readonly grupos = signal<SolicitacaoGrupo[]>([]);
  readonly emailsIndividuais = signal<SolicitacaoEmailIndividual[]>([]);
  readonly visualizadores = signal<SolicitacaoVisualizador[]>([]);
  readonly solicitacoes = signal<SolicitacaoColaborador[]>([]);

  /** null = fechado; -1 = novo grupo; id > 0 = editando */
  readonly editandoGrupoId = signal<number | null>(null);
  readonly salvandoGrupo = signal(false);
  readonly grupoNome = signal('');
  readonly grupoAssunto = signal('');
  readonly grupoDestinatarios = signal<string[]>([]);
  readonly grupoEmailNovo = signal('');
  readonly grupoCamposSel = signal<string[]>([]);
  readonly grupoAtivo = signal(true);
  readonly grupoOrdem = signal(0);

  /** null = fechado; -1 = novo; id > 0 = editando */
  readonly editandoIndividualId = signal<number | null>(null);
  readonly salvandoIndividual = signal(false);
  readonly individualNome = signal('');
  readonly individualEmail = signal('');
  readonly individualAssunto = signal('');
  readonly individualCamposSel = signal<string[]>([]);
  readonly individualAtivo = signal(true);
  readonly individualOrdem = signal(0);
  readonly resultadosIndividual = signal<UsuarioAdBusca[]>([]);
  readonly buscaIndividualTexto = signal('');

  readonly adicionarViewerAberto = signal(false);
  readonly resultadosBusca = signal<UsuarioAdBusca[]>([]);
  readonly buscaTexto = signal('');
  readonly resultadosDestinatarios = signal<UsuarioAdBusca[]>([]);
  readonly buscaDestinatariosTexto = signal('');
  readonly adicionandoVisualizador = signal(false);

  readonly expandedSolicitacaoId = signal<number | null>(null);
  readonly enviosPorSolicitacao = signal<Record<number, SolicitacaoEnvio[]>>({});
  readonly carregandoEnvios = signal<number | null>(null);

  readonly previewHtml = signal<SafeHtml | ''>('');
  readonly previewAberto = signal(false);
  readonly previewAssunto = signal('');
  readonly previewEhExemplo = signal(false);
  readonly previewCampos = signal<string[]>([]);
  readonly previewAssuntoTemplate = signal<string | null>(null);
  readonly carregandoPreview = signal(false);

  readonly modalTesteAberto = signal(false);
  readonly enviandoTeste = signal(false);
  readonly testeCampos = signal<string[]>([]);
  readonly testeAssunto = signal('');
  readonly testeEmail = signal('');
  readonly testeBuscaTexto = signal('');
  readonly resultadosTeste = signal<UsuarioAdBusca[]>([]);
  readonly destinoModo = signal<ModoDestinoEmail>('teste');
  readonly encaminharSolicitacaoId = signal<number | null>(null);
  readonly encaminharGrupoId = signal<number | null>(null);
  readonly encaminharEmailIndividualId = signal<number | null>(null);

  readonly abaAtiva = signal<AbaSolicitacao>('grupos');

  readonly camposDisponiveis = computed(() => this.campos());
  readonly editorAberto = computed(
    () => this.editandoGrupoId() !== null || this.editandoIndividualId() !== null
  );
  readonly editandoNovo = computed(() => this.editandoGrupoId() === -1);
  readonly modalGrupoAberto = computed(() => this.editandoGrupoId() !== null);
  readonly tituloModalGrupo = computed(() =>
    this.editandoNovo() ? 'Novo grupo' : 'Editar grupo'
  );
  readonly editandoIndividualNovo = computed(() => this.editandoIndividualId() === -1);
  readonly modalIndividualAberto = computed(() => this.editandoIndividualId() !== null);
  readonly tituloModalIndividual = computed(() =>
    this.editandoIndividualNovo() ? 'Novo e-mail individual' : 'Editar e-mail individual'
  );
  readonly tituloModalDestino = computed(() =>
    this.destinoModo() === 'encaminhar' ? 'Encaminhar e-mail' : 'Enviar e-mail teste'
  );
  readonly hintModalDestino = computed(() =>
    this.destinoModo() === 'encaminhar'
      ? 'Envia o e-mail desta solicitação (dados reais) para um destinatário. E-mails individuais mantêm o assunto configurado. Somente domínio interno.'
      : 'O e-mail usa dados de exemplo e o assunto recebe o prefixo [TESTE]. Destinatário: somente domínio interno.'
  );
  readonly saveLabelDestino = computed(() =>
    this.destinoModo() === 'encaminhar' ? 'Encaminhar' : 'Enviar teste'
  );

  constructor() {
    effect(() => {
      const msg = this.mensagem();
      if (msg) this.alertas.sucesso(msg);
    });
    effect(() => {
      const err = this.erro();
      if (err) this.alertas.erro(err);
    });
  }

  ngOnInit(): void {
    this.carregarTudo();
    const buscaAd = (q: string) =>
      q.trim().length >= 2 ? this.service.buscarUsuariosAd(q.trim()) : of([]);

    this.busca$
      .pipe(debounceTime(300), distinctUntilChanged(), switchMap(buscaAd))
      .subscribe({
        next: (list) => this.resultadosBusca.set(list),
        error: () => this.erro.set('Erro na busca de colaboradores.'),
      });

    this.buscaDestinatarios$
      .pipe(debounceTime(300), distinctUntilChanged(), switchMap(buscaAd))
      .subscribe({
        next: (list) => this.resultadosDestinatarios.set(list),
        error: () => this.erro.set('Erro na busca de destinatários.'),
      });

    this.buscaIndividual$
      .pipe(debounceTime(300), distinctUntilChanged(), switchMap(buscaAd))
      .subscribe({
        next: (list) => this.resultadosIndividual.set(list),
        error: () => this.erro.set('Erro na busca de destinatários.'),
      });

    this.buscaTeste$
      .pipe(debounceTime(300), distinctUntilChanged(), switchMap(buscaAd))
      .subscribe({
        next: (list) => this.resultadosTeste.set(list),
        error: () => this.erro.set('Erro na busca de destinatários.'),
      });
  }

  carregarTudo(): void {
    this.carregando.set(true);
    this.service.listarCampos().subscribe({
      next: (c) => this.campos.set(c),
      error: () => {},
    });
    this.service.listarGrupos().subscribe({
      next: (g) => this.grupos.set(g),
      error: (e: HttpErrorResponse) => this.erro.set(e.error?.mensagem || 'Erro ao carregar grupos.'),
    });
    this.service.listarEmailsIndividuais().subscribe({
      next: (list) => this.emailsIndividuais.set(list),
      error: (e: HttpErrorResponse) =>
        this.erro.set(e.error?.mensagem || 'Erro ao carregar e-mails individuais.'),
    });
    this.service.listarVisualizadores().subscribe({
      next: (v) => this.visualizadores.set(v),
      error: (e: HttpErrorResponse) =>
        this.erro.set(e.error?.mensagem || 'Erro ao carregar visualizadores.'),
    });
    this.service.listarSolicitacoesAdmin().subscribe({
      next: (s) => {
        this.solicitacoes.set(s);
        this.carregando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.carregando.set(false);
        this.erro.set(e.error?.mensagem || 'Erro ao carregar histórico.');
      },
    });
  }

  selecionarAba(id: AbaSolicitacao): void {
    this.abaAtiva.set(id);
  }

  fecharModalGrupo(): void {
    this.cancelarEditor();
  }

  fecharModalIndividual(): void {
    this.cancelarEditorIndividual();
  }

  isExpandido(id: number): boolean {
    return this.expandedSolicitacaoId() === id;
  }

  labelCampo(chave: string): string {
    return this.campos().find((c) => c.chave === chave)?.label || chave;
  }

  isArquivo(chave: string): boolean {
    return this.campos().find((c) => c.chave === chave)?.tipo === 'file';
  }

  iniciais(nome: string): string {
    return (nome || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }

  resumoDestinatarios(emails: string[]): string {
    if (!emails?.length) return '—';
    if (emails.length === 1) return this.truncarEmail(emails[0]);
    return `${this.truncarEmail(emails[0])} +${emails.length - 1}`;
  }

  truncarEmail(email: string): string {
    const parts = email.split('@');
    if (parts[0].length <= 8) return email;
    return `${parts[0].slice(0, 6)}…@${parts[1] || ''}`;
  }

  truncarAssunto(assunto: string | null | undefined): string {
    const s = (assunto || '').trim() || ASSUNTO_PADRAO;
    if (s.length <= 64) return s;
    return `${s.slice(0, 61)}…`;
  }

  novoGrupo(): void {
    this.editandoIndividualId.set(null);
    this.editandoGrupoId.set(-1);
    this.grupoNome.set('');
    this.grupoAssunto.set(ASSUNTO_PADRAO);
    this.grupoDestinatarios.set([]);
    this.grupoEmailNovo.set('');
    this.buscaDestinatariosTexto.set('');
    this.resultadosDestinatarios.set([]);
    this.grupoCamposSel.set([]);
    this.grupoAtivo.set(true);
    this.grupoOrdem.set(this.grupos().length);
  }

  editarGrupo(g: SolicitacaoGrupo): void {
    this.editandoIndividualId.set(null);
    this.editandoGrupoId.set(g.id);
    this.grupoNome.set(g.nome);
    this.grupoAssunto.set(g.assunto || ASSUNTO_PADRAO);
    this.grupoDestinatarios.set([...g.destinatarios]);
    this.grupoEmailNovo.set('');
    this.buscaDestinatariosTexto.set('');
    this.resultadosDestinatarios.set([]);
    this.grupoCamposSel.set([...g.campos]);
    this.grupoAtivo.set(g.ativo);
    this.grupoOrdem.set(g.ordem);
  }

  cancelarEditor(): void {
    this.editandoGrupoId.set(null);
    this.buscaDestinatariosTexto.set('');
    this.resultadosDestinatarios.set([]);
  }

  toggleCampoGrupo(chave: string): void {
    const atual = this.grupoCamposSel();
    if (atual.includes(chave)) {
      this.grupoCamposSel.set(atual.filter((c) => c !== chave));
    } else {
      this.grupoCamposSel.set([...atual, chave]);
    }
  }

  adicionarEmailGrupo(): void {
    const email = this.grupoEmailNovo().trim().toLowerCase();
    if (!email) return;
    this.adicionarEmailDestinatario(email);
    this.grupoEmailNovo.set('');
  }

  adicionarDestinatarioDoAd(col: UsuarioAdBusca): void {
    const email = col.email?.trim().toLowerCase();
    if (!email) {
      this.erro.set('Colaborador sem e-mail cadastrado no AD.');
      return;
    }
    this.adicionarEmailDestinatario(email);
    this.buscaDestinatariosTexto.set('');
    this.resultadosDestinatarios.set([]);
  }

  private adicionarEmailDestinatario(email: string): void {
    if (this.grupoDestinatarios().includes(email)) {
      this.erro.set('E-mail já adicionado.');
      return;
    }
    this.grupoDestinatarios.update((list) => [...list, email]);
  }

  onBuscaDestinatario(q: string): void {
    this.buscaDestinatariosTexto.set(q);
    this.buscaDestinatarios$.next(q);
  }

  removerEmailGrupo(email: string): void {
    this.grupoDestinatarios.update((list) => list.filter((e) => e !== email));
  }

  onEmailGrupoKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.adicionarEmailGrupo();
    }
  }

  salvarGrupo(): void {
    const nome = this.grupoNome().trim();
    if (!nome) {
      this.erro.set('Informe o nome do grupo.');
      return;
    }
    if (!this.grupoDestinatarios().length) {
      this.erro.set('Adicione ao menos um destinatário.');
      return;
    }
    if (!this.grupoCamposSel().length) {
      this.erro.set('Selecione ao menos um campo.');
      return;
    }

    const assunto = this.grupoAssunto().trim() || null;
    const body = {
      nome,
      destinatarios: this.grupoDestinatarios(),
      campos: this.grupoCamposSel(),
      assunto,
      ativo: this.grupoAtivo(),
      ordem: this.grupoOrdem(),
    };

    this.salvandoGrupo.set(true);
    const id = this.editandoGrupoId();
    const req =
      id && id > 0 ? this.service.atualizarGrupo(id, body) : this.service.criarGrupo(body);

    req.subscribe({
      next: () => {
        this.salvandoGrupo.set(false);
        this.editandoGrupoId.set(null);
        this.mensagem.set(id && id > 0 ? 'Grupo atualizado.' : 'Grupo criado.');
        this.service.listarGrupos().subscribe({ next: (g) => this.grupos.set(g) });
      },
      error: (e: HttpErrorResponse) => {
        this.salvandoGrupo.set(false);
        this.erro.set(e.error?.mensagem || 'Erro ao salvar grupo.');
      },
    });
  }

  toggleGrupoAtivo(g: SolicitacaoGrupo): void {
    const novoAtivo = !g.ativo;
    this.service
      .atualizarGrupo(g.id, {
        nome: g.nome,
        destinatarios: g.destinatarios,
        campos: g.campos,
        assunto: g.assunto ?? null,
        ativo: novoAtivo,
        ordem: g.ordem,
      })
      .subscribe({
        next: (updated) => {
          this.grupos.update((list) => list.map((x) => (x.id === g.id ? updated : x)));
        },
        error: (e: HttpErrorResponse) => this.erro.set(e.error?.mensagem || 'Erro ao atualizar grupo.'),
      });
  }

  excluirGrupo(g: SolicitacaoGrupo): void {
    this.alertas.confirmarExclusao({ texto: `Excluir o grupo "${g.nome}"?` }).then((ok) => {
      if (!ok) return;
      this.service.removerGrupo(g.id).subscribe({
        next: () => {
          this.mensagem.set('Grupo excluído.');
          this.grupos.update((list) => list.filter((x) => x.id !== g.id));
          if (this.editandoGrupoId() === g.id) this.editandoGrupoId.set(null);
        },
        error: (e: HttpErrorResponse) => this.erro.set(e.error?.mensagem || 'Erro ao excluir.'),
      });
    });
  }

  novoIndividual(): void {
    this.editandoGrupoId.set(null);
    this.editandoIndividualId.set(-1);
    this.individualNome.set('');
    this.individualEmail.set('');
    this.individualAssunto.set(ASSUNTO_PADRAO);
    this.individualCamposSel.set([]);
    this.individualAtivo.set(true);
    this.individualOrdem.set(this.emailsIndividuais().length);
    this.buscaIndividualTexto.set('');
    this.resultadosIndividual.set([]);
  }

  editarIndividual(item: SolicitacaoEmailIndividual): void {
    this.editandoGrupoId.set(null);
    this.editandoIndividualId.set(item.id);
    this.individualNome.set(item.nome || '');
    this.individualEmail.set(item.email);
    this.individualAssunto.set(item.assunto || ASSUNTO_PADRAO);
    this.individualCamposSel.set([...item.campos]);
    this.individualAtivo.set(item.ativo);
    this.individualOrdem.set(item.ordem);
    this.buscaIndividualTexto.set('');
    this.resultadosIndividual.set([]);
  }

  cancelarEditorIndividual(): void {
    this.editandoIndividualId.set(null);
    this.buscaIndividualTexto.set('');
    this.resultadosIndividual.set([]);
  }

  toggleCampoIndividual(chave: string): void {
    const atual = this.individualCamposSel();
    if (atual.includes(chave)) {
      this.individualCamposSel.set(atual.filter((c) => c !== chave));
    } else {
      this.individualCamposSel.set([...atual, chave]);
    }
  }

  onBuscaIndividual(q: string): void {
    this.buscaIndividualTexto.set(q);
    this.buscaIndividual$.next(q);
  }

  selecionarEmailIndividualDoAd(col: UsuarioAdBusca): void {
    const email = col.email?.trim().toLowerCase();
    if (!email) {
      this.erro.set('Colaborador sem e-mail cadastrado no AD.');
      return;
    }
    this.individualEmail.set(email);
    if (!this.individualNome().trim()) {
      this.individualNome.set(col.nome || '');
    }
    this.buscaIndividualTexto.set('');
    this.resultadosIndividual.set([]);
  }

  salvarIndividual(): void {
    const email = this.individualEmail().trim().toLowerCase();
    if (!email) {
      this.erro.set('Informe o e-mail do destinatário.');
      return;
    }
    if (!this.individualCamposSel().length) {
      this.erro.set('Selecione ao menos um campo.');
      return;
    }

    const body = {
      nome: this.individualNome().trim() || null,
      email,
      assunto: this.individualAssunto().trim() || null,
      campos: this.individualCamposSel(),
      ativo: this.individualAtivo(),
      ordem: this.individualOrdem(),
    };

    this.salvandoIndividual.set(true);
    const id = this.editandoIndividualId();
    const req =
      id && id > 0
        ? this.service.atualizarEmailIndividual(id, body)
        : this.service.criarEmailIndividual(body);

    req.subscribe({
      next: () => {
        this.salvandoIndividual.set(false);
        this.editandoIndividualId.set(null);
        this.mensagem.set(id && id > 0 ? 'E-mail individual atualizado.' : 'E-mail individual criado.');
        this.service.listarEmailsIndividuais().subscribe({
          next: (list) => this.emailsIndividuais.set(list),
        });
      },
      error: (e: HttpErrorResponse) => {
        this.salvandoIndividual.set(false);
        this.erro.set(e.error?.mensagem || 'Erro ao salvar e-mail individual.');
      },
    });
  }

  toggleIndividualAtivo(item: SolicitacaoEmailIndividual): void {
    this.service
      .atualizarEmailIndividual(item.id, {
        nome: item.nome ?? null,
        email: item.email,
        assunto: item.assunto ?? null,
        campos: item.campos,
        ativo: !item.ativo,
        ordem: item.ordem,
      })
      .subscribe({
        next: (updated) => {
          this.emailsIndividuais.update((list) =>
            list.map((x) => (x.id === item.id ? updated : x))
          );
        },
        error: (e: HttpErrorResponse) =>
          this.erro.set(e.error?.mensagem || 'Erro ao atualizar e-mail individual.'),
      });
  }

  excluirIndividual(item: SolicitacaoEmailIndividual): void {
    const label = item.nome || item.email;
    this.alertas.confirmarExclusao({ texto: `Excluir o e-mail individual "${label}"?` }).then((ok) => {
      if (!ok) return;
      this.service.removerEmailIndividual(item.id).subscribe({
        next: () => {
          this.mensagem.set('E-mail individual excluído.');
          this.emailsIndividuais.update((list) => list.filter((x) => x.id !== item.id));
          if (this.editandoIndividualId() === item.id) this.editandoIndividualId.set(null);
        },
        error: (e: HttpErrorResponse) => this.erro.set(e.error?.mensagem || 'Erro ao excluir.'),
      });
    });
  }

  abrirAdicionarViewer(): void {
    this.adicionarViewerAberto.set(true);
    this.buscaTexto.set('');
    this.resultadosBusca.set([]);
  }

  onBuscaVisualizador(q: string): void {
    this.buscaTexto.set(q);
    this.busca$.next(q);
  }

  adicionarVisualizador(col: UsuarioAdBusca): void {
    if (!col.email?.trim()) {
      this.erro.set('Colaborador sem e-mail cadastrado.');
      return;
    }
    const email = col.email.toLowerCase();
    if (this.visualizadores().some((v) => v.email.toLowerCase() === email)) {
      this.erro.set('Este colaborador já possui acesso de visualização.');
      return;
    }
    this.adicionandoVisualizador.set(true);
    this.service.adicionarVisualizador({ colaborador_id: col.id }).subscribe({
      next: (v) => {
        this.adicionandoVisualizador.set(false);
        this.visualizadores.update((list) =>
          [...list, v].sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, 'pt-BR'))
        );
        this.adicionarViewerAberto.set(false);
        this.buscaTexto.set('');
        this.resultadosBusca.set([]);
        this.mensagem.set('Visualizador adicionado.');
      },
      error: (e: HttpErrorResponse) => {
        this.adicionandoVisualizador.set(false);
        this.erro.set(e.error?.mensagem || 'Erro ao adicionar visualizador.');
      },
    });
  }

  removerVisualizador(v: SolicitacaoVisualizador): void {
    this.alertas
      .confirmar({
        titulo: 'Remover visualizador',
        texto: `Remover o acesso de ${v.nome_completo}?`,
        confirmar: 'Remover',
      })
      .then((ok) => {
        if (!ok) return;
        this.service.removerVisualizador(v.usuario_id).subscribe({
          next: () => {
            this.visualizadores.update((list) =>
              list.filter((x) => x.usuario_id !== v.usuario_id)
            );
            this.mensagem.set('Visualizador removido.');
          },
          error: (e: HttpErrorResponse) => this.erro.set(e.error?.mensagem || 'Erro ao remover.'),
        });
      });
  }

  toggleDetalhes(s: SolicitacaoColaborador): void {
    if (this.expandedSolicitacaoId() === s.id) {
      this.expandedSolicitacaoId.set(null);
      return;
    }
    this.expandedSolicitacaoId.set(s.id);
    if (this.enviosPorSolicitacao()[s.id]) return;

    this.carregandoEnvios.set(s.id);
    this.service.obterSolicitacaoAdmin(s.id).subscribe({
      next: (d) => {
        this.enviosPorSolicitacao.update((map) => ({
          ...map,
          [s.id]: this.ultimosEnviosPorDestino(d.envios),
        }));
        this.carregandoEnvios.set(null);
      },
      error: (e: HttpErrorResponse) => {
        this.carregandoEnvios.set(null);
        this.erro.set(e.error?.mensagem || 'Erro ao carregar envios.');
      },
    });
  }

  /** Mantém o envio mais recente de cada grupo/individual para exibição no expand. */
  private ultimosEnviosPorDestino(envios: SolicitacaoEnvio[]): SolicitacaoEnvio[] {
    const map = new Map<string, SolicitacaoEnvio>();
    for (const e of envios) {
      const encaminhado = PREFIXO_ENCAMINHADO.test(e.grupo_nome || '');
      const base = e.email_individual_id
        ? `i:${e.email_individual_id}`
        : `g:${e.grupo_id ?? e.grupo_nome}`;
      const key = encaminhado ? `fwd:${e.id}` : base;
      const prev = map.get(key);
      if (!prev || (e.enviado_em && prev.enviado_em && e.enviado_em > prev.enviado_em)) {
        map.set(key, e);
      }
    }
    return [...map.values()];
  }

  enviosExpandidos(id: number): SolicitacaoEnvio[] {
    return this.enviosPorSolicitacao()[id] || [];
  }

  enviosGrupos(id: number): SolicitacaoEnvio[] {
    return this.enviosExpandidos(id).filter(
      (e) => !e.email_individual_id && !this.isEnvioEncaminhado(e)
    );
  }

  enviosIndividuais(id: number): SolicitacaoEnvio[] {
    return this.enviosExpandidos(id).filter(
      (e) => !!e.email_individual_id && !this.isEnvioEncaminhado(e)
    );
  }

  enviosEncaminhados(id: number): SolicitacaoEnvio[] {
    return this.enviosExpandidos(id).filter((e) => this.isEnvioEncaminhado(e));
  }

  nomeEnvio(e: SolicitacaoEnvio): string {
    let nome = (e.grupo_nome || '').trim();
    nome = nome.replace(PREFIXO_ENCAMINHADO, '').replace(PREFIXO_INDIVIDUAL, '').trim();
    return nome || e.destinatarios?.[0] || '—';
  }

  isEnvioIndividual(e: SolicitacaoEnvio): boolean {
    return !!e.email_individual_id && !this.isEnvioEncaminhado(e);
  }

  isEnvioEncaminhado(e: SolicitacaoEnvio): boolean {
    return PREFIXO_ENCAMINHADO.test(e.grupo_nome || '');
  }

  verTemplateGrupo(g: SolicitacaoGrupo): void {
    this.abrirPreviewTemplate(g.campos, g.assunto);
  }

  verTemplateIndividual(item: SolicitacaoEmailIndividual): void {
    this.abrirPreviewTemplate(item.campos, item.assunto);
  }

  previewModalGrupo(): void {
    this.abrirPreviewTemplate(this.grupoCamposSel(), this.grupoAssunto().trim() || null);
  }

  previewModalIndividual(): void {
    this.abrirPreviewTemplate(this.individualCamposSel(), this.individualAssunto().trim() || null);
  }

  private abrirPreviewTemplate(campos: string[], assunto?: string | null): void {
    if (!campos?.length) {
      this.erro.set('Selecione ao menos um campo para visualizar o template.');
      return;
    }
    this.carregandoPreview.set(true);
    this.service.previewTemplate({ campos, assunto: assunto || null }).subscribe({
      next: (r) => {
        this.carregandoPreview.set(false);
        this.abrirPainelPreview(r.html, r.subject, {
          exemplo: true,
          campos,
          assuntoTemplate: assunto || null,
        });
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoPreview.set(false);
        this.erro.set(err.error?.mensagem || 'Erro no preview.');
      },
    });
  }

  private abrirPainelPreview(
    html: string,
    subject: string | undefined,
    opts: { exemplo: boolean; campos?: string[]; assuntoTemplate?: string | null }
  ): void {
    this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
    this.previewAssunto.set(subject || '');
    this.previewEhExemplo.set(opts.exemplo);
    this.previewCampos.set(opts.campos ? [...opts.campos] : []);
    this.previewAssuntoTemplate.set(opts.assuntoTemplate ?? null);
    this.previewAberto.set(true);
  }

  abrirEnvioTesteGrupo(g: SolicitacaoGrupo): void {
    this.abrirEnvioTeste(g.campos, g.assunto);
  }

  abrirEnvioTesteIndividual(item: SolicitacaoEmailIndividual): void {
    this.abrirEnvioTeste(item.campos, item.assunto);
  }

  abrirEnvioTesteDoPreview(): void {
    this.abrirEnvioTeste(this.previewCampos(), this.previewAssuntoTemplate());
  }

  abrirEnvioTeste(campos: string[], assunto?: string | null): void {
    if (!campos?.length) {
      this.erro.set('Selecione ao menos um campo para enviar o teste.');
      return;
    }
    this.destinoModo.set('teste');
    this.encaminharSolicitacaoId.set(null);
    this.encaminharGrupoId.set(null);
    this.encaminharEmailIndividualId.set(null);
    this.testeCampos.set([...campos]);
    this.testeAssunto.set(assunto || '');
    this.testeEmail.set('');
    this.testeBuscaTexto.set('');
    this.resultadosTeste.set([]);
    this.modalTesteAberto.set(true);
  }

  abrirEncaminharEnvio(solicitacaoId: number, e: SolicitacaoEnvio): void {
    if (!e.grupo_id && !e.email_individual_id) {
      this.erro.set('Não é possível encaminhar este envio.');
      return;
    }
    this.destinoModo.set('encaminhar');
    this.encaminharSolicitacaoId.set(solicitacaoId);
    this.encaminharGrupoId.set(e.grupo_id ?? null);
    this.encaminharEmailIndividualId.set(e.email_individual_id ?? null);
    this.testeEmail.set('');
    this.testeBuscaTexto.set('');
    this.resultadosTeste.set([]);
    this.modalTesteAberto.set(true);
  }

  onBuscaTeste(q: string): void {
    this.testeBuscaTexto.set(q);
    this.buscaTeste$.next(q);
  }

  selecionarEmailTesteDoAd(col: UsuarioAdBusca): void {
    const email = col.email?.trim().toLowerCase();
    if (!email) {
      this.erro.set('Colaborador sem e-mail cadastrado no AD.');
      return;
    }
    this.testeEmail.set(email);
    this.testeBuscaTexto.set('');
    this.resultadosTeste.set([]);
  }

  fecharModalTeste(): void {
    this.modalTesteAberto.set(false);
    this.testeBuscaTexto.set('');
    this.resultadosTeste.set([]);
    this.encaminharSolicitacaoId.set(null);
    this.encaminharGrupoId.set(null);
    this.encaminharEmailIndividualId.set(null);
    this.destinoModo.set('teste');
  }

  enviarEmailTeste(): void {
    const email = this.testeEmail().trim().toLowerCase();
    if (!email) {
      this.erro.set('Informe o e-mail de destino.');
      return;
    }
    if (this.destinoModo() === 'encaminhar') {
      this.confirmarEncaminhar(email);
      return;
    }
    this.enviandoTeste.set(true);
    this.service
      .enviarTeste({
        campos: this.testeCampos(),
        assunto: this.testeAssunto().trim() || null,
        email,
      })
      .subscribe({
        next: () => {
          this.enviandoTeste.set(false);
          this.fecharModalTeste();
          this.mensagem.set(`E-mail teste enviado para ${email}.`);
        },
        error: (e: HttpErrorResponse) => {
          this.enviandoTeste.set(false);
          this.erro.set(e.error?.mensagem || 'Erro ao enviar e-mail teste.');
        },
      });
  }

  private confirmarEncaminhar(email: string): void {
    const solicitacaoId = this.encaminharSolicitacaoId();
    if (!solicitacaoId) {
      this.erro.set('Solicitação inválida para encaminhar.');
      return;
    }
    const body: { email: string; grupoId?: number; emailIndividualId?: number } = { email };
    const emailIndividualId = this.encaminharEmailIndividualId();
    const grupoId = this.encaminharGrupoId();
    if (emailIndividualId) body.emailIndividualId = emailIndividualId;
    else if (grupoId) body.grupoId = grupoId;
    else {
      this.erro.set('Origem do encaminhamento inválida.');
      return;
    }

    this.enviandoTeste.set(true);
    this.service.encaminharEmail(solicitacaoId, body).subscribe({
      next: () => {
        this.enviandoTeste.set(false);
        this.fecharModalTeste();
        this.mensagem.set(`E-mail encaminhado para ${email}.`);
        this.service.obterSolicitacaoAdmin(solicitacaoId).subscribe({
          next: (d) => {
            this.enviosPorSolicitacao.update((map) => ({
              ...map,
              [solicitacaoId]: this.ultimosEnviosPorDestino(d.envios),
            }));
          },
        });
      },
      error: (e: HttpErrorResponse) => {
        this.enviandoTeste.set(false);
        this.erro.set(e.error?.mensagem || 'Erro ao encaminhar e-mail.');
      },
    });
  }

  previewEnvio(solicitacaoId: number, e: SolicitacaoEnvio): void {
    if (e.email_individual_id) {
      this.service.previewEmailIndividual(solicitacaoId, e.email_individual_id).subscribe({
        next: (r) => this.abrirPainelPreview(r.html, r.subject, { exemplo: false }),
        error: (err: HttpErrorResponse) =>
          this.erro.set(err.error?.mensagem || 'Erro no preview.'),
      });
      return;
    }
    if (!e.grupo_id) return;
    this.service.previewEmail(solicitacaoId, e.grupo_id).subscribe({
      next: (r) => this.abrirPainelPreview(r.html, r.subject, { exemplo: false }),
      error: (err: HttpErrorResponse) => this.erro.set(err.error?.mensagem || 'Erro no preview.'),
    });
  }

  reenviarEnvio(solicitacaoId: number, e: SolicitacaoEnvio): void {
    const isIndividual = !!e.email_individual_id;
    const nome = e.grupo_nome;
    this.alertas
      .confirmar({
        titulo: 'Reenviar e-mail',
        texto: isIndividual
          ? `Reenviar e-mail individual "${nome}"?`
          : `Reenviar e-mail do grupo "${nome}"?`,
        confirmar: 'Reenviar',
      })
      .then((ok) => {
        if (!ok) return;
        const req = isIndividual
          ? this.service.reenviarEmailIndividual(solicitacaoId, e.email_individual_id!)
          : e.grupo_id
            ? this.service.reenviarEmail(solicitacaoId, e.grupo_id)
            : null;
        if (!req) return;
        req.subscribe({
          next: () => {
            this.mensagem.set('Reenvio solicitado.');
            this.service.obterSolicitacaoAdmin(solicitacaoId).subscribe({
              next: (d) => {
                this.enviosPorSolicitacao.update((map) => ({
                  ...map,
                  [solicitacaoId]: this.ultimosEnviosPorDestino(d.envios),
                }));
              },
            });
          },
          error: (err: HttpErrorResponse) =>
            this.erro.set(err.error?.mensagem || 'Erro no reenvio.'),
        });
      });
  }

  fecharPreview(): void {
    this.previewAberto.set(false);
    this.previewHtml.set('');
    this.previewAssunto.set('');
    this.previewEhExemplo.set(false);
    this.previewCampos.set([]);
    this.previewAssuntoTemplate.set(null);
  }

  badgeClass(status: string): string {
    if (status === 'enviada') return 'b-ok';
    if (status === 'parcial') return 'b-parcial';
    return 'b-erro';
  }

  labelStatus(status: string): string {
    const map: Record<string, string> = {
      recebida: 'Recebida',
      enviada: 'Enviada',
      parcial: 'Parcial',
      erro: 'Erro',
    };
    return map[status] || status;
  }

  labelTipo(tipo: string): string {
    const map: Record<string, string> = {
      novo: 'Novo',
      reposicao: 'Reposição',
      mudanca: 'Mudança',
      efetivacao: 'Efetivação',
    };
    return map[tipo] || tipo;
  }
}
