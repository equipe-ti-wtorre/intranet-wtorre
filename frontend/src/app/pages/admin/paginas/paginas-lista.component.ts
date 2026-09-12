import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AlertasService } from '../../../services/alertas.service';
import { PaginasService } from '../../../services/paginas.service';
import { Pagina } from '../../../models/pagina.model';

@Component({
  selector: 'app-paginas-lista',
  standalone: true,
  templateUrl: './paginas-lista.component.html',
  styleUrl: './paginas-lista.component.scss',
})
export class PaginasListaComponent implements OnInit {
  private readonly paginasService = inject(PaginasService);
  private readonly alertas = inject(AlertasService);
  private readonly router = inject(Router);

  readonly paginas = signal<Pagina[]>([]);
  readonly busca = signal('');
  readonly carregando = signal(true);
  readonly mensagem = signal('');
  readonly erro = signal('');

  readonly paginasFiltradas = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const list = this.paginas();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.titulo.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        `/p/${p.slug}`.includes(q)
    );
  });

  private buscaTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const msg = this.mensagem();
      if (msg) this.alertas.sucesso(msg);
    });
    effect(() => {
      const err = this.erro();
      if (err) this.alertas.erro(err);
    });
  }

  ngOnInit(): void {
    this.carregar();
  }

  onBuscaInput(value: string): void {
    if (this.buscaTimer) clearTimeout(this.buscaTimer);
    this.buscaTimer = setTimeout(() => this.busca.set(value), 300);
  }

  carregar(): void {
    this.carregando.set(true);
    this.paginasService.listar().subscribe({
      next: (list) => {
        this.paginas.set(list);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar páginas.');
        this.carregando.set(false);
      },
    });
  }

  nova(): void {
    this.router.navigate(['/admin/paginas/nova']);
  }

  editar(p: Pagina): void {
    this.router.navigate(['/admin/paginas', p.id, 'editar']);
  }

  async excluir(p: Pagina): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${p.titulo}”?`,
      texto: 'Esta ação não pode ser desfeita.',
    });
    if (!ok) return;

    this.paginasService.remover(p.id).subscribe({
      next: () => {
        this.mensagem.set('Página excluída.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir a página.'),
    });
  }

  statusLabel(status: string): string {
    return status === 'publicada' ? 'Publicada' : 'Rascunho';
  }

  formatarData(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
