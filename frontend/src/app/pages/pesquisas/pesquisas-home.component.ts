import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, forkJoin } from 'rxjs';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  PesquisasListItem,
  PesquisasMinhaResposta,
  PesquisasResumo,
} from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';

@Component({
  selector: 'app-pesquisas-home',
  standalone: true,
  imports: [PesqIconComponent],
  templateUrl: './pesquisas-home.component.html',
})
export class PesquisasHomeComponent implements OnInit, OnDestroy {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly router = inject(Router);
  private readonly busca$ = new Subject<string>();
  private readonly buscaSub = this.busca$
    .pipe(debounceTime(300), distinctUntilChanged())
    .subscribe((q) => this.busca.set(q));

  readonly loading = signal(true);
  readonly loadingLista = signal(true);
  readonly tab = signal<'created' | 'mine'>('created');
  readonly busca = signal('');
  readonly criados = signal<PesquisasListItem[]>([]);
  readonly respondidos = signal<PesquisasListItem[]>([]);
  readonly answerModal = signal<{
    title: string;
    sub: string;
    answers: { q: string; a: string }[];
    loading: boolean;
  } | null>(null);
  readonly resumo = signal<PesquisasResumo>({
    formPending: 0,
    formAnswered: 0,
    formCreated: 0,
    reqPending: 0,
    reqAnswered: 0,
    reqCreated: 0,
    itensCriados: 0,
    publicados: 0,
    rascunhos: 0,
    respostasRecebidas: 0,
  });

  readonly criadosFiltrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    return this.criados().filter((it) => {
      if (it.kind !== 'formulario') return false;
      return (
        !q ||
        it.title.toLowerCase().includes(q) ||
        (it.category || '').toLowerCase().includes(q)
      );
    });
  });

  ngOnInit(): void {
    this.api.resumo().subscribe({
      next: (r) => {
        this.resumo.set({
          ...r,
          itensCriados: r.formCreated,
          publicados: r.publicados ?? 0,
          rascunhos: r.rascunhos ?? 0,
          respostasRecebidas: r.respostasRecebidas ?? 0,
        });
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar a Central de Pesquisas.');
        this.loading.set(false);
      },
    });
    this.carregarListas();
  }

  ngOnDestroy(): void {
    this.buscaSub.unsubscribe();
  }

  onBusca(value: string): void {
    this.busca$.next(value);
  }

  setTab(tab: 'created' | 'mine'): void {
    this.tab.set(tab);
  }

  formPct(item: PesquisasListItem): number {
    const total = item.publicoAlvoTotal || 0;
    const n = item.totalRespostas || 0;
    if (!total) return n > 0 ? 100 : 0;
    return Math.min(100, Math.round((100 * n) / total));
  }

  statusBadgeClass(item: PesquisasListItem): string {
    if (item.formStatus === 'publicado') return 'done';
    if (item.formStatus === 'rascunho') return 'draft';
    return 'closed';
  }

  statusBadgeText(item: PesquisasListItem): string {
    if (item.formStatus === 'publicado') return 'Publicado';
    if (item.formStatus === 'rascunho') return 'Rascunho';
    return 'Encerrado';
  }

  abrirDashboard(item: PesquisasListItem): void {
    void this.router.navigate(['/pesquisas/formulario', item.id, 'resultados']);
  }

  criarFormulario(): void {
    void this.router.navigate(['/pesquisas/formulario/novo']);
  }

  verMinhasRespostas(item: PesquisasListItem): void {
    this.answerModal.set({
      title: item.title,
      sub: item.date,
      answers: [],
      loading: true,
    });
    this.api.minhaResposta(item.id).subscribe({
      next: (r: PesquisasMinhaResposta) => {
        this.answerModal.set({
          title: r.title,
          sub: r.sub,
          answers: r.answers,
          loading: false,
        });
      },
      error: (err: HttpErrorResponse) => {
        this.fecharRespostas();
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar suas respostas.');
      },
    });
  }

  fecharRespostas(): void {
    this.answerModal.set(null);
  }

  private carregarListas(): void {
    this.loadingLista.set(true);
    forkJoin({
      forms: this.api.listFormularios('form-created'),
      formsAns: this.api.listFormularios('form-answered'),
    }).subscribe({
      next: ({ forms, formsAns }) => {
        this.criados.set([...forms].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || '')));
        this.respondidos.set(
          [...formsAns].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))
        );
        this.loadingLista.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar seus itens.');
        this.loadingLista.set(false);
      },
    });
  }
}
