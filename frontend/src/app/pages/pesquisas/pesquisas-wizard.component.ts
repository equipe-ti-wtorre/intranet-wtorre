import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { PesquisasService } from '../../services/pesquisas.service';
import { AlertasService } from '../../services/alertas.service';
import {
  PesquisasAprovador,
  RequisicaoPrioridade,
  RequisicaoTipo,
} from '../../models/pesquisas.model';
import { PesqIconComponent } from './shared/pesq-icon.component';

const TIPOS: { key: RequisicaoTipo; label: string; icon: string }[] = [
  { key: 'compra', label: 'Compra', icon: 'file-plus' },
  { key: 'ti', label: 'TI / Suporte', icon: 'monitor' },
  { key: 'rh', label: 'RH', icon: 'users' },
  { key: 'manutencao', label: 'Manutenção', icon: 'alert' },
  { key: 'outro', label: 'Outro', icon: 'list-checks' },
];

const STEP_LABELS = ['Tipo', 'Detalhes', 'Aprovação', 'Revisão'];
const ROTULOS = ['Gestor direto', 'Coordenador de RH', 'Coordenador de TI', 'Diretoria'];

@Component({
  selector: 'app-pesquisas-wizard',
  standalone: true,
  imports: [FormsModule, PesqIconComponent],
  templateUrl: './pesquisas-wizard.component.html',
})
export class PesquisasWizardComponent implements OnDestroy {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly router = inject(Router);
  private readonly busca$ = new Subject<string>();
  private buscaSub = this.busca$
    .pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((q) => (q.length < 2 ? of([]) : this.api.buscarAprovadores(q)))
    )
    .subscribe((rows) => this.sugestoes.set(rows));

  readonly tipos = TIPOS;
  readonly stepLabels = STEP_LABELS;
  readonly rotulos = ROTULOS;
  readonly step = signal(1);
  readonly success = signal(false);
  readonly enviando = signal(false);
  readonly tipo = signal<RequisicaoTipo | null>(null);
  readonly titulo = signal('');
  readonly descricao = signal('');
  readonly prioridade = signal<RequisicaoPrioridade | null>(null);
  readonly prazo = signal('');
  readonly aprovadorRotulo = signal('Gestor direto');
  readonly aprovadorId = signal<number | null>(null);
  readonly aprovadorNome = signal('');
  readonly aprovadorBusca = signal('');
  readonly observacoes = signal('');
  readonly arquivo = signal<File | null>(null);
  readonly sugestoes = signal<PesquisasAprovador[]>([]);

  ngOnDestroy(): void {
    this.buscaSub.unsubscribe();
  }

  tipoLabel(): string {
    return TIPOS.find((t) => t.key === this.tipo())?.label || '—';
  }

  prioridadeLabel(): string {
    const p = this.prioridade();
    if (p === 'baixa') return 'Baixa';
    if (p === 'media') return 'Média';
    if (p === 'alta') return 'Alta';
    return '—';
  }

  onBuscaAprovador(q: string): void {
    this.aprovadorBusca.set(q);
    if (this.aprovadorNome() && q !== this.aprovadorNome()) {
      this.aprovadorId.set(null);
      this.aprovadorNome.set('');
    }
    this.busca$.next(q.trim());
  }

  escolherAprovador(a: PesquisasAprovador): void {
    this.aprovadorId.set(a.id);
    this.aprovadorNome.set(a.nome);
    this.aprovadorBusca.set(a.nome);
    this.sugestoes.set([]);
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.arquivo.set(file);
  }

  next(): void {
    if (this.step() === 1 && !this.tipo()) {
      this.alertas.erro('Selecione um tipo de requisição.');
      return;
    }
    if (this.step() === 2 && !this.titulo().trim()) {
      this.alertas.erro('Informe um título para a requisição.');
      return;
    }
    if (this.step() === 3 && !this.aprovadorId()) {
      this.alertas.erro('Selecione o colaborador aprovador.');
      return;
    }
    if (this.step() < 4) {
      this.step.update((s) => s + 1);
      return;
    }
    this.enviar();
  }

  back(): void {
    if (this.step() > 1) this.step.update((s) => s - 1);
  }

  voltarHome(): void {
    void this.router.navigate(['/pesquisas']);
  }

  reset(): void {
    this.step.set(1);
    this.success.set(false);
    this.tipo.set(null);
    this.titulo.set('');
    this.descricao.set('');
    this.prioridade.set(null);
    this.prazo.set('');
    this.aprovadorId.set(null);
    this.aprovadorNome.set('');
    this.aprovadorBusca.set('');
    this.observacoes.set('');
    this.arquivo.set(null);
  }

  verLista(): void {
    void this.router.navigate(['/pesquisas']);
  }

  private enviar(): void {
    const fd = new FormData();
    fd.set('tipo', this.tipo() || '');
    fd.set('titulo', this.titulo().trim());
    fd.set('descricao', this.descricao().trim());
    fd.set('prioridade', this.prioridade() || 'media');
    if (this.prazo()) fd.set('prazo', this.prazo());
    fd.set('aprovadorUsuarioId', String(this.aprovadorId()));
    fd.set('aprovadorRotulo', this.aprovadorRotulo());
    fd.set('observacoes', this.observacoes().trim());
    const file = this.arquivo();
    if (file) fd.set('anexo', file, file.name);

    this.enviando.set(true);
    this.api.criarRequisicao(fd).subscribe({
      next: () => {
        this.enviando.set(false);
        this.success.set(true);
        this.alertas.sucesso('Requisição enviada com sucesso.');
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível enviar a requisição.');
        this.enviando.set(false);
      },
    });
  }
}
