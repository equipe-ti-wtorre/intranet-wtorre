import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { PesquisasDestinatario } from '../../../models/pesquisas.model';
import { PesquisasService } from '../../../services/pesquisas.service';
import { AlertasService } from '../../../services/alertas.service';

@Component({
  selector: 'app-pesquisas-destinatarios-modal',
  standalone: true,
  imports: [FormsModule, AdminModalComponent],
  templateUrl: './pesquisas-destinatarios-modal.component.html',
  styleUrl: './pesquisas-destinatarios-modal.component.scss',
})
export class PesquisasDestinatariosModalComponent {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);

  readonly open = input(false);
  readonly selecionados = input<PesquisasDestinatario[]>([]);
  readonly confirm = output<PesquisasDestinatario[]>();
  readonly cancel = output<void>();

  readonly busca = signal('');
  readonly carregando = signal(false);
  readonly candidatos = signal<PesquisasDestinatario[]>([]);
  readonly rascunho = signal<PesquisasDestinatario[]>([]);
  private estavaAberto = false;

  readonly selecionadosIds = computed(() => new Set(this.rascunho().map((p) => p.usuarioId)));

  readonly disponiveisFiltrados = computed(() => {
    const ids = this.selecionadosIds();
    const q = this.busca().trim().toLowerCase();
    return this.candidatos().filter((p) => {
      if (ids.has(p.usuarioId)) return false;
      if (!q) return true;
      const cargo = (p.cargo || '').toLowerCase();
      const dept = (p.departamento || '').toLowerCase();
      return p.nome.toLowerCase().includes(q) || cargo.includes(q) || dept.includes(q);
    });
  });

  readonly disponiveisTotal = computed(() => {
    const ids = this.selecionadosIds();
    return this.candidatos().filter((p) => !ids.has(p.usuarioId)).length;
  });

  constructor() {
    effect(() => {
      const aberto = this.open();
      if (aberto && !this.estavaAberto) {
        this.busca.set('');
        this.rascunho.set(this.uniq(this.selecionados()));
        if (!this.candidatos().length) this.carregar();
      }
      this.estavaAberto = aberto;
    });
  }

  incluir(pessoa: PesquisasDestinatario): void {
    if (this.selecionadosIds().has(pessoa.usuarioId)) return;
    this.rascunho.update((list) => [...list, pessoa]);
  }

  incluirTodos(): void {
    const ids = this.selecionadosIds();
    const extra = this.disponiveisFiltrados().filter((p) => !ids.has(p.usuarioId));
    if (!extra.length) return;
    this.rascunho.update((list) => [...list, ...extra]);
  }

  remover(usuarioId: number): void {
    this.rascunho.update((list) => list.filter((p) => p.usuarioId !== usuarioId));
  }

  removerTodos(): void {
    this.rascunho.set([]);
  }

  salvar(): void {
    if (!this.rascunho().length) return;
    this.confirm.emit(this.uniq(this.rascunho()));
  }

  fechar(): void {
    this.cancel.emit();
  }

  subtitulo(pessoa: PesquisasDestinatario): string {
    return [pessoa.cargo, pessoa.departamento].filter(Boolean).join(' · ') || '—';
  }

  private carregar(): void {
    this.carregando.set(true);
    this.api.listDestinatarios().subscribe({
      next: (rows) => {
        this.candidatos.set(this.uniq(rows || []));
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.carregando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar os colaboradores.');
      },
    });
  }

  private uniq(list: PesquisasDestinatario[]): PesquisasDestinatario[] {
    const seen = new Set<number>();
    const out: PesquisasDestinatario[] = [];
    for (const item of list || []) {
      const id = Number(item?.usuarioId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...item, usuarioId: id });
    }
    return out;
  }
}
