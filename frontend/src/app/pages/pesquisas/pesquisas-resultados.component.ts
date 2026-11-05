import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  PesquisasAcesso,
  PesquisasHistoricoItem,
  PesquisasMeuPapel,
  PesquisasResultadoPergunta,
  PesquisasResultados,
  PesquisasSerieDia,
} from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { pesquisasLinkInterno, pesquisasLinkPublico } from './shared/pesquisas-public-url';
import { PesquisasQrCardComponent } from './shared/pesquisas-qr-card.component';
import { pesquisasQrDataLabel } from './shared/pesquisas-qr-export.util';
import {
  ConvidadoListaEdicao,
  ConvidadoListaItem,
  PesquisasConvidadosListaModalComponent,
} from './shared/pesquisas-convidados-lista-modal.component';
import { PesquisasCompartilharModalComponent } from './shared/pesquisas-compartilhar-modal.component';
import { PesquisasHistoricoModalComponent } from './shared/pesquisas-historico-modal.component';
import { extractGuestsFromRows } from './shared/pesquisas-base.util';
import { digitsDocumento } from './shared/pesquisas-documento.util';

type DestaqueTone = 'avg' | 'ok' | 'warn' | 'pick' | 'notes';
type DestaqueCard = { k: string; v: string; s: string; icon: string; tone: DestaqueTone };

function nomeArquivoContentDisposition(header: string | null): string {
  if (!header) return '';
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] || '';
}

async function mensagemErroBlob(
  err: HttpErrorResponse,
  fallback = 'Não foi possível baixar os anexos.'
): Promise<string> {
  if (!(err.error instanceof Blob)) return err.error?.mensagem || fallback;
  try {
    const json = JSON.parse(await err.error.text()) as { mensagem?: string };
    return json.mensagem || fallback;
  } catch {
    return fallback;
  }
}

