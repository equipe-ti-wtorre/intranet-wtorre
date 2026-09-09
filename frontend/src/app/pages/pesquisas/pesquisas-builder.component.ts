import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap, of } from 'rxjs';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  EventoTipo,
  LogicaCondicao,
  PerguntaTipo,
  PesquisasConvidado,
  PesquisasFormulario,
  PesquisasPergunta,
  PesquisasTemplateVisual,
  PublicoAlvo,
} from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { PesquisasGuestFormComponent } from './shared/pesquisas-guest-form.component';

const TPL_WTORRE: PesquisasTemplateVisual = {
  codigo: 'wtorre',
  nome: 'WTorre',
  wordmark: 'WTORRE',
  corPrimaria: '#0f1e3d',
  corPrimariaEscura: '#080e1e',
  raioPx: 10,
};

interface QDraft {
  key: number;
  texto: string;
  tipo: PerguntaTipo;
  obrigatoria: boolean;
  opcoesTxt: string;
  secaoTitulo: string;
  logicaCondicao: LogicaCondicao;
}

interface GuestDraft {
  key: number;
  id?: number;
  nome: string;
  cpf: string;
  cpfMascara: string;
  email: string;
}

let qKey = 0;
let gKey = 0;

@Component({
  selector: 'app-pesquisas-builder',
  standalone: true,
  imports: [FormsModule, PesqIconComponent, PesquisasGuestFormComponent],
  templateUrl: './pesquisas-builder.component.html',
})
export class PesquisasBuilderComponent implements OnInit, OnDestroy {
  private readonly api = inject(PesquisasService);
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
  readonly guestNome = signal('');
  readonly guestCpf = signal('');
  readonly guestEmail = signal('');
  readonly pasteOpen = signal(false);
  readonly pasteText = signal('');
  readonly templates = signal<PesquisasTemplateVisual[]>([TPL_WTORRE]);
  readonly templateCodigo = signal('wtorre');
  readonly capaUrl = signal<string | null>(null);
  readonly capaLocalUrl = signal<string | null>(null);
  readonly previewRespostas = signal<Record<string, string>>({});
  private capaPendente: File | null = null;

  readonly templateAtual = computed(
    () => this.templates().find((t) => t.codigo === this.templateCodigo()) || this.templates()[0] || TPL_WTORRE
  );
  readonly capaPreview = computed(() => this.capaLocalUrl() || this.capaUrl());
  readonly previewPerguntas = computed<PesquisasPergunta[]>(() =>
    this.perguntas().map((p, idx) => ({
      id: p.key,
      ordem: idx + 1,
      texto: p.texto,
      tipo: p.tipo,
      obrigatoria: p.obrigatoria,
      opcoes:
        p.tipo === 'multipla_escolha'
          ? p.opcoesTxt
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      secaoTitulo: p.secaoTitulo || null,
    }))
  );
  readonly janelaDica = computed(() => {
    const iniData = this.prazoInicioData().trim();
    const fimData = this.prazoFimData().trim();
    const iniHora = this.normalizeHora(this.prazoInicioHora()) || (iniData ? '00:00' : '');
    const fimHora = this.normalizeHora(this.prazoFimHora()) || (fimData ? '23:59' : '');
    if (!iniData && !fimData) {
      return 'Sem janela: fica aberto enquanto estiver publicado e o bloqueio manual estiver ligado.';
    }
    const now = this.agoraBrasilia();
    const ini = iniData ? `${iniData} ${iniHora}:00` : null;
    const fim = fimData ? `${fimData} ${fimHora}:00` : null;
    if (ini && now < ini) return `Abre em ${this.rotuloJanela(iniData, iniHora)}.`;
    if (fim && now > fim) return `Já encerrou em ${this.rotuloJanela(fimData, fimHora)}.`;
    if (ini && fim) return `Aberto agora — até ${this.rotuloJanela(fimData, fimHora)}.`;
    if (fim) return `Aberto agora — até ${this.rotuloJanela(fimData, fimHora)}.`;
    return `Aberto agora — sem data de encerramento.`;
  });

