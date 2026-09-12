import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AdminDropzoneComponent } from '../../../shared/admin/admin-dropzone/admin-dropzone.component';
import { AniversarioMaskDirective } from '../../../shared/directives/aniversario-mask.directive';
import { AlertasService } from '../../../services/alertas.service';
import { ColaboradoresService } from '../../../services/colaboradores.service';
import {
  ColaboradorAdmin,
  ColaboradorTenantFiltro,
  ColaboradoresImportAplicarResposta,
  ColaboradoresImportPreviewResposta,
  ComSemFiltro,
  PendenciaCampo,
} from '../../../models/colaborador.model';
import { empresaParaClasse, labelEmpresa } from '../../../utils/empresa-classe.util';

type AtivoFiltro = '1' | '0' | 'todos';
type AbaColaboradores = 'todos' | 'pendentes' | 'import_export';

const PENDENCIA_LABELS: Record<PendenciaCampo, string> = {
  cargo: 'Cargo',
  empresa: 'Empresa',
  ramal: 'Ramal',
  celular: 'Celular',
  telefone_fixo: 'Tel. fixo',
  aniversario: 'Aniversário',
  sem_contato: 'Sem contato',
};

const IMPORT_CAMPO_LABELS: Record<string, string> = {
  cargo: 'Cargo',
  departamento: 'Departamento',
  celular: 'Celular',
  telefone_fixo: 'Tel. fixo',
  ramal: 'Ramal',
  aniversario: 'Aniversário',
};