@Component({
  selector: 'app-pesquisas-resultados',
  standalone: true,
  imports: [PesqIconComponent, PesquisasQrCardComponent, PesquisasConvidadosListaModalComponent, PesquisasCompartilharModalComponent, PesquisasHistoricoModalComponent],
  templateUrl: './pesquisas-resultados.component.html',
})
export class PesquisasResultadosComponent implements OnInit {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly qrAberto = signal(false);
  readonly listaConvidadosAberta = signal(false);
  readonly importandoConvidados = signal(false);
  readonly loading = signal(true);
  readonly agindo = signal(false);
  readonly baixandoAnexos = signal(false);
  readonly exportando = signal(false);
  readonly anexosSelecionados = signal<Set<string>>(new Set());
  readonly data = signal<PesquisasResultados | null>(null);
  readonly compartilharAberto = signal(false);
  readonly historicoAberto = signal(false);
  readonly acessos = signal<PesquisasAcesso[]>([]);
  readonly historico = signal<PesquisasHistoricoItem[]>([]);
  readonly historicoLoading = signal(false);
  readonly compartilhando = signal(false);
  readonly listaConvidados = computed<ConvidadoListaItem[]>(() =>
    (this.data()?.formulario.convidados || []).map((g) => ({
      key: g.id || 0,
      nome: g.nome || '',
      cpf: '',
      cpfMascara: g.cpfMascara || '',
      rg: '',
      rgMascara: g.rgMascara || '',
      email: g.email || '',
    }))
  );
  readonly answerModal = signal<{
    title: string;
    sub: string;
    answers: { q: string; a: string; anexoUrl?: string | null }[];
  } | null>(null);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    const ref =
      this.route.snapshot.paramMap.get('slug') || this.route.snapshot.paramMap.get('id') || '';
    this.loading.set(true);
    this.api.resultados(ref).subscribe({
      next: (d) => {
        this.data.set(d);
        this.anexosSelecionados.set(new Set());
        this.loading.set(false);
        const slug = d.formulario.slug;
        if (slug && ref !== slug) {
          void this.router.navigate(['/pesquisas/formulario', slug, 'resultados'], {
            replaceUrl: true,
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar os resultados.');
        this.loading.set(false);
        void this.router.navigate(['/pesquisas']);
      },
    });
  }

  tipoLabel(): string {
    return this.data()?.formulario.tipo === 'avancado' ? 'Formulário avançado' : 'Formulário básico';
  }

  totalConvidados(): number {
    const d = this.data();
    if (!d) return 0;
    const lista = d.formulario.convidados?.length || 0;
    return lista || d.publicoAlvoTotal || 0;
  }

  formatBrDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const raw = iso.slice(0, 10);
    const [y, m, day] = raw.split('-');
    if (y && m && day && y.length === 4) return `${day}/${m}/${y}`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  }

  publicoLabel(): string {
    const form = this.data()?.formulario;
    if (!form) return '—';
    if (form.publicoAlvo === 'todos') return 'Todos os colaboradores';
    if (form.publicoAlvo === 'departamento') return form.publicoDepartamento || 'Departamento específico';
    if (form.publicoAlvo === 'personalizado') return 'Personalizado';
    if (form.publicoAlvo === 'externos') return 'Convidados externos';
    return '—';
  }

  prazoIso(): string | null {
    const form = this.data()?.formulario;
    return form?.prazoFim || form?.prazo || null;
  }

  prazoVencido(): boolean {
    return this.data()?.formulario.janela === 'depois';
  }

  prazoLabel(): string {
    const iso = this.prazoIso();
    if (!iso) return 'Sem prazo';
    return this.formatBrDate(iso);
  }

  deadlineText(): string {
    const form = this.data()?.formulario;
    if (!form) return '—';
    if (form.janela === 'depois') return 'Encerrado';
    const iso = this.prazoIso();
    if (!iso) return '—';
    const d = this.parseDate(iso);
    if (!d) return this.formatBrDate(iso);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const n = Math.round((d.getTime() - t.getTime()) / 86400000);
    if (n < 0) return 'Encerrado';
    if (n === 0) return 'Último dia';
    return `${n} dia${n > 1 ? 's' : ''}`;
  }

  prazoOverdue(): boolean {
    const text = this.deadlineText();
    return text === 'Encerrado';
  }

  audienceSize(): number {
    const d = this.data();
    if (!d) return 0;
    if (d.formulario.publicoAlvo === 'externos') return this.totalConvidados();
    return d.publicoAlvoTotal || 0;
  }

  audienceNoun(): string {
    return this.data()?.formulario.publicoAlvo === 'externos'
      ? 'convidados'
      : 'pessoas no público-alvo';
  }

  metaCells(): { k: string; v: string | number; warn?: boolean }[] {
    const d = this.data();
    if (!d) return [];
    return [
      { k: 'Criado em', v: this.formatBrDate(d.formulario.criadoEm) },
      { k: 'Prazo', v: this.prazoLabel(), warn: this.prazoVencido() },
      { k: 'Público', v: this.publicoLabel() },
      { k: 'Perguntas', v: d.perguntas.length },
    ];
  }

  trendSeries(): PesquisasSerieDia[] {
    return this.data()?.dailySeries || [];
  }

  trendMax(): number {
    return Math.max(0, ...this.trendSeries().map((d) => d.value));
  }

  trendTotal(): number {
    return this.trendSeries().reduce((a, d) => a + d.value, 0);
  }

  trendPeak(): PesquisasSerieDia | null {
    const s = this.trendSeries();
    if (!s.length) return null;
    return s.reduce((a, d) => (d.value > a.value ? d : a), s[0]);
  }

  trendHeight(value: number): number {
    const max = this.trendMax();
    if (!max) return 3;
    return Math.max(Math.round((100 * value) / max), 3);
  }

  isTrendPeak(item: PesquisasSerieDia): boolean {
    const peak = this.trendPeak();
    return !!this.trendTotal() && !!peak && item.value === peak.value;
  }

  destaques(): DestaqueCard[] {
    const d = this.data();
    if (!d?.perguntas.length) return [];
    const cards: DestaqueCard[] = [];
    const scales = d.perguntas.filter((q) => q.tipo === 'escala');
    const hasScaleData = scales.some((q) => (q.agregados.media || 0) > 0 || q.total > 0);
    const mediaNum = scales.length
      ? scales.reduce((a, q) => a + (q.agregados.media || 0), 0) / scales.length
      : 0;
    cards.push({
      k: 'Média geral',
      v: `${mediaNum ? mediaNum.toFixed(1) : '0'} / 5`,
      s: scales.length ? `${scales.length} pergunta(s) de escala` : 'Ainda sem respostas',
      icon: 'bar',
      tone: 'avg',
    });

    const best = scales.length
      ? scales.reduce((a, q) => ((q.agregados.media || 0) > (a.agregados.media || 0) ? q : a))
      : null;
    cards.push({
      k: 'Melhor avaliada',
      v: best && hasScaleData ? `${best.agregados.media ?? 0} / 5` : '—',
      s: best?.texto || 'Ainda sem respostas',
      icon: 'check',
      tone: 'ok',
    });

    const worst =
      scales.length > 1
        ? scales.reduce((a, q) => ((q.agregados.media || 0) < (a.agregados.media || 0) ? q : a))
        : null;
    cards.push({
      k: 'Ponto de atenção',
      v: worst && hasScaleData ? `${worst.agregados.media ?? 0} / 5` : '—',
      s: worst?.texto || 'Ainda sem respostas',
      icon: 'alert',
      tone: 'warn',
    });

    const choices = d.perguntas.filter(
      (q) => q.tipo === 'sim_nao' || q.tipo === 'multipla_escolha'
    );
    let top: { pct: number; label: string; q: string } | null = null;
    for (const q of choices) {
      const ops = q.agregados.opcoes || [];
      const total = ops.reduce((a, o) => a + o.count, 0);
      if (!total) continue;
      for (const o of ops) {
        const pct = Math.round((100 * o.count) / total);
        if (!top || pct > top.pct) top = { pct, label: o.valor, q: q.texto };
      }
    }
    cards.push({
      k: 'Resposta mais escolhida',
      v: top ? `${top.label} · ${top.pct}%` : '—',
      s: top?.q || choices[0]?.texto || 'Ainda sem respostas',
      icon: 'list-checks',
      tone: 'pick',
    });

    const textos = d.perguntas
      .filter((q) => q.tipo === 'texto_curto' || q.tipo === 'texto_longo')
      .reduce((a, q) => a + q.respostas.length, 0);
    cards.push({
      k: 'Comentários',
      v: String(textos),
      s: 'Respostas de texto livre para ler',
      icon: 'file-text',
      tone: 'notes',
    });
    return cards;
  }

  abrirListaConvidados(): void {
    this.listaConvidadosAberta.set(true);
  }

  fecharListaConvidados(): void {
    this.listaConvidadosAberta.set(false);
  }

  criarConvidadoLista(item: ConvidadoListaEdicao): void {
    const id = this.data()?.formulario?.id;
    if (!id) return;
    this.api
      .adicionarConvidado(id, {
        nome: item.nome || undefined,
        cpf: digitsDocumento(item.cpf),
        rg: item.rg,
        email: item.email,
      })
      .subscribe({
        next: () => {
          this.alertas.sucesso('Convidado adicionado à lista.');
          this.carregar();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar o convidado.');
        },
      });
  }

  atualizarConvidadoLista(item: ConvidadoListaEdicao): void {
    const id = this.data()?.formulario?.id;
    if (!id || !item.key) return;
    this.api
      .atualizarConvidado(id, item.key, {
        nome: item.nome || undefined,
        cpf: digitsDocumento(item.cpf),
        rg: item.rg,
        email: item.email,
      })
      .subscribe({
        next: () => {
          this.alertas.sucesso('Convidado atualizado.');
          this.carregar();
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar o convidado.');
        },
      });
  }

  removerConvidadoLista(convidadoId: number): void {
    const id = this.data()?.formulario?.id;
    if (!id || !convidadoId) return;
    this.api.removerConvidado(id, convidadoId).subscribe({
      next: () => {
        this.alertas.sucesso('Convidado removido.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível remover o convidado.');
      },
    });
  }

  async onExcelConvidados(file: File): Promise<void> {
    if (!file || this.importandoConvidados()) return;
    const id = this.data()?.formulario?.id;
    if (!id) {
      this.alertas.erro('Não foi possível identificar o formulário.');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      if (!rows.length) {
        this.alertas.erro('A planilha está vazia.');
        return;
      }
      if (rows.length > 5000) {
        this.alertas.erro('A planilha pode ter no máximo 5.000 linhas.');
        return;
      }
      const { guests, ignoradas } = extractGuestsFromRows(rows);
      if (!guests.length) {
        this.alertas.erro(
          'Nenhuma linha válida. Use colunas de nome, CPF, CNPJ, RG ou e-mail.'
        );
        return;
      }
      this.importandoConvidados.set(true);
      this.api
        .adicionarConvidadosLote(
          id,
          guests.map((g) => ({
            nome: g.nome || undefined,
            cpf: g.cpf,
            rg: g.rg,
            email: g.email,
          }))
        )
        .subscribe({
          next: (res) => {
            this.importandoConvidados.set(false);
            if (!res.inseridos) {
              this.alertas.erro(
                res.duplicados
                  ? 'Esses convidados já estão na lista.'
                  : 'Nenhuma linha válida. Use colunas de nome, CPF, CNPJ, RG ou e-mail.'
              );
              return;
            }
            const extras: string[] = [];
            if (res.duplicados) extras.push(`${res.duplicados} já estavam na lista`);
            if (ignoradas) {
              extras.push(`${ignoradas} linha(s) sem nome, CPF, CNPJ, RG ou e-mail foram ignoradas`);
            }
            const extra = extras.length ? ` ${extras.join('. ')}.` : '';
            const msg =
              res.inseridos === 1
                ? `1 convidado importado.${extra}`
                : `${res.inseridos} convidados importados.${extra}`;
            this.alertas.sucesso(msg);
            this.carregar();
          },
          error: (err: HttpErrorResponse) => {
            this.importandoConvidados.set(false);
            this.alertas.erro(err.error?.mensagem || 'Não foi possível importar os convidados.');
          },
        });
    } catch {
      this.alertas.erro('Não consegui ler essa planilha.');
    }
  }

  deptBreakdown(): { label: string; value: number; pct: number }[] {
    const d = this.data();
    if (!d || d.formulario.anonimo) return [];
    const counts = new Map<string, number>();
    for (const r of d.respondentes) {
      const label = (r.dept || '').trim() || 'Outros';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const entries = [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    const total = entries.reduce((a, e) => a + e.value, 0) || 1;
    return entries.map((e) => ({ ...e, pct: Math.round((100 * e.value) / total) }));
  }

  private parseDate(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  statusClass(): string {
    const form = this.data()?.formulario;
    if (form?.status === 'publicado' && form.janela === 'depois') return 'closed';
    if (form?.status === 'publicado' && form.janela === 'antes') return 'review';
    if (form?.status === 'publicado') return 'done';
    if (form?.status === 'rascunho') return 'draft';
    return 'closed';
  }

  statusText(): string {
    const form = this.data()?.formulario;
    if (form?.status === 'publicado' && form.janela === 'depois') return 'Encerrado';
    if (form?.status === 'publicado' && form.janela === 'antes') return 'Aguardando';
    if (form?.status === 'publicado') return 'Publicado';
    if (form?.status === 'rascunho') return 'Rascunho';
    return 'Encerrado';
  }

  pct(count: number, total: number): number {
    if (!total) return 0;
    return Math.round((count / total) * 100);
  }

  escalaBars(q: PesquisasResultadoPergunta): { label: string; pct: number; count: number }[] {
    const dist = q.agregados.dist || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
      const found = q.agregados.opcoes?.find((o) => o.valor === String(n));
      return found?.count || 0;
    });
    const total = dist.reduce((a, b) => a + b, 0) || 1;
    return dist.map((c, i) => ({
      label: `Nota ${i + 1}`,
      pct: Math.round((100 * c) / total),
      count: c,
    }));
  }

  choiceBars(q: PesquisasResultadoPergunta): { label: string; pct: number; count: number }[] {
    const ops = q.agregados.opcoes || [];
    const total = ops.reduce((a, o) => a + o.count, 0) || 1;
    return ops.map((o) => ({
      label: o.valor,
      pct: Math.round((100 * o.count) / total),
      count: o.count,
    }));
  }

  samples(q: PesquisasResultadoPergunta): string[] {
    return q.respostas.map((r) => r.valor).filter(Boolean).slice(0, 8);
  }

  meuPapel(): PesquisasMeuPapel {
    const papel = this.data()?.formulario.meuPapel;
    return papel === 'dono' || papel === 'editar' || papel === 'ver' ? papel : 'ver';
  }

  podeEditar(): boolean {
    const papel = this.meuPapel();
    return papel === 'dono' || papel === 'editar';
  }

  podeExcluir(): boolean {
    return this.meuPapel() === 'dono';
  }

  podeCompartilhar(): boolean {
    return this.meuPapel() === 'dono';
  }

  abrirCompartilhar(): void {
    const id = this.data()?.formulario.id;
    if (!id || this.compartilhando()) return;
    this.compartilhando.set(true);
    this.api.listAcessos(id).subscribe({
      next: (rows) => {
        this.acessos.set(rows || []);
        this.compartilharAberto.set(true);
        this.compartilhando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.compartilhando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar os acessos.');
      },
    });
  }

  fecharCompartilhar(): void {
    this.compartilharAberto.set(false);
  }

  salvarAcessos(rows: PesquisasAcesso[]): void {
    const id = this.data()?.formulario.id;
    if (!id) return;
    this.compartilhando.set(true);
    this.api.salvarAcessos(id, rows).subscribe({
      next: (saved) => {
        this.acessos.set(saved || []);
        this.compartilharAberto.set(false);
        this.compartilhando.set(false);
        this.alertas.sucesso('Compartilhamento atualizado.');
      },
      error: (err: HttpErrorResponse) => {
        this.compartilhando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar os acessos.');
      },
    });
  }

  abrirHistorico(): void {
    const id = this.data()?.formulario.id;
    if (!id) return;
    this.historicoAberto.set(true);
    this.historicoLoading.set(true);
    this.api.listHistorico(id).subscribe({
      next: (rows) => {
        this.historico.set(rows || []);
        this.historicoLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.historicoLoading.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar o histórico.');
      },
    });
  }

  fecharHistorico(): void {
    this.historicoAberto.set(false);
  }

  editar(): void {
    const id = this.data()?.formulario.id;
    if (id) void this.router.navigate(['/pesquisas/formulario', id, 'editar']);
  }

  exportar(): void {
    const d = this.data();
    if (!d || this.exportando()) return;
    this.exportando.set(true);
    this.api.exportarResultados(d.formulario.id).subscribe({
      next: (res) => {
        const blob = res.body;
        if (!blob) {
          this.exportando.set(false);
          this.alertas.erro('Não foi possível exportar as respostas.');
          return;
        }
        const nome =
          nomeArquivoContentDisposition(res.headers.get('Content-Disposition')) ||
          'respostas.xlsx';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        a.click();
        URL.revokeObjectURL(url);
        this.exportando.set(false);
        this.alertas.sucesso('Exportação iniciada.');
      },
      error: (err: HttpErrorResponse) => {
        this.exportando.set(false);
        void mensagemErroBlob(err, 'Não foi possível exportar as respostas.').then((mensagem) =>
          this.alertas.erro(mensagem)
        );
      },
    });
  }

  async excluir(): Promise<void> {
    const d = this.data();
    if (!d || this.agindo()) return;
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${d.formulario.titulo}”?`,
      texto: 'Esta ação não pode ser desfeita. Respostas e o comunicado serão removidos.',
    });
    if (!ok) return;
    this.agindo.set(true);
    this.api.excluirFormulario(d.formulario.id).subscribe({
      next: () => {
        this.agindo.set(false);
        this.alertas.sucesso('Excluído.');
        void this.router.navigate(['/pesquisas']);
      },
      error: (err: HttpErrorResponse) => {
        this.agindo.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir.');
      },
    });
  }

  toggleAtivo(): void {
    const d = this.data();
    if (!d) return;
    this.toggleEvento(d.formulario.eventoAtivo === false);
  }

  formatAnexoData(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
  }

  anexoAutor(r: { respondente?: { nome: string } | null }): string {
    return this.data()?.formulario.anonimo ? 'Anônimo' : r.respondente?.nome || 'Anônimo';
  }

  anexosBaixaveis(): { perguntaId: number; respostaId: number; indice: number }[] {
    const d = this.data();
    if (!d) return [];
    const itens: { perguntaId: number; respostaId: number; indice: number }[] = [];
    for (const q of d.perguntas) {
      if (q.blocoTipo !== 'anexo' || !q.id) continue;
      for (const r of q.respostas) {
        if (!r.anexoUrl) continue;
        itens.push({ perguntaId: q.id, respostaId: r.respostaId, indice: r.indice ?? 0 });
      }
    }
    return itens;
  }

  anexoChave(perguntaId: number, respostaId: number, indice = 0): string {
    return `${perguntaId}:${respostaId}:${indice}`;
  }

  anexoMarcado(perguntaId: number | undefined, respostaId: number, indice = 0): boolean {
    if (!perguntaId) return false;
    return this.anexosSelecionados().has(this.anexoChave(perguntaId, respostaId, indice));
  }

  alternarAnexo(perguntaId: number | undefined, respostaId: number, indice: number, ev: Event): void {
    if (!perguntaId) return;
    const on = (ev.target as HTMLInputElement).checked;
    const key = this.anexoChave(perguntaId, respostaId, indice);
    this.anexosSelecionados.update((set) => {
      const next = new Set(set);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  todosAnexosMarcados(): boolean {
    const all = this.anexosBaixaveis();
    if (!all.length) return false;
    const sel = this.anexosSelecionados();
    return all.every((item) =>
      sel.has(this.anexoChave(item.perguntaId, item.respostaId, item.indice))
    );
  }

  alternarTodosAnexos(ev: Event): void {
    const on = (ev.target as HTMLInputElement).checked;
    if (!on) {
      this.anexosSelecionados.set(new Set());
      return;
    }
    this.anexosSelecionados.set(
      new Set(
        this.anexosBaixaveis().map((item) =>
          this.anexoChave(item.perguntaId, item.respostaId, item.indice)
        )
      )
    );
  }

  baixarAnexos(todos: boolean): void {
    const d = this.data();
    if (!d || this.baixandoAnexos()) return;
    const disponiveis = this.anexosBaixaveis();
    const itens = todos
      ? disponiveis
      : disponiveis.filter((item) =>
          this.anexosSelecionados().has(
            this.anexoChave(item.perguntaId, item.respostaId, item.indice)
          )
        );
    if (!itens.length) {
      this.alertas.erro('Selecione ao menos um anexo.');
      return;
    }
    this.baixandoAnexos.set(true);
    this.api.baixarAnexosZip(d.formulario.id, itens).subscribe({
      next: (res) => {
        const blob = res.body;
        if (!blob) {
          this.baixandoAnexos.set(false);
          this.alertas.erro('Não foi possível baixar os anexos.');
          return;
        }
        const nome =
          nomeArquivoContentDisposition(res.headers.get('Content-Disposition')) || 'anexos.zip';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nome;
        a.click();
        URL.revokeObjectURL(url);
        this.baixandoAnexos.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.baixandoAnexos.set(false);
        void mensagemErroBlob(err).then((mensagem) => this.alertas.erro(mensagem));
      },
    });
  }

  verRespondente(name: string): void {
    const d = this.data();
    if (!d) return;
    const answers = d.perguntas.flatMap((q) => {
      const rows = q.respostas.filter((x) => x.respondente?.nome === name);
      if (!rows.length) return [{ q: q.texto, a: '—', anexoUrl: null }];
      return rows.map((r) => ({ q: q.texto, a: r.valor || '—', anexoUrl: r.anexoUrl || null }));
    });
    this.answerModal.set({
      title: name,
      sub: `Respostas de ${name} em ${d.formulario.titulo}`,
      answers,
    });
  }

  fecharModal(): void {
    this.answerModal.set(null);
  }

  voltar(): void {
    void this.router.navigate(['/pesquisas']);
  }

  linkPublico(): string {
    return pesquisasLinkPublico(this.data()?.formulario.slug);
  }

  linkInterno(): string {
    return pesquisasLinkInterno(this.data()?.formulario.slug);
  }

  qrDataLabel(form: { prazoInicio?: string | null; prazo?: string | null }): string {
    return pesquisasQrDataLabel(form.prazoInicio || form.prazo);
  }

  async copiarLink(): Promise<void> {
    const externo = this.data()?.formulario.publicoAlvo === 'externos';
    const link = externo ? this.linkPublico() : this.linkInterno();
    if (!link) {
      this.alertas.erro(
        externo
          ? 'Este formulário ainda não tem link público. Edite e salve para gerar.'
          : 'Este formulário ainda não tem link. Edite e salve para gerar.'
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      this.alertas.sucesso('Link copiado.');
    } catch {
      this.alertas.erro('Não foi possível copiar o link.');
    }
  }

  toggleEvento(ativo: boolean): void {
    const d = this.data();
    if (!d || this.agindo()) return;
    this.agindo.set(true);
    this.api.atualizarEvento(d.formulario.id, ativo).subscribe({
      next: () => {
        this.agindo.set(false);
        this.alertas.sucesso(ativo ? 'Formulário ativado.' : 'Formulário desativado.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.agindo.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível alterar o evento.');
      },
    });
  }
}
