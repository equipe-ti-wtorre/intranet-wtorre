import { Component, OnDestroy, OnInit, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  PesquisasPergunta,
  PesquisasPublicoMeta,
  PesquisasResponderPayload,
  PesquisasTemplateVisual,
} from '../../models/pesquisas.model';
import { PesquisasGuestFormComponent } from './shared/pesquisas-guest-form.component';
import { isChaveHeader, lookupPronto, matchCampos } from './shared/pesquisas-base.util';

@Component({
  selector: 'app-pesquisas-publico',
  standalone: true,
  imports: [FormsModule, PesquisasGuestFormComponent],
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
  readonly meta = signal<PesquisasPublicoMeta | null>(null);
  readonly payload = signal<PesquisasResponderPayload | null>(null);
  readonly respostas = signal<Record<number, string>>({});
  readonly anexos = signal<Record<number, File>>({});
  readonly cpf = signal('');
  readonly email = signal('');
  readonly enviado = signal(false);
  readonly respostasGuest = computed(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.respostas())) out[k] = v;
    return out;
  });
  readonly tpl = computed<PesquisasTemplateVisual>(
    () =>
      this.payload()?.template ||
      this.meta()?.template || {
        codigo: 'wtorre',
        nome: 'WTorre',
        wordmark: 'WTORRE',
        corPrimaria: '#0f1e3d',
        corPrimariaEscura: '#080e1e',
        raioPx: 10,
      }
  );
  private guestToken: string | null = null;
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;
  private lookupSeq = 0;

  readonly visiveis = computed(() => {
    const p = this.payload();
    if (!p) return [];
    const map = new Map(Object.entries(this.respostas()).map(([k, v]) => [Number(k), v]));
    return p.perguntas.filter((q) => this.visivel(q, p.perguntas, map));
  });

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('token') || this.route.snapshot.paramMap.get('slug') || '';
    this.api.publicoMeta(slug).subscribe({
      next: (m) => {
        this.meta.set(m);
        this.loading.set(false);
        if (!this.bloqueado() && !m.exigirIdentidade) {
          this.carregarFormulario();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Formulário não encontrado.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.lookupTimer) clearTimeout(this.lookupTimer);
  }

  formatCpfInput(raw: string): void {
    const d = String(raw || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) this.cpf.set(d);
    else if (d.length <= 6) this.cpf.set(`${d.slice(0, 3)}.${d.slice(3)}`);
    else if (d.length <= 9) this.cpf.set(`${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`);
    else this.cpf.set(`${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`);
  }

  verificar(): void {
    const m = this.meta();
    if (!m) return;
    this.verificando.set(true);
    this.api.publicoVerificar(m.slug, { cpf: this.cpf(), email: this.email() }).subscribe({
      next: (out) => {
        this.guestToken = out.token;
        this.verificando.set(false);
        this.carregarFormulario();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível confirmar a identidade.');
        this.verificando.set(false);
      },
    });
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
    const m = this.meta();
    if (!p || !m) return;
    const itens = this.visiveis()
      .filter((q) => q.id && q.blocoTipo !== 'texto')
      .map((q) => ({
        perguntaId: q.id as number,
        valor: q.blocoTipo === 'anexo' ? '' : this.respostas()[q.id as number] || '',
      }));
    this.enviando.set(true);
    this.api.publicoResponder(m.slug, itens, this.guestToken || undefined, this.anexos()).subscribe({
      next: () => {
        this.enviando.set(false);
        this.enviado.set(true);
        this.alertas.sucesso('Resposta enviada com sucesso.');
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

  private carregarFormulario(): void {
    const m = this.meta();
    if (!m) return;
    this.loading.set(true);
    this.api.publicoFormulario(m.slug, this.guestToken || undefined).subscribe({
      next: (p) => {
        this.payload.set(p);
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
    const m = this.meta();
    if (!p?.temBase || !m) return;
    const q = p.perguntas.find((x) => x.id === id);
    if (!q || !isChaveHeader(q.texto)) return;
    if (this.lookupTimer) clearTimeout(this.lookupTimer);
    this.lookupTimer = setTimeout(() => {
      if (!lookupPronto(valor)) return;
      const seq = ++this.lookupSeq;
      this.api.publicoLookupBase(m.slug, valor, this.guestToken || undefined).subscribe({
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
}
