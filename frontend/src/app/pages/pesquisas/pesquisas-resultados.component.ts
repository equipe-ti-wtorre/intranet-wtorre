import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  PesquisasResultadoPergunta,
  PesquisasResultados,
  PesquisasSerieDia,
} from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';
import { pesquisasLinkPublico } from './shared/pesquisas-public-url';
import { PesquisasQrCardComponent } from './shared/pesquisas-qr-card.component';
import { pesquisasQrDataLabel } from './shared/pesquisas-qr-export.util';

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
    answers: { q: string; a: string }[];
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

  statusClass(): string {
    const form = this.data()?.formulario;
    if (form?.status === 'publicado' && form.janela === 'depois') return 'closed';
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

  escalaBars(q: PesquisasResultadoPergunta): { label: string; pct: number }[] {
    const dist = q.agregados.dist || [1, 2, 3, 4, 5].map((n) => {
      const found = q.agregados.opcoes?.find((o) => o.valor === String(n));
      return found?.count || 0;
    });
    const total = dist.reduce((a, b) => a + b, 0) || 1;
    return dist.map((c, i) => ({ label: `Nota ${i + 1}`, pct: Math.round((100 * c) / total) }));
  }

  choiceBars(q: PesquisasResultadoPergunta): { label: string; pct: number }[] {
    const ops = q.agregados.opcoes || [];
    const total = ops.reduce((a, o) => a + o.count, 0) || 1;
    return ops.map((o) => ({ label: o.valor, pct: Math.round((100 * o.count) / total) }));
  }

  samples(q: PesquisasResultadoPergunta): string[] {
    return q.respostas.map((r) => r.valor).filter(Boolean).slice(0, 8);
  }

  chartBars(): { x: number; y: number; w: number; h: number; label: string; value: number; op: number }[] {
    const series: PesquisasSerieDia[] = this.data()?.dailySeries || [];
    const w = 560;
    const h = 170;
    const pad = 26;
    const max = Math.max(1, ...series.map((s) => s.value));
    const gap = series.length ? (w - pad * 2) / series.length : 0;
    const bw = gap * 0.55;
    return series.map((s, i) => {
      const bh = Math.round((h - pad * 2) * (s.value / max));
      const x = pad + i * gap + (gap - bw) / 2;
      const y = h - pad - Math.max(bh, 2);
      return {
        x,
        y,
        w: bw,
        h: Math.max(bh, 2),
        label: s.label,
        value: s.value,
        op: 0.5 + 0.5 * (s.value / max),
      };
    });
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

  async clonar(): Promise<void> {
    const d = this.data();
    if (!d || this.agindo()) return;
    const ok = await this.alertas.confirmar({
      titulo: `Clonar “${d.formulario.titulo}”?`,
      texto:
        'Será criada uma cópia em rascunho com o mesmo layout, perguntas e dados importados. Você poderá editar e publicar.',
      confirmar: 'Clonar',
    });
    if (!ok) return;
    this.agindo.set(true);
    this.api.clonarFormulario(d.formulario.id).subscribe({
      next: (form) => {
        this.agindo.set(false);
        this.alertas.sucesso('Cópia criada. Ajuste o que quiser e publique.');
        void this.router.navigate(['/pesquisas/formulario', form.id, 'editar']);
      },
      error: (err: HttpErrorResponse) => {
        this.agindo.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível clonar o formulário.');
      },
    });
  }

  exportar(): void {
    const d = this.data();
    if (!d) return;
    const lines = [['Pergunta', 'Resposta', 'Respondente', 'Data']];
    for (const q of d.perguntas) {
      if (!q.respostas.length) {
        lines.push([q.texto, '', '', '']);
        continue;
      }
      for (const r of q.respostas) {
        lines.push([
          q.texto,
          r.valor,
          d.formulario.anonimo ? '' : r.respondente?.nome || '',
          r.enviadoEm || '',
        ]);
      }
    }
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

  verRespondente(name: string): void {
    const d = this.data();
    if (!d) return;
    const answers = d.perguntas.map((q) => {
      const r = q.respostas.find((x) => x.respondente?.nome === name);
      return { q: q.texto, a: r?.valor || '—' };
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
