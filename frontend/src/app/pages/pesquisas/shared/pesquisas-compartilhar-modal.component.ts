import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { PesquisasAcesso, PesquisasDestinatario, PesquisasPapelCompartilhado } from '../../../models/pesquisas.model';
import { PesquisasService } from '../../../services/pesquisas.service';
import { AlertasService } from '../../../services/alertas.service';

@Component({
  selector: 'app-pesquisas-compartilhar-modal',
  standalone: true,
  imports: [FormsModule, AdminModalComponent],
  templateUrl: './pesquisas-compartilhar-modal.component.html',
  styleUrls: [
    './pesquisas-destinatarios-modal.component.scss',
    './pesquisas-compartilhar-modal.component.scss',
  ],
})
export class PesquisasCompartilharModalComponent {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);

  readonly open = input(false);
  readonly donoUsuarioId = input<number | null>(null);
  readonly selecionados = input<PesquisasAcesso[]>([]);
  readonly confirm = output<PesquisasAcesso[]>();
  readonly cancel = output<void>();

  readonly busca = signal('');
  readonly carregando = signal(false);
  readonly candidatos = signal<PesquisasDestinatario[]>([]);
  readonly rascunho = signal<PesquisasAcesso[]>([]);
  private estavaAberto = false;

  readonly selecionadosIds = computed(() => new Set(this.rascunho().map((p) => p.usuarioId)));

  readonly disponiveisFiltrados = computed(() => {
    const ids = this.selecionadosIds();
    const dono = this.donoUsuarioId();
    const q = this.busca().trim().toLowerCase();
    return this.candidatos().filter((p) => {
      if (ids.has(p.usuarioId)) return false;
      if (dono && p.usuarioId === dono) return false;
      if (!q) return true;
      const cargo = (p.cargo || '').toLowerCase();
      const dept = (p.departamento || '').toLowerCase();
      return p.nome.toLowerCase().includes(q) || cargo.includes(q) || dept.includes(q);
    });
  });

  readonly disponiveisTotal = computed(() => {
    const ids = this.selecionadosIds();
    const dono = this.donoUsuarioId();
    return this.candidatos().filter((p) => !ids.has(p.usuarioId) && p.usuarioId !== dono).length;
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

  incluir(pessoa: PesquisasDestinatario, papel: PesquisasPapelCompartilhado): void {
    if (this.selecionadosIds().has(pessoa.usuarioId)) return;
    this.rascunho.update((list) => [
      ...list,
      {
        usuarioId: pessoa.usuarioId,
        papel,
        nome: pessoa.nome,
        email: pessoa.email,
        cargo: pessoa.cargo,
        departamento: pessoa.departamento,
      },
    ]);
  }

  setPapel(usuarioId: number, papel: PesquisasPapelCompartilhado): void {
    this.rascunho.update((list) => list.map((p) => (p.usuarioId === usuarioId ? { ...p, papel } : p)));
  }

  async remover(usuarioId: number): Promise<void> {
    const pessoa = this.rascunho().find((p) => p.usuarioId === usuarioId);
    const ok = await this.alertas.confirmar({
      titulo: 'Remover acesso',
      texto: `Tirar ${pessoa?.nome || 'esta pessoa'} da gestão compartilhada?`,
      confirmar: 'Remover',
    });
    if (!ok) return;
    this.rascunho.update((list) => list.filter((p) => p.usuarioId !== usuarioId));
  }

  salvar(): void {
    this.confirm.emit(this.uniq(this.rascunho()));
  }

  fechar(): void {
    this.cancel.emit();
  }

  subtitulo(pessoa: { cargo?: string | null; departamento?: string | null }): string {
    return [pessoa.cargo, pessoa.departamento].filter(Boolean).join(' · ') || '—';
  }

  private carregar(): void {
    this.carregando.set(true);
    this.api.listDestinatarios().subscribe({
      next: (rows) => {
        this.candidatos.set(this.uniqPessoas(rows || []));
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.carregando.set(false);
        this.alertas.erro(err.error?.mensagem || 'Não foi possível carregar os colaboradores.');
      },
    });
  }

  private uniq(list: PesquisasAcesso[]): PesquisasAcesso[] {
    const seen = new Set<number>();
    const out: PesquisasAcesso[] = [];
    for (const item of list || []) {
      const id = Number(item?.usuarioId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...item, usuarioId: id, papel: item.papel === 'editar' ? 'editar' : 'ver' });
    }
    return out;
  }

  private uniqPessoas(list: PesquisasDestinatario[]): PesquisasDestinatario[] {
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
