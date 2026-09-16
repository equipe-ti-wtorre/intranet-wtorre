import { Component, OnDestroy, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  CapaLayout,
  PesquisasPergunta,
  PesquisasPortal,
  PesquisasPortalItem,
  PesquisasEventoDestaque,
  PesquisasPublicoMeta,
  PesquisasResponderPayload,
  PesquisasTemplateVisual,
} from '../../models/pesquisas.model';
import { PesquisasGuestFormComponent } from './shared/pesquisas-guest-form.component';
import { PesquisasMarcaLogosComponent } from './shared/pesquisas-marca-logos.component';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { isChaveHeader, lookupPronto, matchCampos } from './shared/pesquisas-base.util';
import { formatDocumento } from './shared/pesquisas-documento.util';
import { PESQUISAS_TPL_WTORRE } from './shared/pesquisas-marca.util';

type PassoPublico = 'gate' | 'portal' | 'form';

const GUEST_TOKEN_KEY = 'pesquisas.guestToken';

@Component({
  selector: 'app-pesquisas-publico',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, PesquisasGuestFormComponent, PesquisasMarcaLogosComponent, PesqIconComponent],
  templateUrl: './pesquisas-publico.component.html',
  encapsulation: ViewEncapsulation.None,
})
export class PesquisasPublicoComponent implements OnInit, OnDestroy {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly enviando = signal(false);
  readonly verificando = signal(false);
  readonly passo = signal<PassoPublico>('gate');
  readonly meta = signal<PesquisasPublicoMeta | null>(null);
  readonly portal = signal<PesquisasPortal | null>(null);
  readonly payload = signal<PesquisasResponderPayload | null>(null);
  readonly respostas = signal<Record<number, string>>({});
  readonly anexos = signal<Record<number, File>>({});
  readonly identificador = signal('');
  readonly slides = signal<PesquisasEventoDestaque[]>([]);
  readonly slideAtivo = signal(0);
  readonly temSlides = computed(() => this.slides().length > 0);
  readonly usaCarrossel = computed(() => {
    const m = this.meta();
    if (!this.temSlides() || !m) return false;
    if (!m.exigirIdentidade && this.bloqueado()) return false;
    return true;
  });
  readonly respostasGuest = computed(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.respostas())) out[k] = v;
    return out;
  });
  readonly tpl = computed<PesquisasTemplateVisual>(
    () => this.payload()?.template || this.meta()?.template || PESQUISAS_TPL_WTORRE
  );
  readonly capaUrl = computed(() => {
    const raw = this.payload()?.capaUrl || this.meta()?.capaUrl || '';
    return raw.trim() || null;
  });
  readonly capaLayout = computed<CapaLayout>(
    () => this.payload()?.capaLayout || this.meta()?.capaLayout || 'top'
  );
  readonly capaQuebrouUrl = signal<string | null>(null);
  readonly mostraCapa = computed(() => {
    const url = this.capaUrl();
    return !!url && this.capaQuebrouUrl() !== url;
  });
  private guestToken: string | null = null;
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;
  private lookupSeq = 0;
  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  readonly visiveis = computed(() => {
    const p = this.payload();
    if (!p) return [];
    const map = new Map(Object.entries(this.respostas()).map(([k, v]) => [Number(k), v]));
    return p.perguntas.filter((q) => this.visivel(q, p.perguntas, map));
  });

  onCapaError(): void {
    const url = this.capaUrl();
    if (url) this.capaQuebrouUrl.set(url);
  }

  ngOnInit(): void {
    this.carregarDestaques();
    const slug = this.route.snapshot.paramMap.get('token') || this.route.snapshot.paramMap.get('slug') || '';
    this.api.publicoMeta(slug).subscribe({
      next: (m) => {
        this.meta.set(m);
        if (!m.exigirIdentidade) {
          this.loading.set(false);
          if (!this.bloqueado()) this.carregarFormulario(m.slug);
          return;
        }
        const saved = this.lerToken();
        if (saved) {
          this.guestToken = saved;
          this.carregarPainel();
          return;
        }
        this.passo.set('gate');
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Formulário não encontrado.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.lookupTimer) clearTimeout(this.lookupTimer);
    this.pararCarrossel();
  }

  private carregarDestaques(): void {
    this.api.publicoCarrossel().subscribe({
      next: (out) => {
        const list = (out.slides || []).filter((s) => !!s.imagemUrl);
        this.slides.set(list);
        this.slideAtivo.set(0);
        this.iniciarCarrossel();
      },
      error: () => {
        this.slides.set([]);
        this.pararCarrossel();
      },
    });
  }

  private iniciarCarrossel(): void {
    this.pararCarrossel();
    if (this.slides().length < 2) return;
    this.carouselTimer = setInterval(() => {
      const n = this.slides().length;
      if (n < 2) return;
      this.slideAtivo.update((i) => (i + 1) % n);
    }, 5000);
  }

  private pararCarrossel(): void {
    if (this.carouselTimer) {
      clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
  }

  formatIdentificador(raw: string): void {
    if (raw.includes('@') || /[a-zA-Z]/.test(raw)) {
      this.identificador.set(raw);
      return;
    }
    this.identificador.set(formatDocumento(raw));
  }

  verificar(): void {
    const m = this.meta();
    if (!m) return;
    const valor = this.identificador().trim();
    if (!valor) {
      this.alertas.erro('Informe um CPF, CNPJ ou e-mail cadastrado.');
      return;
    }
    this.verificando.set(true);
    this.api.publicoVerificar(m.slug, { valor }).subscribe({
      next: (out) => {
        this.guestToken = out.token;
        this.gravarToken(out.token);
        this.verificando.set(false);
        this.carregarPainel();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível confirmar a identidade.');
        this.verificando.set(false);
      },
    });
  }

  abrirPendente(item: PesquisasPortalItem): void {
    this.carregarFormulario(item.slug);
  }

  voltarPainel(): void {
    this.payload.set(null);
    this.respostas.set({});
    this.anexos.set({});
    this.passo.set('portal');
  }

  setValor(id: number, valor: string): void {
    this.respostas.update((r) => ({ ...r, [id]: valor }));
  }

  onGuestValor(ev: { key: string; valor: string }): void {
    const id = Number(ev.key);
    if (!Number.isFinite(id)) return;
    this.setValor(id, ev.valor);
    this.agendarLookup(id, ev.valor);
  }

  onGuestArquivo(ev: { key: string; file: File | null }): void {
    const id = Number(ev.key);
    if (!Number.isFinite(id)) return;
    this.anexos.update((map) => {
      const next = { ...map };
      if (ev.file) next[id] = ev.file;
      else delete next[id];
      return next;
    });
    this.setValor(id, ev.file?.name || '');
  }

  enviar(): void {
    const p = this.payload();
    if (!p?.slug) return;
    const itens = this.visiveis()
      .filter((q) => q.id && q.blocoTipo !== 'texto')
      .map((q) => ({
        perguntaId: q.id as number,
        valor: q.blocoTipo === 'anexo' ? '' : this.respostas()[q.id as number] || '',
      }));
    this.enviando.set(true);
    this.api.publicoResponder(p.slug, itens, this.guestToken || undefined, this.anexos()).subscribe({
      next: () => {
        this.enviando.set(false);
        this.alertas.sucesso('Resposta enviada com sucesso.');
        this.payload.set(null);
        this.respostas.set({});
        this.anexos.set({});
        this.passo.set('portal');
        this.carregarPainel();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível enviar a resposta.');
        this.enviando.set(false);
      },
    });
  }

  bloqueado(): string | null {
    const m = this.meta();
    if (!m) return null;
    if (m.status !== 'publicado') return 'Este formulário não está aberto para respostas.';
    if (!m.eventoAtivo) return 'Este evento está desativado.';
    const now = this.agoraBrasilia();
    const ini = this.toSqlDateTime(m.prazoInicio);
    const fim = this.toSqlDateTime(m.prazoFim);
    if (ini && now < ini) return 'Este formulário ainda não está disponível.';
    if (fim && now > fim) return 'O prazo deste formulário já encerrou.';
    return null;
  }

  private carregarPainel(): void {
    const m = this.meta();
    const token = this.guestToken;
    if (!m || !token) {
      this.passo.set('gate');
      this.loading.set(false);
      this.carregarDestaques();
      return;
    }
    this.loading.set(true);
    this.api.publicoMinhas(m.slug, token).subscribe({
      next: (painel) => {
        this.portal.set(painel);
        this.passo.set('portal');
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.limparToken();
        this.guestToken = null;
        this.portal.set(null);
        this.passo.set('gate');
        this.loading.set(false);
        if (err.status !== 401) {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar seus formulários.');
        }
      },
    });
  }

  private carregarFormulario(slug: string): void {
    this.loading.set(true);
    this.api.publicoFormulario(slug, this.guestToken || undefined).subscribe({
      next: (p) => {
        this.payload.set(p);
        this.respostas.set({});
        this.anexos.set({});
        this.passo.set('form');
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível abrir o formulário.');
        this.loading.set(false);
      },
    });
  }

  private agendarLookup(id: number, valor: string): void {
    const p = this.payload();
    const slug = p?.slug;
    if (!p?.temBase || !slug) return;
    const q = p.perguntas.find((x) => x.id === id);
    if (!q || !isChaveHeader(q.texto)) return;
    if (this.lookupTimer) clearTimeout(this.lookupTimer);
    this.lookupTimer = setTimeout(() => {
      if (!lookupPronto(valor)) return;
      const seq = ++this.lookupSeq;
      this.api.publicoLookupBase(slug, valor, this.guestToken || undefined).subscribe({
        next: (out) => {
          if (seq !== this.lookupSeq) return;
          const fill = matchCampos(out.campos || {}, p.perguntas, id);
          if (!Object.keys(fill).length) return;
          this.respostas.update((r) => ({ ...r, ...fill }));
        },
        error: () => undefined,
      });
    }, 400);
  }

  private visivel(
    pergunta: PesquisasPergunta,
    todas: PesquisasPergunta[],
    map: Map<number, string>
  ): boolean {
    if (!pergunta.logica) return true;
    const alvo = todas.find((x) => x.ordem === pergunta.logica?.perguntaOrdem);
    if (!alvo?.id) return true;
    const valor = map.get(alvo.id);
    const c = pergunta.logica.condicao;
    if (c === 'qualquer') return true;
    if (c === 'sim') return valor === 'Sim';
    if (c === 'nao') return valor === 'Não';
    if (c === 'escala_gte_4') return Number(valor) >= 4;
    return true;
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

  private toSqlDateTime(iso?: string | null): string | null {
    if (!iso) return null;
    const m = String(iso)
      .replace(' ', 'T')
      .match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}:00` : null;
  }

  private lerToken(): string | null {
    try {
      return sessionStorage.getItem(GUEST_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private gravarToken(token: string): void {
    try {
      sessionStorage.setItem(GUEST_TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  }

  private limparToken(): void {
    try {
      sessionStorage.removeItem(GUEST_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
}