@Component({
  selector: 'app-colaboradores-admin',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, AdminModalComponent, AdminDropzoneComponent, AniversarioMaskDirective],
  templateUrl: './colaboradores-admin.component.html',
  styleUrl: './colaboradores-admin.component.scss',
})
export class ColaboradoresAdminComponent implements OnInit {
  private readonly colaboradoresService = inject(ColaboradoresService);
  private readonly alertas = inject(AlertasService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly busca$ = new Subject<string>();

  readonly editForm = this.fb.group({
    cargo: [''],
    departamento: ['', Validators.required],
    celular: [''],
    telefone_fixo: [''],
    ramal: [''],
    aniversario: [''],
  });

  private readonly formValores = signal({
    cargo: '',
    departamento: '',
    celular: '',
    telefone_fixo: '',
    ramal: '',
    aniversario: '',
  });

  readonly abaAtiva = signal<AbaColaboradores>('todos');
  readonly colaboradores = signal<ColaboradorAdmin[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = signal(50);
  readonly carregando = signal(false);
  readonly sincronizando = signal(false);
  readonly stats = signal<{
    ativos: number;
    inativos: number;
    ultima_sync: string | null;
    incompletos_ativos: number;
  } | null>(null);

  readonly buscaTexto = signal('');
  readonly filtroEmpresa = signal('');
  readonly filtroDepartamento = signal('');
  readonly filtroAtivo = signal<AtivoFiltro>('1');
  readonly filtroTenant = signal('');
  readonly filtroIntranet = signal<'' | ComSemFiltro>('');
  readonly filtroCargo = signal<'' | ComSemFiltro>('');
  readonly filtroEmpresaStatus = signal<'' | ComSemFiltro>('');

  readonly empresas = signal<string[]>([]);
  readonly departamentos = signal<string[]>([]);
  readonly tenants = signal<ColaboradorTenantFiltro[]>([]);

  readonly modalAberto = signal(false);
  readonly detalhe = signal<ColaboradorAdmin | null>(null);
  readonly detalheCarregando = signal(false);
  readonly modalSalvando = signal(false);
  readonly fotoUrls = signal<Record<number, string>>({});

  readonly mensagem = signal('');
  readonly erro = signal('');

  readonly exportando = signal(false);
  readonly importPreview = signal<ColaboradoresImportPreviewResposta | null>(null);
  readonly importResultado = signal<ColaboradoresImportAplicarResposta | null>(null);
  readonly importCarregando = signal(false);
  readonly importAplicando = signal(false);
  readonly arquivoImport = signal<File | null>(null);

  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.total() / this.limit())));
  readonly exibirLista = computed(() => this.abaAtiva() !== 'import_export');
  readonly previewLinhasFlat = computed(() => {
    const preview = this.importPreview();
    if (!preview) return [];
    const rows: {
      linha: number;
      nome: string;
      campo: string;
      de: string;
      para: string;
      status: string;
      statusClass: string;
    }[] = [];

    for (const l of preview.linhas) {
      if (l.erros.length) {
        rows.push({
          linha: l.linha,
          nome: l.nome || l.email || '—',
          campo: '—',
          de: '—',
          para: '—',
          status: l.erros.join('; '),
          statusClass: 'status-erro',
        });
        continue;
      }
      if (!l.alteracoes.length) {
        rows.push({
          linha: l.linha,
          nome: l.nome || l.email || '—',
          campo: '—',
          de: '—',
          para: '—',
          status: 'Sem alterações',
          statusClass: 'status-neutro',
        });
        continue;
      }
      for (const alt of l.alteracoes) {
        rows.push({
          linha: l.linha,
          nome: l.nome || l.email || '—',
          campo: IMPORT_CAMPO_LABELS[alt.campo] || alt.campo,
          de: alt.de ?? '—',
          para: alt.para ?? '(vazio)',
          status: l.aplicavel ? 'Pronto' : 'Ignorado',
          statusClass: l.aplicavel ? 'status-ok' : 'status-neutro',
        });
      }
    }
    return rows;
  });
  readonly ultimaSyncLabel = computed(() => {
    const raw = this.stats()?.ultima_sync;
    if (!raw) return 'Nunca';
    try {
      return new Date(raw).toLocaleString('pt-BR');
    } catch {
      return raw;
    }
  });

  readonly exibirColunaPendencias = computed(() => this.abaAtiva() === 'pendentes');

  readonly modalPodeEditar = computed(() => {
    const c = this.detalhe();
    return !!(c?.ativo && c?.ad_id);
  });

  readonly modalTemAlteracoes = computed(() => {
    const c = this.detalhe();
    if (!c) return false;
    const v = this.formValores();
    return (
      this.normCampo(v.cargo) !== this.normCampo(c.cargo) ||
      this.normCampo(v.departamento) !== this.normCampo(c.departamento) ||
      this.normCampo(v.celular) !== this.normCampo(c.celular) ||
      this.normCampo(v.telefone_fixo) !== this.normCampo(c.telefone_fixo) ||
      this.normCampo(v.ramal) !== this.normCampo(c.ramal) ||
      this.normCampo(v.aniversario) !== this.normCampo(this.formatAniversario(c))
    );
  });

  readonly modalSalvarDesabilitado = computed(
    () =>
      !this.modalPodeEditar() ||
      !this.modalTemAlteracoes() ||
      this.editForm.invalid ||
      this.modalSalvando()
  );

  readonly modalSaveLabel = computed(() =>
    this.modalSalvando() ? 'Salvando…' : 'Salvar alterações'
  );

  readonly modalAcessoLabel = computed(() => {
    const c = this.detalhe();
    if (!c) return 'Gerenciar acesso';
    return c.intranet.cadastrado ? 'Gerenciar acesso' : 'Provisionar acesso';
  });

  readonly modalSubtitle = computed(() => this.detalhe()?.email || '');

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
    this.carregarStats();
    this.carregarFiltros();
    this.carregarLista();

    this.editForm.valueChanges.subscribe(() => {
      this.formValores.set(this.editForm.getRawValue() as {
        cargo: string;
        departamento: string;
        celular: string;
        telefone_fixo: string;
        ramal: string;
        aniversario: string;
      });
    });

    this.busca$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.page.set(1);
        this.carregarLista();
      });
  }

  carregarStats(): void {
    this.colaboradoresService.obterStats().subscribe({
      next: (s) => this.stats.set(s),
      error: () => {},
    });
  }

  carregarFiltros(): void {
    this.colaboradoresService.obterFiltrosAdmin().subscribe({
      next: (res) => {
        this.empresas.set(res.empresas);
        this.departamentos.set(res.departamentos);
        this.tenants.set(res.tenants);
      },
    });
  }

  selecionarAba(aba: AbaColaboradores): void {
    if (this.abaAtiva() === aba) return;
    this.abaAtiva.set(aba);
    if (aba === 'pendentes') {
      this.filtroAtivo.set('1');
    }
    if (aba === 'import_export') {
      this.limparImport();
    } else {
      this.page.set(1);
      this.carregarLista();
    }
  }

  filtrosAtivos() {
    const tenantId = Number(this.filtroTenant());
    return {
      busca: this.buscaTexto(),
      empresa: this.filtroEmpresa() || undefined,
      departamento: this.filtroDepartamento() || undefined,
      ativo: this.filtroAtivo(),
      tenant_id: tenantId > 0 ? tenantId : undefined,
      intranet: this.filtroIntranet() || undefined,
      cargo: this.filtroCargo() || undefined,
      empresa_status: this.filtroEmpresaStatus() || undefined,
      incompletos: this.abaAtiva() === 'pendentes',
    };
  }

  carregarLista(): void {
    this.carregando.set(true);
    this.colaboradoresService
      .listarAdmin({
        ...this.filtrosAtivos(),
        page: this.page(),
        limit: this.limit(),
      })
      .subscribe({
        next: (res) => {
          this.colaboradores.set(res.colaboradores);
          this.total.set(res.total);
          this.page.set(res.page);
          this.carregando.set(false);
          this.carregarFotos(res.colaboradores);
        },
        error: (err: HttpErrorResponse) => {
          this.carregando.set(false);
          this.erro.set(err.error?.mensagem || 'Erro ao carregar colaboradores.');
        },
      });
  }

  private carregarFotos(list: ColaboradorAdmin[]): void {
    for (const c of list) {
      if (c.tem_foto === false || this.fotoUrls()[c.id]) continue;
      this.colaboradoresService.fotoObjectUrl(c.id).then((url) => {
        if (!url) return;
        this.fotoUrls.update((m) => ({ ...m, [c.id]: url }));
      });
    }
  }

  onBuscaInput(value: string): void {
    this.buscaTexto.set(value);
    this.busca$.next(value);
  }

  onFiltroChange(): void {
    this.page.set(1);
    this.carregarLista();
  }

  paginaAnterior(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.carregarLista();
  }

  paginaProxima(): void {
    if (this.page() >= this.totalPaginas()) return;
    this.page.update((p) => p + 1);
    this.carregarLista();
  }

  exportarPlanilha(): void {
    if (this.exportando()) return;
    this.exportando.set(true);
    this.colaboradoresService.exportarAdmin(this.filtrosAtivos()).subscribe({
      next: (blob) => {
        this.exportando.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `colaboradores-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.mensagem.set('Planilha exportada com sucesso.');
      },
      error: async (err: HttpErrorResponse) => {
        this.exportando.set(false);
        this.erro.set(
          await this.colaboradoresService.mensagemErroHttp(err, 'Erro ao exportar planilha.')
        );
      },
    });
  }

  onArquivoImport(file: File): void {
    this.arquivoImport.set(file);
    this.importResultado.set(null);
    this.importCarregando.set(true);
    this.colaboradoresService.previewImport(file).subscribe({
      next: (preview) => {
        this.importPreview.set(preview);
        this.importCarregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.importCarregando.set(false);
        this.importPreview.set(null);
        this.erro.set(err.error?.mensagem || 'Erro ao analisar planilha.');
      },
    });
  }

  limparImport(): void {
    this.arquivoImport.set(null);
    this.importPreview.set(null);
    this.importResultado.set(null);
    this.importCarregando.set(false);
    this.importAplicando.set(false);
  }

  async aplicarImportacao(): Promise<void> {
    const arquivo = this.arquivoImport();
    const preview = this.importPreview();
    if (!arquivo || !preview?.resumo.aplicaveis) return;

    const ok = await this.alertas.confirmar({
      titulo: 'Aplicar alterações no Graph?',
      texto: `${preview.resumo.aplicaveis} linha(s) serão atualizadas no Azure AD. Ramal e aniversário não são alterados por este fluxo.`,
      confirmar: 'Aplicar no Graph',
      icon: 'warning',
    });
    if (!ok) return;

    this.importAplicando.set(true);
    this.colaboradoresService.aplicarImport(arquivo).subscribe({
      next: (res) => {
        this.importAplicando.set(false);
        this.importResultado.set(res);
        const erros = res.erros?.length ?? 0;
        this.mensagem.set(
          `Importação concluída: ${res.aplicados} aplicado(s), ${res.ignorados} ignorado(s)` +
            (erros ? `, ${erros} erro(s).` : '.')
        );
        this.carregarStats();
        this.carregarFiltros();
      },
      error: (err: HttpErrorResponse) => {
        this.importAplicando.set(false);
        this.erro.set(err.error?.mensagem || 'Erro ao aplicar importação.');
      },
    });
  }

  sincronizar(): void {
    if (this.sincronizando()) return;
    this.sincronizando.set(true);
    this.colaboradoresService.sincronizar().subscribe({
      next: (resumo) => {
        this.sincronizando.set(false);
        const erros = resumo.erros?.length ?? 0;
        this.mensagem.set(
          `Sincronização concluída: ${resumo.total} registro(s) atualizado(s)` +
            (erros ? ` (${erros} tenant(s) com erro)` : '') +
            '.'
        );
        this.carregarStats();
        this.carregarFiltros();
        this.carregarLista();
      },
      error: (err: HttpErrorResponse) => {
        this.sincronizando.set(false);
        this.erro.set(err.error?.mensagem || 'Erro ao sincronizar.');
      },
    });
  }

  abrirDetalhe(c: ColaboradorAdmin): void {
    this.detalheCarregando.set(true);
    this.modalAberto.set(true);
    this.colaboradoresService.obterAdmin(c.id).subscribe({
      next: (full) => {
        this.detalhe.set(full);
        this.patchEditForm(full);
        this.detalheCarregando.set(false);
        if (full.tem_foto !== false) {
          this.colaboradoresService.fotoObjectUrl(full.id).then((url) => {
            if (url) this.fotoUrls.update((m) => ({ ...m, [full.id]: url }));
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.detalheCarregando.set(false);
        this.modalAberto.set(false);
        this.erro.set(err.error?.mensagem || 'Erro ao carregar detalhes.');
      },
    });
  }

  private patchEditForm(c: ColaboradorAdmin): void {
    const valores = {
      cargo: c.cargo ?? '',
      departamento: c.departamento ?? '',
      celular: c.celular ?? '',
      telefone_fixo: c.telefone_fixo ?? '',
      ramal: c.ramal ?? '',
      aniversario: this.formatAniversario(c) === '—' ? '' : this.formatAniversario(c),
    };
    this.editForm.reset(valores, { emitEvent: false });
    this.formValores.set(valores);
    this.editForm.markAsPristine();
    if (c.ativo && c.ad_id) {
      this.editForm.enable({ emitEvent: false });
    } else {
      this.editForm.disable({ emitEvent: false });
    }
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.detalhe.set(null);
    this.editForm.reset();
    this.formValores.set({ cargo: '', departamento: '', celular: '', telefone_fixo: '', ramal: '', aniversario: '' });
  }

  onModalSave(): void {
    const c = this.detalhe();
    if (!c || this.modalSalvarDesabilitado()) return;

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      this.erro.set('Departamento é obrigatório.');
      return;
    }

    const raw = this.editForm.getRawValue();
    this.modalSalvando.set(true);
    this.colaboradoresService
      .atualizarGraph(c.id, {
        cargo: raw.cargo?.trim() || null,
        departamento: raw.departamento?.trim() || null,
        celular: raw.celular?.trim() || null,
        telefone_fixo: raw.telefone_fixo?.trim() || null,
        ramal: raw.ramal?.trim() || null,
        aniversario: raw.aniversario?.trim() || null,
      })
      .subscribe({
        next: (res) => {
          this.modalSalvando.set(false);
          if (res.alterado) {
            this.mensagem.set('Colaborador atualizado no Azure AD.');
          } else {
            this.mensagem.set('Nenhuma alteração detectada.');
          }
          this.fecharModal();
          this.carregarStats();
          this.carregarLista();
        },
        error: (err: HttpErrorResponse) => {
          this.modalSalvando.set(false);
          this.erro.set(err.error?.mensagem || 'Erro ao salvar alterações.');
        },
      });
  }

  irParaAcessos(provisionar?: boolean): void {
    const c = this.detalhe();
    if (!c) return;

    const prov = provisionar ?? !c.intranet.cadastrado;
    const queryParams: Record<string, string> = { colaborador_id: String(c.id) };
    if (prov) {
      queryParams['provisionar'] = '1';
    } else if (c.intranet.usuario_id) {
      queryParams['usuario_id'] = String(c.intranet.usuario_id);
    }

    this.router.navigate(['/admin/acessos'], { queryParams });
  }

  private normCampo(val: string | null | undefined): string {
    return (val ?? '').trim();
  }

  labelPendencia(campo: PendenciaCampo): string {
    return PENDENCIA_LABELS[campo] ?? campo;
  }

  empresaClasse(empresa: string | null | undefined): string {
    return empresaParaClasse(empresa);
  }

  empresaLabel(empresa: string | null | undefined): string {
    return labelEmpresa(empresa);
  }

  formatAniversario(c: ColaboradorAdmin): string {
    if (!c.nasc_dia || !c.nasc_mes) return '—';
    const dia = String(c.nasc_dia).padStart(2, '0');
    const mes = String(c.nasc_mes).padStart(2, '0');
    if (c.nasc_ano) return `${dia}/${mes}/${c.nasc_ano}`;
    return `${dia}/${mes}`;
  }

  formatData(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('pt-BR');
    } catch {
      return value;
    }
  }

  iniciais(nome: string): string {
    return nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }
}
