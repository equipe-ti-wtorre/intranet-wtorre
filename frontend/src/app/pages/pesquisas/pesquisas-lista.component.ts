import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  ListaTipo,
  PESQUISAS_LISTA_META,
  PesquisasListItem,
  STATUS_LABEL,
} from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';

const LISTAS: ListaTipo[] = [
  'form-pending',
  'form-answered',
  'form-created',
];

@Component({
  selector: 'app-pesquisas-lista',
  standalone: true,
  imports: [PesqIconComponent],
  templateUrl: './pesquisas-lista.component.html',
})
export class PesquisasListaComponent implements OnInit, OnDestroy {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly busca$ = new Subject<string>();
  private buscaSub = this.busca$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((q) => {
    this.q.set(q);
    this.carregar();
  });

  readonly loading = signal(true);
  readonly items = signal<PesquisasListItem[]>([]);
  readonly tipo = signal<ListaTipo>('form-pending');
  readonly filtro = signal('all');
  readonly q = signal('');
  readonly meta = signal(PESQUISAS_LISTA_META['form-pending']);
  readonly statusLabel = STATUS_LABEL;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const raw = params.get('tipo') || '';
      if (!LISTAS.includes(raw as ListaTipo)) {
        void this.router.navigate(['/pesquisas'], { replaceUrl: true });
        return;
      }
      const tipo = raw as ListaTipo;
      this.tipo.set(tipo);
      this.meta.set(PESQUISAS_LISTA_META[tipo]);
      this.filtro.set('all');
      this.q.set('');
      this.carregar();
    });
  }

  ngOnDestroy(): void {
    this.buscaSub.unsubscribe();
  }

  onBusca(value: string): void {
    this.busca$.next(value);
  }

  setFiltro(f: string): void {
    this.filtro.set(f);
    this.carregar();
  }

  voltar(): void {
    void this.router.navigate(['/pesquisas']);
  }

  acao(item: PesquisasListItem): void {
    const t = this.tipo();
    if (t === 'form-pending') {
      void this.router.navigate(['/pesquisas/formulario', item.id, 'responder']);
      return;
    }
    if (t === 'form-answered') {
      this.alertas.sucesso('Você já respondeu este formulário.');
      return;
    }
    if (t === 'form-created') {
      if (item.formStatus === 'rascunho') {
        void this.router.navigate(['/pesquisas/formulario', item.id, 'editar']);
      } else {
        void this.router.navigate(['/pesquisas/formulario', item.id, 'resultados']);
      }
      return;
    }
    void this.router.navigate(['/pesquisas'], { replaceUrl: true });
  }

  private carregar(): void {
    this.loading.set(true);
    const t = this.tipo();
    const req = this.api.listFormularios(t, this.q(), this.filtro());
    req.subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao carregar a lista.');
        this.loading.set(false);
      },
    });
  }
}