  ngOnInit(): void {
    this.api.departamentos().subscribe({ next: (d) => this.departamentos.set(d) });
    this.api.listTemplates().subscribe({
      next: (rows) => {
        this.templates.set(rows.length ? rows : [TPL_WTORRE]);
      },
      error: () => {
        this.templates.set([TPL_WTORRE]);
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
          this.perguntas.set([this.novaPergunta(), this.novaPergunta()]);
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
          this.secoes.set(!!form.secoes);
          this.logica.set(!!form.logicaCondicional);
          this.anonimo.set(!!form.anonimo);
          this.slug.set(form.slug || null);
          this.eventoTipo.set(form.eventoTipo || 'show');
          this.eventoTipoOutro.set(form.eventoTipoOutro || '');
          this.eventoAtivo.set(form.eventoAtivo !== false);
          this.exigirIdentidade.set(form.exigirIdentidade !== false);
          this.convidados.set((form.convidados || []).map((g) => this.fromGuestApi(g)));
          this.perguntas.set((form.perguntas || []).map((p) => this.fromApi(p)));
          this.templateCodigo.set(form.template?.codigo || form.templateCodigo || 'wtorre');
          this.capaUrl.set(form.capaUrl || null);
          if (!this.perguntas().length) {
            this.perguntas.set([this.novaPergunta(), this.novaPergunta()]);
          }
          this.carregando.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao carregar o formulário.');
          this.carregando.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.revokeCapaLocal();
  }

  escolherTemplate(codigo: string): void {
    this.templateCodigo.set(codigo);
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
  }

  onPreviewEnviar(): void {
    this.alertas.sucesso('Isto é só uma prévia — nada foi enviado.');
  }

  linkPublico(): string {
    const slug = this.slug();
    if (!slug || typeof window === 'undefined') return '';
    return `${window.location.origin}/pesquisas/e/${slug}`;
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
    this.guestCpf.set(this.formatCpf(raw));
  }

  addConvidado(): void {
    const nome = this.guestNome().trim();
    const cpf = this.digits(this.guestCpf());
    const email = this.guestEmail().trim().toLowerCase();
    if (cpf.length !== 11) {
      this.alertas.erro('Informe um CPF com 11 dígitos.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.alertas.erro('Informe um e-mail válido.');
      return;
    }
    if (this.convidados().some((g) => this.digits(g.cpf) === cpf && cpf.length === 11)) {
      this.alertas.erro('Este CPF já está na lista.');
      return;
    }
    gKey += 1;
    this.convidados.update((list) => [
      ...list,
      {
        key: gKey,
        nome,
        cpf: this.formatCpf(cpf),
        cpfMascara: this.maskCpf(cpf),
        email,
      },
    ]);
    this.guestNome.set('');
    this.guestCpf.set('');
    this.guestEmail.set('');
  }

  removeConvidado(key: number): void {
    this.convidados.update((list) => list.filter((g) => g.key !== key));
  }

  aplicarCola(): void {
    const lines = this.pasteText()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const added: GuestDraft[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t;]/).map((p) => p.trim());
      if (parts.length < 2) continue;
      let nome = '';
      let cpfRaw = '';
      let email = '';
      if (parts.length >= 3) {
        nome = parts[0];
        cpfRaw = parts[1];
        email = parts[2].toLowerCase();
      } else {
        cpfRaw = parts[0];
        email = parts[1].toLowerCase();
      }
      const cpf = this.digits(cpfRaw);
      if (cpf.length !== 11 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      if (
        this.convidados().some((g) => this.digits(g.cpf) === cpf) ||
        added.some((g) => this.digits(g.cpf) === cpf)
      ) {
        continue;
      }
      gKey += 1;
      added.push({
        key: gKey,
        nome,
        cpf: this.formatCpf(cpf),
        cpfMascara: this.maskCpf(cpf),
        email,
      });
    }
    if (!added.length) {
      this.alertas.erro('Nenhuma linha válida. Use Nome, CPF, E-mail por linha.');
      return;
    }
    this.convidados.update((list) => [...list, ...added]);
    this.pasteText.set('');
    this.pasteOpen.set(false);
    this.alertas.sucesso(
      added.length === 1 ? '1 convidado adicionado.' : `${added.length} convidados adicionados.`
    );
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
    void this.router.navigate(['/pesquisas']);
  }

  salvar(publicar: boolean): void {
    if (publicar && !this.titulo().trim()) {
      this.alertas.erro('Dê um título ao formulário antes de publicar.');
      return;
    }
    if (publicar && this.publicoAlvo() === 'externos' && !this.convidados().length) {
      this.alertas.erro('Inclua ao menos um convidado para publicar o formulário externo.');
      return;
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
            this.convidados.set(form.convidados.map((g) => this.fromGuestApi(g)));
          }
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
          this.convidados.set(form.convidados.map((g) => this.fromGuestApi(g)));
        }
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
    qKey += 1;
    return {
      key: qKey,
      texto: `Pergunta ${this.perguntas().length + 1}`,
      tipo: 'texto_curto',
      obrigatoria: true,
      opcoesTxt: '',
      secaoTitulo: '',
      logicaCondicao: 'qualquer',
    };
  }

  private fromApi(p: PesquisasPergunta): QDraft {
    qKey += 1;
    return {
      key: qKey,
      texto: p.texto,
      tipo: p.tipo,
      obrigatoria: p.obrigatoria,
      opcoesTxt: (p.opcoes || []).join('\n'),
      secaoTitulo: p.secaoTitulo || '',
      logicaCondicao: p.logica?.condicao || 'qualquer',
    };
  }

  private fromGuestApi(g: PesquisasConvidado): GuestDraft {
    gKey += 1;
    return {
      key: gKey,
      id: g.id,
      nome: g.nome || '',
      cpf: '',
      cpfMascara: g.cpfMascara || '',
      email: g.email,
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

  private rotuloJanela(date: string, time: string): string {
    const [y, m, d] = date.split('-');
    if (!y || !m || !d) return `${date} ${time}`.trim();
    return `${d}/${m} ${time}`;
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
      tipo: 'avancado',
      secoes: this.secoes(),
      logicaCondicional: this.logica(),
      anonimo: this.anonimo(),
      eventoTipo: this.eventoTipo(),
      eventoTipoOutro: this.eventoTipoOutro().trim(),
      eventoAtivo: this.eventoAtivo(),
      exigirIdentidade: this.exigirIdentidade(),
      templateCodigo: this.templateCodigo(),
      convidados: this.convidados().map((g) => ({
        id: g.id,
        nome: g.nome,
        email: g.email,
        cpf: this.digits(g.cpf) || undefined,
      })),
      perguntas: this.perguntas().map((p, idx) => ({
        texto: p.texto,
        tipo: p.tipo,
        obrigatoria: p.obrigatoria,
        opcoes:
          p.tipo === 'multipla_escolha'
            ? p.opcoesTxt
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        secaoTitulo: p.secaoTitulo,
        logica:
          this.logica() && idx > 0
            ? { perguntaOrdem: idx, condicao: p.logicaCondicao }
            : null,
      })),
    };
  }

  private digits(raw: string): string {
    return String(raw || '').replace(/\D/g, '').slice(0, 11);
  }

  private formatCpf(raw: string): string {
    const d = this.digits(raw);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  private maskCpf(digits: string): string {
    if (digits.length !== 11) return '';
    return `***.${digits.slice(3, 6)}.**${digits[8]}-${digits.slice(9)}`;
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
