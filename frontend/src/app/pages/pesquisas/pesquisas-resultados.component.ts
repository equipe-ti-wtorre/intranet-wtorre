import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import { PesquisasResultadoPergunta, PesquisasResultados } from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { pesquisasLinkPublico } from './shared/pesquisas-public-url';
import { PesquisasQrCardComponent } from './shared/pesquisas-qr-card.component';
import { pesquisasQrDataLabel } from './shared/pesquisas-qr-export.util';

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
  imports: [PesqIconComponent, PesquisasQrCardComponent],
  templateUrl: './pesquisas-resultados.component.html',
})
export class PesquisasResultadosComponent implements OnInit {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly qrAberto = signal(false);
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
    return 'Formulário';
  }

  totalConvidados(): number {
    const d = this.data();
    if (!d) return 0;
    const lista = d.formulario.convidados?.length || 0;
    return lista || d.publicoAlvoTotal || 0;
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
    const max = Math.max(1, ...entries.map((e) => e.value));
    return entries.map((e) => ({ ...e, pct: Math.round((100 * e.value) / max) }));
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
