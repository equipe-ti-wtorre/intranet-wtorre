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
import { pesquisasResultadosPath } from './shared/pesquisas-public-url';

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
  readonly clonandoId = signal<number | null>(null);
  readonly tab = signal<'created' | 'mine'>('created');
  readonly filtroLista = signal<'all' | 'publicado' | 'rascunho' | 'desativado'>('all');
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
    const filtro = this.filtroLista();
    return this.criados().filter((it) => {
      if (it.kind !== 'formulario') return false;
      if (filtro === 'publicado' && it.formStatus !== 'publicado') return false;
      if (filtro === 'rascunho' && it.formStatus !== 'rascunho') return false;
      if (filtro === 'desativado' && it.eventoAtivo !== false) return false;
      const cat = (it.category || '').toLowerCase();
      return !q || it.title.toLowerCase().includes(q) || cat.includes(q);
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
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar os formulários.');
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
    if (item.formStatus === 'publicado' && item.janela === 'depois') return 'closed';
    if (item.formStatus === 'publicado' && item.janela === 'antes') return 'review';
    if (item.formStatus === 'publicado') return 'done';
    if (item.formStatus === 'rascunho') return 'draft';
    return 'closed';
  }

  statusBadgeText(item: PesquisasListItem): string {
    if (item.formStatus === 'publicado' && item.janela === 'depois') return 'Encerrado';
    if (item.formStatus === 'publicado' && item.janela === 'antes') return 'Aguardando';
    if (item.formStatus === 'publicado') return 'Publicado';
    if (item.formStatus === 'rascunho') return 'Rascunho';
    return 'Encerrado';
  }

  janelaRotulo(item: PesquisasListItem): string {
    const ini = this.rotuloJanela(item.prazoInicio);
    const fim = this.rotuloJanela(item.prazoFim);
    if (ini && fim) return `${ini} – ${fim}`;
    if (ini) return `Abre ${ini}`;
    if (fim) return `Fecha ${fim}`;
    return 'Sem janela';
  }

  private rotuloJanela(iso: string | null | undefined): string {
    if (!iso) return '';
    const s = String(iso).replace(' ', 'T');
    const [date, timeRaw = ''] = s.split('T');
    const [y, m, d] = (date || '').split('-');
    const hm = timeRaw.match(/^(\d{1,2}):(\d{2})/);
    const hora = hm ? `${String(Number(hm[1])).padStart(2, '0')}:${hm[2]}` : '';
    if (!y || !m || !d) return '';
    return hora ? `${d}/${m} ${hora}` : `${d}/${m}`;
  }

  abrirDashboard(item: PesquisasListItem): void {
    void this.router.navigate(pesquisasResultadosPath(item));
  }

  criarFormulario(): void {
    void this.router.navigate(['/pesquisas/formulario/novo']);
  }

  async clonarFormulario(item: PesquisasListItem): Promise<void> {
    if (this.clonandoId()) return;
    const ok = await this.alertas.confirmar({
      titulo: `Clonar “${item.title}”?`,
      texto:
        'Será criada uma cópia em rascunho com o mesmo layout, perguntas e dados importados. A lista de convidados não entra na cópia. Você poderá editar e publicar.',
      confirmar: 'Clonar',
    });
    if (!ok) return;
    this.clonandoId.set(item.id);
    this.api.clonarFormulario(item.id).subscribe({
      next: (form) => {
        this.clonandoId.set(null);
        this.alertas.sucesso('Cópia criada. Ajuste o que quiser e publique.');
        void this.router.navigate(['/pesquisas/formulario', form.id, 'editar']);
      },
      error: (err: HttpErrorResponse) => {
        this.clonandoId.set(null);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível clonar o formulário.');
      },
    });
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
