import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap, of } from 'rxjs';
import { PesquisasService } from '../../services/pesquisas.service';
import { MenuService } from '../../services/menu.service';
import { AlertasService } from '../../services/alertas.service';
import {
  BlocoTipo,
  CapaLayout,
  EventoTipo,
  LogicaCondicao,
  PerguntaTipo,
  PesquisasConvidado,
  PesquisasDestinatario,
  PesquisasFormulario,
  PesquisasPergunta,
  PesquisasTemplateVisual,
  PublicoAlvo,
  TextoEstilo,
} from '../../models/pesquisas.model';
import { PesquisasDestinatariosModalComponent } from './shared/pesquisas-destinatarios-modal.component';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { pesquisasLinkPublico } from './shared/pesquisas-public-url';
import { PesquisasQrCardComponent } from './shared/pesquisas-qr-card.component';
import { pesquisasQrDataLabel } from './shared/pesquisas-qr-export.util';
import {
  GuestReorderEvent,
  PesquisasGuestFormComponent,
} from './shared/pesquisas-guest-form.component';
import {
  extractGuestsFromRows,
  isChaveHeader,
  isDocHeader,
  isEmailHeader,
  isNomeHeader,
  isRgHeader,
  lookupLocal,
  lookupPronto,
  matchCampos,
} from './shared/pesquisas-base.util';
import {
  digitsDocumento,
  formatDocumento,
  isDocumentoValido,
  isRgValido,
  maskDocumento,
  maskRg,
  normalizeRg,
} from './shared/pesquisas-documento.util';
import {
  PESQUISAS_TPL_WTORRE,
  PesquisasMarcaLogo,
  pesquisasLogoSrc,
  pesquisasMarcasOficiais,
} from './shared/pesquisas-marca.util';

interface QDraft {
  key: number;
  blocoTipo: BlocoTipo;
  texto: string;
  tipo: PerguntaTipo;
  obrigatoria: boolean;
  opcoes: string[];
  secaoTitulo: string;
  logicaCondicao: LogicaCondicao;
  ajuda: string;
  novaLinha: boolean;
  textoEstilo: TextoEstilo;
}

interface GuestDraft {
  key: number;
  id?: number;
  nome: string;
  cpf: string;
  cpfMascara: string;
  rg: string;
  rgMascara: string;
  email: string;
}

let qKey = 0;
let gKey = 0;

function chaveConvidado(nome: string, cpf: string, email: string, rg: string): string {
  if (cpf && (cpf.length === 11 || cpf.length === 14)) return `d:${cpf}`;
  if (rg) return `r:${rg}`;
  const mail = email.trim().toLowerCase();
  if (mail) return `e:${mail}`;
  const n = nome.trim().toLowerCase();
  return n ? `n:${n}` : '';
}

function titulosDaPlanilha(XLSX: typeof import('xlsx'), sheet: import('xlsx').WorkSheet): string[] {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  const headerRow = matrix.find(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim())
  );
  if (!Array.isArray(headerRow)) return [];
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const cell of headerRow) {
    const label = String(cell ?? '').trim().slice(0, 200);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    headers.push(label);
    if (headers.length >= 40) break;
  }
  return headers;
}

