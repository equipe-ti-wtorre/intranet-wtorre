import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  PesquisasConvidado,
  PesquisasResultadoPergunta,
  PesquisasResultados,
  PesquisasSerieDia,
} from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { pesquisasLinkPublico } from './shared/pesquisas-public-url';
import { PesquisasQrCardComponent } from './shared/pesquisas-qr-card.component';
import { pesquisasQrDataLabel } from './shared/pesquisas-qr-export.util';
import { PesquisasConvidadoModalComponent } from './shared/pesquisas-convidado-modal.component';
import { extractGuestsFromRows } from './shared/pesquisas-base.util';

type DestaqueTone = 'avg' | 'ok' | 'warn' | 'pick' | 'notes';
type DestaqueCard = { k: string; v: string; s: string; icon: string; tone: DestaqueTone };

type LinhaEnvioCsv = {
  respostaId: number;
  nome: string;
  email: string;
  departamento: string;
  enviadoEm: string | null;
  porPergunta: Map<number, string>;
};

function titulosColunasPerguntas(perguntas: PesquisasResultadoPergunta[]): string[] {
  const seen = new Map<string, number>();
  return perguntas.map((q) => {
    const base = (q.texto || 'Pergunta').trim() || 'Pergunta';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function formatarDataCsv(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function montarCsvRespostas(d: PesquisasResultados): string[][] {
  const perguntas = d.perguntas;
  const titulos = titulosColunasPerguntas(perguntas);
  const anonimo = d.formulario.anonimo;
  const envios = new Map<number, LinhaEnvioCsv>();

  for (const q of perguntas) {
    if (q.id == null) continue;
    for (const r of q.respostas) {
      const id = r.respostaId;
      if (id == null) continue;
      let row = envios.get(id);
      if (!row) {
        row = {
          respostaId: id,
          nome: r.respondente?.nome || '',
          email: r.respondente?.email || '',
          departamento: r.respondente?.departamento || '',
          enviadoEm: r.enviadoEm,
          porPergunta: new Map(),
        };
        envios.set(id, row);
      }
      row.porPergunta.set(q.id, r.valor ?? '');
    }
  }

  const ordenados = [...envios.values()].sort((a, b) => {
    const ta = a.enviadoEm || '';
    const tb = b.enviadoEm || '';
    return ta.localeCompare(tb) || a.respostaId - b.respostaId;
  });

  const header = anonimo
    ? ['Resposta', 'Data', ...titulos]
    : ['Respondente', 'E-mail', 'Departamento', 'Data', ...titulos];

  const lines = [header];
  ordenados.forEach((row, i) => {
    const answers = perguntas.map((q) => (q.id != null ? row.porPergunta.get(q.id) || '' : ''));
    if (anonimo) {
      lines.push([String(i + 1), formatarDataCsv(row.enviadoEm), ...answers]);
    } else {
      lines.push([
        row.nome,
        row.email,
        row.departamento,
        formatarDataCsv(row.enviadoEm),
        ...answers,
      ]);
    }
  });
  return lines;
}

@Component({
  selector: 'app-pesquisas-resultados',
  standalone: true,
  imports: [PesqIconComponent, PesquisasQrCardComponent, PesquisasConvidadoModalComponent],
  templateUrl: './pesquisas-resultados.component.html',
})
export class PesquisasResultadosComponent implements OnInit {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly qrAberto = signal(false);
  readonly convidadoModalAberto = signal(false);
  readonly convidadoEditando = signal<PesquisasConvidado | null>(null);
  readonly importandoConvidados = signal(false);
  readonly loading = signal(true);
  readonly agindo = signal(false);
  readonly data = signal<PesquisasResultados | null>(null);
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

  abrirConvidadoModal(): void {
    this.convidadoEditando.set(null);
    this.convidadoModalAberto.set(true);
  }

  editarConvidado(g: PesquisasConvidado): void {
    this.convidadoEditando.set(g);
    this.convidadoModalAberto.set(true);
  }

  fecharConvidadoModal(): void {
    this.convidadoModalAberto.set(false);
    this.convidadoEditando.set(null);
  }

  onConvidadoSalvo(): void {
    this.convidadoModalAberto.set(false);
    this.convidadoEditando.set(null);
    this.carregar();
  }

  async removerConvidado(g: PesquisasConvidado): Promise<void> {
    const id = this.data()?.formulario?.id;
    if (!id || !g.id) return;
    const ok = await this.alertas.confirmarExclusao({
      titulo: 'Remover convidado',
      texto: 'Essa pessoa deixa de conseguir entrar por este convite.',
    });
    if (!ok) return;
    this.api.removerConvidado(id, g.id).subscribe({
      next: () => {
        this.alertas.sucesso('Convidado removido.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível remover o convidado.');
      },
    });
  }

  async onExcelConvidados(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
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

  podeEditar(): boolean {
    const d = this.data();
    if (!d) return false;
    return d.formulario.status === 'rascunho' || !d.total;
  }

  editar(): void {
    const id = this.data()?.formulario.id;
    if (id) void this.router.navigate(['/pesquisas/formulario', id, 'editar']);
  }

  exportar(): void {
    const d = this.data();
    if (!d) return;
    const lines = montarCsvRespostas(d);
    const csv = lines
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${d.formulario.titulo.replace(/[^\w]+/g, '-').slice(0, 40)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.alertas.sucesso('Exportação iniciada.');
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

  verRespondente(name: string): void {
    const d = this.data();
    if (!d) return;
    const answers = d.perguntas.map((q) => {
      const r = q.respostas.find((x) => x.respondente?.nome === name);
      return { q: q.texto, a: r?.valor || '—', anexoUrl: r?.anexoUrl || null };
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

  qrDataLabel(form: { prazoInicio?: string | null; prazo?: string | null }): string {
    return pesquisasQrDataLabel(form.prazoInicio || form.prazo);
  }

  async copiarLink(): Promise<void> {
    const link = this.linkPublico();
    if (!link) {
      this.alertas.erro('Este formulário ainda não tem link público. Edite e salve para gerar.');
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