@Component({
  selector: 'app-pesquisas-builder',
  standalone: true,
  imports: [
    FormsModule,
    PesqIconComponent,
    PesquisasGuestFormComponent,
    PesquisasQrCardComponent,
    PesquisasDestinatariosModalComponent,
  ],
  templateUrl: './pesquisas-builder.component.html',
  host: {
    '[attr.data-marca]': 'templateCodigo()',
  },
})
export class PesquisasBuilderComponent implements OnInit, OnDestroy {
  private readonly api = inject(PesquisasService);
  private readonly menu = inject(MenuService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly salvando = signal(false);
  readonly carregando = signal(true);
  readonly formId = signal<number | null>(null);
  readonly slug = signal<string | null>(null);
  readonly titulo = signal('');
  readonly categoria = signal('');
  readonly descricao = signal('');
  readonly prazoInicioData = signal('');
  readonly prazoInicioHora = signal('');
  readonly prazoFimData = signal('');
  readonly prazoFimHora = signal('');
  readonly publicoAlvo = signal<PublicoAlvo>('todos');
  readonly publicoDepartamento = signal('');
  readonly destinatarios = signal<PesquisasDestinatario[]>([]);
  readonly destinatariosModalAberto = signal(false);
  private publicoAntesPersonalizado: PublicoAlvo = 'todos';
  readonly secoes = signal(false);
  readonly logica = signal(false);
  readonly anonimo = signal(false);
  readonly perguntas = signal<QDraft[]>([]);
  readonly departamentos = signal<string[]>([]);
  readonly eventoTipo = signal<EventoTipo>('show');
  readonly eventoTipoOutro = signal('');
  readonly eventoAtivo = signal(true);
  readonly exigirIdentidade = signal(true);
  readonly convidados = signal<GuestDraft[]>([]);
  readonly temBaseSalva = signal(false);
  readonly guestNome = signal('');
  readonly guestCpf = signal('');
  readonly guestRg = signal('');
  readonly guestEmail = signal('');
  readonly templates = signal<PesquisasTemplateVisual[]>([PESQUISAS_TPL_WTORRE]);
  readonly templateCodigo = signal('wtorre');
  readonly marcasOficiais = signal<PesquisasMarcaLogo[]>(pesquisasMarcasOficiais());
  readonly capaUrl = signal<string | null>(null);
  readonly capaLocalUrl = signal<string | null>(null);
  readonly capaLayout = signal<CapaLayout>('left');
  readonly capaFocoX = signal(50);
  readonly capaFocoY = signal(50);
  readonly passo = signal<'layout' | 'builder'>('layout');
  readonly menuAddOpen = signal(false);
  readonly qrAberto = signal(false);
  readonly previewRespostas = signal<Record<string, string>>({});
  private capaPendente: File | null = null;
  private baseLinhas: Record<string, unknown>[] | null = null;
  private previewLookupTimer: ReturnType<typeof setTimeout> | null = null;
  private listDragKey: number | null = null;
  readonly listDrop = signal<{ targetKey: number; insertBefore: boolean } | null>(null);
  readonly layouts: { id: CapaLayout; title: string; sub: string }[] = [
    { id: 'top', title: 'Imagem no topo', sub: 'Faixa superior, com o painel de campos abaixo.' },
    { id: 'bottom', title: 'Imagem embaixo', sub: 'Painel de campos acima, com a faixa da imagem no rodapé.' },
    { id: 'left', title: 'Imagem à esquerda', sub: 'Barra lateral fixa; os campos ficam à direita.' },
    { id: 'right', title: 'Imagem à direita', sub: 'Barra lateral fixa; os campos ficam à esquerda.' },
  ];
  readonly zoneHint = computed(() => {
    const map: Record<CapaLayout, string> = {
      top: 'Vai aparecer no topo do formulário. Na prévia, arraste a imagem para escolher o enquadramento.',
      bottom: 'Vai aparecer no rodapé do formulário. Na prévia, arraste a imagem para escolher o enquadramento.',
      left: 'Vai aparecer na lateral esquerda do formulário.',
      right: 'Vai aparecer na lateral direita do formulário.',
    };
    return map[this.capaLayout()];
  });

  readonly templateAtual = computed(
    () =>
      this.templates().find((t) => t.codigo === this.templateCodigo()) ||
      this.templates()[0] ||
      PESQUISAS_TPL_WTORRE
  );
  readonly capaPreview = computed(() => this.capaLocalUrl() || this.capaUrl());
  readonly qrDataLabel = computed(() => pesquisasQrDataLabel(this.prazoInicioData()));
  readonly previewPerguntas = computed<PesquisasPergunta[]>(() =>
    this.perguntas().map((p, idx) => ({
      id: p.key,
      ordem: idx + 1,
      texto: p.texto,
      tipo: p.tipo,
      obrigatoria: p.obrigatoria,
      opcoes:
        p.blocoTipo === 'texto'
          ? [p.textoEstilo]
          : p.tipo === 'multipla_escolha'
            ? p.opcoes.map((s) => s.trim()).filter(Boolean)
            : [],
      secaoTitulo: p.secaoTitulo || null,
      blocoTipo: p.blocoTipo,
      ajuda: p.ajuda || null,
      novaLinha: p.novaLinha,
      textoEstilo: p.textoEstilo,
    }))
  );
  ngOnInit(): void {
    this.menu.getTopbarPublic().subscribe({
      next: (config) => this.marcasOficiais.set(pesquisasMarcasOficiais(config.logos)),
    });
    this.api.departamentos().subscribe({ next: (d) => this.departamentos.set(d) });
    this.api.listTemplates().subscribe({
      next: (rows) => {
        this.templates.set(rows.length ? rows : [PESQUISAS_TPL_WTORRE]);
      },
      error: () => {
        this.templates.set([PESQUISAS_TPL_WTORRE]);
      },
    });
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const id = params.get('id');
          if (id) {
            this.formId.set(Number(id));
            return this.api.getFormulario(Number(id));
          }
          this.perguntas.set([]);
          this.passo.set('layout');
          this.carregando.set(false);
          return of(null);
        })
      )
      .subscribe({
        next: (form) => {
          if (!form) return;
          this.titulo.set(form.titulo);
          this.categoria.set(form.categoria === 'Sem categoria' ? '' : form.categoria);
          this.descricao.set(form.descricao || '');
          this.aplicarJanela(form);
          this.publicoAlvo.set(form.publicoAlvo);
          this.publicoDepartamento.set(form.publicoDepartamento || '');
          this.destinatarios.set(form.destinatarios || []);
          this.secoes.set(!!form.secoes);
          this.logica.set(!!form.logicaCondicional);
          this.anonimo.set(!!form.anonimo);
          this.slug.set(form.slug || null);
          this.eventoTipo.set(form.eventoTipo || 'show');
          this.eventoTipoOutro.set(form.eventoTipoOutro || '');
          this.eventoAtivo.set(form.eventoAtivo !== false);
          this.exigirIdentidade.set(form.exigirIdentidade !== false);
          this.convidados.set((form.convidados || []).map((g) => this.fromGuestApi(g)));
          this.temBaseSalva.set((form.baseResumo?.total || 0) > 0);
          this.perguntas.set((form.perguntas || []).map((p) => this.fromApi(p)));
          this.templateCodigo.set(form.template?.codigo || form.templateCodigo || 'wtorre');
          this.capaUrl.set(form.capaUrl || null);
          this.capaLayout.set(form.capaLayout || 'top');
          this.capaFocoX.set(form.capaFocoX ?? 50);
          this.capaFocoY.set(form.capaFocoY ?? 50);
          this.passo.set('builder');
          this.carregando.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao carregar o formulário.');
          this.carregando.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    if (this.previewLookupTimer) clearTimeout(this.previewLookupTimer);
    this.revokeCapaLocal();
  }

  escolherTemplate(codigo: string): void {
    this.templateCodigo.set(codigo);
  }

  logoSrc(codigo: string): string | undefined {
    return pesquisasLogoSrc(codigo, this.marcasOficiais());
  }

  onCapa(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      this.alertas.erro('Envie uma imagem JPEG, PNG ou WebP.');
      return;
    }
    this.revokeCapaLocal();
    this.capaPendente = file;
    this.capaLocalUrl.set(URL.createObjectURL(file));
    const id = this.formId();
    if (id) this.enviarCapa(id);
  }

  removerCapaClick(ev: Event): void {
    ev.stopPropagation();
    this.revokeCapaLocal();
    this.capaPendente = null;
    this.capaLocalUrl.set(null);
    const id = this.formId();
    if (id && this.capaUrl()) {
      this.api.removerCapa(id).subscribe({
        next: (form) => this.capaUrl.set(form.capaUrl || null),
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível remover a capa.');
        },
      });
      return;
    }
    this.capaUrl.set(null);
  }

  onPreviewValor(ev: { key: string; valor: string }): void {
    this.previewRespostas.update((r) => ({ ...r, [ev.key]: ev.valor }));
    const q = this.previewPerguntas().find((p) => String(p.id) === ev.key);
    if (
      this.publicoAlvo() !== 'externos' ||
      !q ||
      !isChaveHeader(q.texto) ||
      !this.baseLinhas?.length
    ) {
      return;
    }
    if (this.previewLookupTimer) clearTimeout(this.previewLookupTimer);
    this.previewLookupTimer = setTimeout(() => {
      if (!lookupPronto(ev.valor)) return;
      const campos = lookupLocal(this.baseLinhas || [], ev.valor);
      if (!campos) return;
      const fill = matchCampos(campos, this.previewPerguntas(), q.id);
      if (!Object.keys(fill).length) return;
      this.previewRespostas.update((r) => {
        const next = { ...r };
        for (const [id, val] of Object.entries(fill)) next[id] = val;
        return next;
      });
    }, 400);
  }

  onPreviewEnviar(): void {
    this.alertas.sucesso('Isto é só uma prévia — nada foi enviado.');
  }

  onPreviewArquivo(ev: { key: string; file: File | null }): void {
    this.previewRespostas.update((r) => ({ ...r, [ev.key]: ev.file?.name || '' }));
  }

  onPreviewReorder(ev: GuestReorderEvent): void {
    const byKey = new Map(this.perguntas().map((p) => [p.key, p]));
    const seen = new Set<number>();
    const next: QDraft[] = [];
    for (const key of ev.keys) {
      if (seen.has(key)) continue;
      const card = byKey.get(key);
      if (!card) continue;
      seen.add(key);
      next.push({ ...card, novaLinha: ev.novaLinha[key] !== false });
    }
    for (const p of this.perguntas()) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      next.push(p);
    }
    this.perguntas.set(next);
    this.previewRespostas.set({});
  }

  escolherLayout(layout: CapaLayout): void {
    this.capaLayout.set(layout);
    this.passo.set('builder');
  }

  onCapaFoco(foco: { x: number; y: number }): void {
    this.capaFocoX.set(foco.x);
    this.capaFocoY.set(foco.y);
  }

  abrirGaleria(): void {
    this.passo.set('layout');
  }

  addBloco(tipo: BlocoTipo): void {
    this.menuAddOpen.set(false);
    this.perguntas.update((list) => [...list, this.novoBloco(tipo)]);
  }

  addOpcao(key: number): void {
    this.perguntas.update((list) =>
      list.map((p) => {
        if (p.key !== key) return p;
        const letter = String.fromCharCode(65 + p.opcoes.length);
        return { ...p, opcoes: [...p.opcoes, `Opção ${letter}`] };
      })
    );
  }

  removeOpcao(key: number, idx: number): void {
    const card = this.perguntas().find((p) => p.key === key);
    if (!card || card.opcoes.length <= 2) {
      this.alertas.erro('Precisa de pelo menos 2 opções.');
      return;
    }
    this.perguntas.update((list) =>
      list.map((p) => (p.key === key ? { ...p, opcoes: p.opcoes.filter((_, i) => i !== idx) } : p))
    );
  }

  setOpcao(key: number, idx: number, valor: string): void {
    this.perguntas.update((list) =>
      list.map((p) => {
        if (p.key !== key) return p;
        const opcoes = p.opcoes.slice();
        opcoes[idx] = valor;
        return { ...p, opcoes };
      })
    );
  }

  async onExcel(ev: Event): Promise<void> {
    await this.lerEImportarPlanilha(ev);
  }

  async onExcelConvidados(ev: Event): Promise<void> {
    await this.lerEImportarPlanilha(ev);
  }

  private async lerEImportarPlanilha(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      if (!rows.length) {
        const headers = titulosDaPlanilha(XLSX, sheet);
        if (!headers.length) {
          this.alertas.erro('A planilha está vazia.');
          return;
        }
        const vazio: Record<string, unknown> = {};
        for (const header of headers) vazio[header] = '';
        this.importarPlanilha([vazio], { somenteCabecalho: true });
        return;
      }
      if (rows.length > 5000) {
        this.alertas.erro('A planilha pode ter no máximo 5.000 linhas.');
        return;
      }
      this.importarPlanilha(rows);
    } catch {
      this.alertas.erro('Não consegui ler essa planilha.');
    }
  }

  onListMouseDown(ev: MouseEvent): void {
    const handle = (ev.target as HTMLElement).closest('.block-drag');
    if (!handle) return;
    handle.closest('.block-card')?.setAttribute('draggable', 'true');
  }

  onListDragStart(ev: DragEvent): void {
    const card = (ev.target as HTMLElement).closest('.block-card');
    if (!card) return;
    card.classList.add('dragging');
    this.listDragKey = Number(card.getAttribute('data-key'));
    this.listDrop.set(null);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      try {
        ev.dataTransfer.setData('text/plain', '');
      } catch {
        /* ignore */
      }
    }
  }

  onListDragOver(ev: DragEvent): void {
    ev.preventDefault();
    const wrap = ev.currentTarget as HTMLElement;
    const cards = Array.from(wrap.querySelectorAll('.block-card:not(.dragging)'));
    let after: Element | null = null;
    let closest = -Infinity;
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      const offset = ev.clientY - box.top - box.height / 2;
      if (offset < 0 && offset > closest) {
        closest = offset;
        after = card;
      }
    }
    const target = (after || cards[cards.length - 1]) as HTMLElement | undefined;
    if (!target) return;
    this.listDrop.set({
      targetKey: Number(target.getAttribute('data-key')),
      insertBefore: !!after,
    });
  }

  onListDragLeave(ev: DragEvent): void {
    const wrap = ev.currentTarget as HTMLElement;
    const next = ev.relatedTarget as Node | null;
    if (next && wrap.contains(next)) return;
    this.listDrop.set(null);
  }

  onListDragEnd(ev: DragEvent): void {
    const card = (ev.target as HTMLElement).closest('.block-card');
    card?.classList.remove('dragging');
    card?.setAttribute('draggable', 'false');
    const dragKey = this.listDragKey ?? Number(card?.getAttribute('data-key'));
    this.listDragKey = null;
    const drop = this.listDrop();
    this.listDrop.set(null);
    if (!Number.isFinite(dragKey) || !dragKey) return;
    const seen = new Set<number>();
    const keys = this.perguntas()
      .map((p) => p.key)
      .filter((k) => {
        if (seen.has(k) || k === dragKey) return false;
        seen.add(k);
        return true;
      });
    if (drop && keys.includes(drop.targetKey)) {
      const idx = keys.indexOf(drop.targetKey);
      keys.splice(drop.insertBefore ? idx : idx + 1, 0, dragKey);
    } else {
      keys.push(dragKey);
    }
    const byKey = new Map(this.perguntas().map((p) => [p.key, p]));
    const next: QDraft[] = [];
    const used = new Set<number>();
    for (const k of keys) {
      const item = byKey.get(k);
      if (!item || used.has(k)) continue;
      used.add(k);
      next.push(item);
    }
    for (const p of this.perguntas()) {
      if (used.has(p.key)) continue;
      used.add(p.key);
      next.push(p);
    }
    this.perguntas.set(next);
  }

  linkPublico(): string {
    return pesquisasLinkPublico(this.slug());
  }

  addPergunta(): void {
    this.perguntas.update((list) => [...list, this.novaPergunta()]);
  }

  removePergunta(key: number): void {
    this.perguntas.update((list) => list.filter((p) => p.key !== key));
  }

  patch(key: number, patch: Partial<QDraft>): void {
    this.perguntas.update((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  formatCpfInput(raw: string): void {
    this.guestCpf.set(formatDocumento(raw));
  }

  formatRgInput(raw: string): void {
    this.guestRg.set(raw.toUpperCase().replace(/[^0-9X.\-\s/]/g, '').slice(0, 20));
  }

  async exportarModeloConvidados(): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['CPF/CNPJ', 'Nome', 'Email', 'RG']]);
    ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 32 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Convidados');
    XLSX.writeFile(wb, 'modelo-convidados.xlsx');
  }

  onPublicoAlvoChange(value: PublicoAlvo): void {
    const anterior = this.publicoAlvo();
    this.publicoAlvo.set(value);
    if (value === 'personalizado') {
      if (anterior !== 'personalizado') this.publicoAntesPersonalizado = anterior;
      this.destinatariosModalAberto.set(true);
    }
    if (value !== 'externos') {
      this.baseLinhas = null;
      this.temBaseSalva.set(false);
    }
  }

  confirmarDestinatarios(lista: PesquisasDestinatario[]): void {
    this.destinatarios.set(lista);
    this.destinatariosModalAberto.set(false);
    this.publicoAlvo.set('personalizado');
  }

  cancelarDestinatarios(): void {
    this.destinatariosModalAberto.set(false);
    if (!this.destinatarios().length) {
      const fallback = this.publicoAntesPersonalizado;
      this.publicoAlvo.set(fallback === 'personalizado' ? 'todos' : fallback);
    }
  }

  abrirDestinatarios(): void {
    this.destinatariosModalAberto.set(true);
  }

  private fromExtractedGuest(g: { nome: string; cpf: string; email: string; rg: string }): GuestDraft {
    gKey += 1;
    return {
      key: gKey,
      nome: g.nome,
      cpf: formatDocumento(g.cpf),
      cpfMascara: maskDocumento(g.cpf),
      rg: g.rg,
      rgMascara: maskRg(g.rg),
      email: g.email,
    };
  }

  private mergeGuestsFromApi(rows: PesquisasConvidado[]): GuestDraft[] {
    const prevByEmail = new Map(
      this.convidados()
        .filter((g) => g.email)
        .map((g) => [g.email.toLowerCase(), g])
    );
    return rows.map((g) => {
      const draft = this.fromGuestApi(g);
      const prev = prevByEmail.get((g.email || '').toLowerCase());
      if (prev?.cpf && isDocumentoValido(digitsDocumento(prev.cpf))) {
        draft.cpf = prev.cpf;
        draft.cpfMascara = prev.cpfMascara || draft.cpfMascara;
      }
      if (prev?.rg && (isRgValido(prev.rg) || digitsDocumento(prev.rg).length === 11)) {
        draft.rg = prev.rg;
        draft.rgMascara = prev.rgMascara || draft.rgMascara;
      }
      return draft;
    });
  }

  addConvidado(): void {
    const nome = this.guestNome().trim();
    const doc = digitsDocumento(this.guestCpf());
    const email = this.guestEmail().trim().toLowerCase();
    const rgNorm = normalizeRg(this.guestRg());
    const rgDigits = this.guestRg().replace(/\D/g, '');
    const rgComoCpf = !rgNorm && rgDigits.length === 11 && !/[A-Z]/.test(this.guestRg());
    const rgOk = !!rgNorm || rgComoCpf;
    const docOk = isDocumentoValido(doc);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (doc && !docOk) {
      this.alertas.erro('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).');
      return;
    }
    if (this.guestRg().trim() && !rgOk) {
      this.alertas.erro('Informe um RG válido (5 a 10 dígitos, verificador opcional).');
      return;
    }
    if (email && !emailOk) {
      this.alertas.erro('Informe um e-mail válido.');
      return;
    }
    if (!nome && !docOk && !emailOk && !rgOk) {
      this.alertas.erro('Informe ao menos o nome, o CPF, o CNPJ, o RG ou o e-mail.');
      return;
    }
    if (docOk && this.convidados().some((g) => digitsDocumento(g.cpf) === doc)) {
      this.alertas.erro('Este CPF ou CNPJ já está na lista.');
      return;
    }
    const rgSalvo = rgNorm || (rgComoCpf ? rgDigits : '');
    if (rgSalvo && this.convidados().some((g) => g.rg === rgSalvo)) {
      this.alertas.erro('Este RG já está na lista.');
      return;
    }
    if (emailOk && this.convidados().some((g) => g.email.trim().toLowerCase() === email)) {
      this.alertas.erro('Este e-mail já está na lista.');
      return;
    }
    if (
      !docOk &&
      !emailOk &&
      !rgOk &&
      this.convidados().some((g) => !digitsDocumento(g.cpf) && !g.rg && !g.email.trim() && g.nome.trim().toLowerCase() === nome.toLowerCase())
    ) {
      this.alertas.erro('Este nome já está na lista.');
      return;
    }
    gKey += 1;
    this.convidados.update((list) => [
      ...list,
      {
        key: gKey,
        nome,
        cpf: formatDocumento(doc),
        cpfMascara: maskDocumento(doc),
        rg: rgSalvo,
        rgMascara: rgNorm ? maskRg(rgNorm) : rgComoCpf ? maskDocumento(rgDigits) : '',
        email,
      },
    ]);
    this.guestNome.set('');
    this.guestCpf.set('');
    this.guestRg.set('');
    this.guestEmail.set('');
  }

  removeConvidado(key: number): void {
    this.convidados.update((list) => list.filter((g) => g.key !== key));
  }

  async copiarLink(): Promise<void> {
    const link = this.linkPublico();
    if (!link) {
      this.alertas.erro('Salve o formulário para gerar o link público.');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      this.alertas.sucesso('Link copiado.');
    } catch {
      this.alertas.erro('Não foi possível copiar o link.');
    }
  }

  voltar(): void {
    if (this.passo() === 'builder' && !this.formId()) {
      this.passo.set('layout');
      return;
    }
    if (this.passo() === 'layout' && this.formId()) {
      this.passo.set('builder');
      return;
    }
    void this.router.navigate(['/pesquisas']);
  }

  salvar(publicar: boolean): void {
    if (publicar && !this.titulo().trim()) {
      this.alertas.erro('Dê um título ao formulário antes de publicar.');
      return;
    }
    if (publicar && !this.perguntas().some((p) => p.blocoTipo === 'pergunta')) {
      this.alertas.erro('Inclua ao menos uma pergunta antes de publicar.');
      return;
    }
    if (publicar && this.publicoAlvo() === 'personalizado') {
      if (!this.destinatarios().length) {
        this.alertas.erro('Inclua ao menos um colaborador para publicar o formulário personalizado.');
        return;
      }
    }
    const body = this.toBody();
    this.salvando.set(true);
    const id = this.formId();
    const req$ = publicar
      ? id
        ? this.api.publicar(body, id)
        : this.api.salvarRascunho(body).pipe(switchMap((f) => this.api.publicar(body, f.id)))
      : this.api.salvarRascunho(body, id ?? undefined);

    req$
      .pipe(
        switchMap((form) => {
          this.formId.set(form.id);
          this.slug.set(form.slug || null);
          if (form.convidados) {
            this.convidados.set(this.mergeGuestsFromApi(form.convidados));
          }
          if (form.destinatarios) {
            this.destinatarios.set(form.destinatarios);
          }
          if (form.baseResumo) this.temBaseSalva.set((form.baseResumo.total || 0) > 0);
          const file = this.capaPendente;
          if (!file) return of(form);
          return this.api.uploadCapa(form.id, file);
        })
      )
      .subscribe({
      next: (form) => {
        this.formId.set(form.id);
        this.slug.set(form.slug || null);
        this.aplicarJanela(form);
        if (form.convidados) {
          this.convidados.set(this.mergeGuestsFromApi(form.convidados));
        }
        if (form.destinatarios) {
          this.destinatarios.set(form.destinatarios);
        }
        if (form.baseResumo) this.temBaseSalva.set((form.baseResumo.total || 0) > 0);
        if (form.capaUrl) this.capaUrl.set(form.capaUrl);
        if (this.capaPendente) this.clearCapaPendente();
        this.salvando.set(false);
        if (publicar) {
          this.alertas.sucesso(
            form.publicoAlvo === 'externos'
              ? `"${form.titulo}" publicado. O link público não aparece em Comunicados.`
              : this.janelaAindaNaoAbriu(form)
                ? `"${form.titulo}" publicado. Entra no mural quando a janela abrir.`
                : `"${form.titulo}" publicado! Já está em Comunicados na intranet.`
          );
          void this.router.navigate(['/pesquisas']);
          return;
        }
        this.alertas.sucesso('Formulário salvo como rascunho.');
        if (!this.route.snapshot.paramMap.get('id')) {
          void this.router.navigate(['/pesquisas/formulario', form.id, 'editar']);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar o formulário.');
        this.salvando.set(false);
      },
    });
  }

  private novaPergunta(): QDraft {
    return this.novoBloco('pergunta');
  }

  private novoBloco(tipo: BlocoTipo): QDraft {
    qKey += 1;
    if (tipo === 'texto') {
      return {
        key: qKey,
        blocoTipo: 'texto',
        texto: '',
        tipo: 'texto_curto',
        obrigatoria: false,
        opcoes: [],
        secaoTitulo: '',
        logicaCondicao: 'qualquer',
        ajuda: '',
        novaLinha: true,
        textoEstilo: 'paragrafo',
      };
    }
    if (tipo === 'anexo') {
      return {
        key: qKey,
        blocoTipo: 'anexo',
        texto: 'Anexar arquivo',
        tipo: 'texto_curto',
        obrigatoria: true,
        opcoes: [],
        secaoTitulo: '',
        logicaCondicao: 'qualquer',
        ajuda: '',
        novaLinha: true,
        textoEstilo: 'paragrafo',
      };
    }
    return {
      key: qKey,
      blocoTipo: 'pergunta',
      texto: 'Pergunta',
      tipo: 'texto_curto',
      obrigatoria: true,
      opcoes: ['Opção A', 'Opção B'],
      secaoTitulo: '',
      logicaCondicao: 'qualquer',
      ajuda: '',
      novaLinha: true,
      textoEstilo: 'paragrafo',
    };
  }

  private fromApi(p: PesquisasPergunta): QDraft {
    qKey += 1;
    const blocoTipo = p.blocoTipo || 'pergunta';
    const textoEstilo: TextoEstilo =
      p.textoEstilo === 'titulo' || (p.opcoes || [])[0] === 'titulo' ? 'titulo' : 'paragrafo';
    return {
      key: qKey,
      blocoTipo,
      texto: p.texto,
      tipo: p.tipo,
      obrigatoria: p.obrigatoria,
      opcoes:
        blocoTipo === 'pergunta' && p.tipo === 'multipla_escolha'
          ? p.opcoes?.length
            ? [...p.opcoes]
            : ['Opção A', 'Opção B']
          : ['Opção A', 'Opção B'],
      secaoTitulo: p.secaoTitulo || '',
      logicaCondicao: p.logica?.condicao || 'qualquer',
      ajuda: p.ajuda || '',
      novaLinha: p.novaLinha !== false,
      textoEstilo,
    };
  }

  private importarPlanilha(
    rows: Record<string, unknown>[],
    opts?: { somenteCabecalho?: boolean }
  ): void {
    const externo = this.publicoAlvo() === 'externos';
    const created = this.criarCamposDaPlanilha(rows, { pularIdentidade: externo });

    if (opts?.somenteCabecalho) {
      if (!created) {
        this.alertas.erro(
          externo
            ? 'Nenhum campo novo. Colunas de nome, CPF, CNPJ, RG e e-mail não viram pergunta, e títulos que já existem são mantidos.'
            : 'Nenhum campo novo. Esses títulos já estão no formulário.'
        );
        return;
      }
      this.alertas.sucesso(created === 1 ? '1 campo importado.' : `${created} campos importados.`);
      return;
    }

    if (!externo) {
      this.baseLinhas = null;
      this.temBaseSalva.set(false);
      this.alertas.sucesso(created === 1 ? '1 campo importado.' : `${created} campos importados.`);
      return;
    }

    const headers = Object.keys(rows[0] || {}).slice(0, 40);
    this.baseLinhas = rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const h of headers) out[h] = row[h];
      return out;
    });
    this.temBaseSalva.set(true);

    const { guests, ignoradas } = extractGuestsFromRows(rows);
    const existing = new Set(
      this.convidados().map((g) => chaveConvidado(g.nome, digitsDocumento(g.cpf), g.email, g.rg))
    );
    const added = guests
      .filter((g) => {
        const key = chaveConvidado(g.nome, g.cpf, g.email, g.rg);
        return key && !existing.has(key);
      })
      .map((g) => this.fromExtractedGuest(g));
    if (added.length) this.convidados.update((list) => [...list, ...added]);

    if (!created && !added.length) {
      this.alertas.erro(
        guests.length
          ? 'Esses convidados já estão na lista.'
          : 'Nenhuma linha válida. Use colunas de nome, CPF, CNPJ, RG ou e-mail; as demais viram campos.'
      );
      return;
    }

    const extra = ignoradas
      ? ` ${ignoradas} linha(s) sem nome, CPF, CNPJ, RG ou e-mail foram ignoradas.`
      : '';
    const camposTxt = created === 1 ? '1 campo' : `${created} campos`;
    const convTxt = added.length === 1 ? '1 convidado' : `${added.length} convidados`;
    this.alertas.sucesso(`${camposTxt} e ${convTxt} importados.${extra}`);
  }

  private criarCamposDaPlanilha(
    rows: Record<string, unknown>[],
    opts: { pularIdentidade: boolean }
  ): number {
    const first = rows[0];
    if (!first) return 0;
    const titleHints = new Set(['titulo', 'título', 'nome do evento', 'evento']);
    let created = 0;
    const headers = Object.keys(first).slice(0, 40);
    for (const header of headers) {
      const label = header.trim();
      if (!label) continue;
      const norm = label.toLowerCase();
      if (titleHints.has(norm)) {
        if (!this.titulo().trim()) {
          this.titulo.set(String(first[header] ?? '').trim());
        }
        continue;
      }
      if (opts.pularIdentidade && (isDocHeader(label) || isEmailHeader(label) || isNomeHeader(label) || isRgHeader(label))) {
        continue;
      }
      const exists = this.perguntas().some(
        (p) => p.blocoTipo === 'pergunta' && p.texto.trim().toLowerCase() === norm
      );
      if (exists) continue;
      const card = this.novoBloco('pergunta');
      card.texto = label;
      this.perguntas.update((list) => [...list, card]);
      created += 1;
    }
    return created;
  }

  private fromGuestApi(g: PesquisasConvidado): GuestDraft {
    gKey += 1;
    return {
      key: gKey,
      id: g.id,
      nome: g.nome || '',
      cpf: '',
      cpfMascara: g.cpfMascara || '',
      rg: '',
      rgMascara: g.rgMascara || '',
      email: g.email || '',
    };
  }

  private aplicarJanela(form: Pick<PesquisasFormulario, 'prazoInicio' | 'prazoFim' | 'prazo'>): void {
    const ini = this.splitDateTime(form.prazoInicio);
    const fim = this.splitDateTime(form.prazoFim);
    this.prazoInicioData.set(ini.date);
    this.prazoInicioHora.set(ini.time);
    this.prazoFimData.set(fim.date || form.prazo || '');
    this.prazoFimHora.set(fim.time || (form.prazo && !form.prazoFim ? '23:59' : ''));
  }

  private janelaAindaNaoAbriu(form: Pick<PesquisasFormulario, 'prazoInicio'>): boolean {
    const ini = this.splitDateTime(form.prazoInicio);
    if (!ini.date) return false;
    const hora = ini.time || '00:00';
    return this.agoraBrasilia() < `${ini.date} ${hora}:00`;
  }

  private splitDateTime(iso: string | null | undefined): { date: string; time: string } {
    if (!iso) return { date: '', time: '' };
    const s = String(iso).replace(' ', 'T');
    const [date, time] = s.split('T');
    return { date: date || '', time: this.normalizeHora(time || '') };
  }

  private normalizeHora(raw: string): string {
    const m = String(raw || '')
      .trim()
      .match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!m) return '';
    const hh = String(Number(m[1])).padStart(2, '0');
    const mm = String(m[2] != null ? Number(m[2]) : 0).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private agoraBrasilia(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
  }

  private combineDateTime(date: string, time: string): string | null {
    const d = (date || '').trim();
    const t = this.normalizeHora(time);
    if (!d) return null;
    return t ? `${d}T${t}` : d;
  }

  private toBody(): Record<string, unknown> {
    return {
      titulo: this.titulo().trim(),
      descricao: this.descricao().trim(),
      categoria: this.categoria().trim(),
      prazoInicio: this.combineDateTime(this.prazoInicioData(), this.prazoInicioHora()),
      prazoFim: this.combineDateTime(this.prazoFimData(), this.prazoFimHora()),
      prazoInicioData: this.prazoInicioData() || null,
      prazoInicioHora: this.prazoInicioHora() || null,
      prazoFimData: this.prazoFimData() || null,
      prazoFimHora: this.prazoFimHora() || null,
      publicoAlvo: this.publicoAlvo(),
      publicoDepartamento: this.publicoDepartamento(),
      usuarioIds: this.destinatarios().map((p) => p.usuarioId),
      tipo: 'avancado',
      secoes: this.secoes(),
      logicaCondicional: this.logica(),
      anonimo: this.anonimo(),
      eventoTipo: this.eventoTipo(),
      eventoTipoOutro: this.eventoTipoOutro().trim(),
      eventoAtivo: this.eventoAtivo(),
      exigirIdentidade: this.exigirIdentidade(),
      templateCodigo: this.templateCodigo(),
      capaLayout: this.capaLayout(),
      capaFocoX: this.capaFocoX(),
      capaFocoY: this.capaFocoY(),
      convidadosFonte: 'manual',
      base: this.publicoAlvo() === 'externos' ? this.baseLinhas || undefined : [],
      convidados: this.convidados().map((g) => ({
        id: g.id,
        nome: g.nome,
        email: g.email,
        cpf: digitsDocumento(g.cpf) || undefined,
        rg: g.rg || undefined,
      })),
      perguntas: this.perguntas().map((p, idx) => ({
        blocoTipo: p.blocoTipo,
        texto: p.texto,
        tipo: p.tipo,
        obrigatoria: p.obrigatoria,
        opcoes:
          p.blocoTipo === 'texto'
            ? [p.textoEstilo]
            : p.tipo === 'multipla_escolha'
              ? p.opcoes.map((s) => s.trim()).filter(Boolean)
              : [],
        textoEstilo: p.textoEstilo,
        ajuda: p.ajuda,
        novaLinha: p.novaLinha,
        secaoTitulo: p.secaoTitulo,
        logica:
          this.logica() && idx > 0
            ? { perguntaOrdem: idx, condicao: p.logicaCondicao }
            : null,
      })),
    };
  }

  private enviarCapa(id: number): void {
    const file = this.capaPendente;
    if (!file) return;
    this.api.uploadCapa(id, file).subscribe({
      next: (form) => {
        this.capaUrl.set(form.capaUrl || null);
        this.clearCapaPendente();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível enviar a capa.');
      },
    });
  }

  private clearCapaPendente(): void {
    this.capaPendente = null;
    this.revokeCapaLocal();
  }

  private revokeCapaLocal(): void {
    const url = this.capaLocalUrl();
    if (url) URL.revokeObjectURL(url);
    this.capaLocalUrl.set(null);
  }
}
