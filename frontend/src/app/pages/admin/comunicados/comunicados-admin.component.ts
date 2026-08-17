import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import { AlertasService } from '../../../services/alertas.service';
import { ComunicadosService } from '../../../services/comunicados.service';
import {
  ComunicadoAdmin,
  ComunicadoCategoriaRecord,
} from '../../../models/comunicado.model';
import { formatarDataExibicao } from '../../../utils/comunicado-categoria.util';

@Component({
  selector: 'app-comunicados-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminModalComponent],
  templateUrl: './comunicados-admin.component.html',
  styleUrl: './comunicados-admin.component.scss',
})
export class ComunicadosAdminComponent implements OnInit {
  private readonly comunicadosService = inject(ComunicadosService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly categorias = signal<ComunicadoCategoriaRecord[]>([]);
  readonly categoriasAtivas = computed(() => this.categorias().filter((c) => c.ativo));
  readonly comunicados = signal<ComunicadoAdmin[]>([]);
  readonly busca = signal('');
  readonly carregando = signal(true);
  readonly carregandoCategorias = signal(true);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly modalAberto = signal(false);

  readonly editandoCatId = signal<number | null>(null);
  readonly modalCatAberto = signal(false);
  readonly salvandoCat = signal(false);

  readonly comunicadosFiltrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const list = this.comunicados();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.titulo.toLowerCase().includes(q) ||
        c.categoriaLabel.toLowerCase().includes(q)
    );
  });

  private buscaTimer: ReturnType<typeof setTimeout> | null = null;

  readonly form = this.fb.nonNullable.group({
    titulo: ['', Validators.required],
    categoriaId: ['' as string | number, Validators.required],
    dataPublicacao: ['', Validators.required],
    ordem: ['' as string | number],
    ativo: [true],
  });

  readonly catForm = this.fb.nonNullable.group({
    nome: ['', Validators.required],
    cor: ['#1d54e6', Validators.required],
    ordem: [0],
    ativo: [true],
  });

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
    this.carregarCategorias();
    this.carregar();
  }

  onBuscaInput(value: string): void {
    if (this.buscaTimer) clearTimeout(this.buscaTimer);
    this.buscaTimer = setTimeout(() => this.busca.set(value), 300);
  }

  carregarCategorias(): void {
    this.carregandoCategorias.set(true);
    this.comunicadosService.listarCategoriasAdmin().subscribe({
      next: (list) => {
        this.categorias.set(list);
        this.carregandoCategorias.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar categorias.');
        this.carregandoCategorias.set(false);
      },
    });
  }

  carregar(): void {
    this.carregando.set(true);
    this.comunicadosService.listarAdmin().subscribe({
      next: (list) => {
        this.comunicados.set(list);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar comunicados.');
        this.carregando.set(false);
      },
    });
  }

  novaCategoria(): void {
    this.cancelarCategoria();
    this.modalCatAberto.set(true);
  }

  editarCategoria(cat: ComunicadoCategoriaRecord): void {
    this.editandoCatId.set(cat.id);
    this.catForm.patchValue({
      nome: cat.nome,
      cor: cat.cor,
      ordem: cat.ordem,
      ativo: cat.ativo,
    });
    this.modalCatAberto.set(true);
  }

  fecharModalCat(): void {
    this.modalCatAberto.set(false);
    this.cancelarCategoria();
  }

  cancelarCategoria(): void {
    this.editandoCatId.set(null);
    this.catForm.reset({ cor: '#1d54e6', ordem: 0, ativo: true });
  }

  tituloModalCat(): string {
    return this.editandoCatId() ? 'Editar categoria' : 'Nova categoria';
  }

  subtituloModalCat(): string {
    return 'Defina o nome e a cor exibida no mural de comunicados.';
  }

  salvarCategoria(): void {
    if (this.catForm.invalid) {
      this.catForm.markAllAsTouched();
      return;
    }

    const raw = this.catForm.getRawValue();
    const payload = {
      nome: raw.nome.trim(),
      cor: raw.cor,
      ordem: Number(raw.ordem) || 0,
      ativo: raw.ativo,
    };

    const editId = this.editandoCatId();
    this.salvandoCat.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const req = editId
      ? this.comunicadosService.atualizarCategoria(editId, payload)
      : this.comunicadosService.criarCategoria(payload);

    req.subscribe({
      next: () => {
        this.mensagem.set(editId ? 'Categoria atualizada.' : 'Categoria criada.');
        this.salvandoCat.set(false);
        this.modalCatAberto.set(false);
        this.cancelarCategoria();
        this.carregarCategorias();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar categoria.');
        this.salvandoCat.set(false);
      },
    });
  }

  async excluirCategoria(cat: ComunicadoCategoriaRecord): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${cat.nome}”?`,
      texto: 'Só é possível excluir categorias sem comunicados vinculados.',
    });
    if (!ok) return;

    this.comunicadosService.removerCategoria(cat.id).subscribe({
      next: () => {
        this.mensagem.set('Categoria excluída.');
        this.carregarCategorias();
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir a categoria.'),
    });
  }

  novo(): void {
    this.cancelar();
    const primeira = this.categoriasAtivas()[0];
    this.form.patchValue({
      categoriaId: primeira?.id ?? '',
      dataPublicacao: new Date().toISOString().slice(0, 10),
      ativo: true,
    });
    this.modalAberto.set(true);
  }

  editar(c: ComunicadoAdmin): void {
    this.editandoId.set(c.id);
    this.form.patchValue({
      titulo: c.titulo,
      categoriaId: c.categoriaId,
      dataPublicacao: c.dataPublicacao,
      ordem: c.ordem ?? '',
      ativo: c.ativo,
    });
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.cancelar();
  }

  cancelar(): void {
    this.editandoId.set(null);
    this.form.reset({ ativo: true });
  }

  tituloModal(): string {
    return this.editandoId() ? 'Editar comunicado' : 'Novo comunicado';
  }

  subtituloModal(): string {
    return this.editandoId()
      ? 'Atualize o aviso exibido no mural da intranet.'
      : 'Cadastre um aviso para o mural da página inicial.';
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const ordemRaw = raw.ordem;
    const ordem =
      ordemRaw === '' || ordemRaw === null || ordemRaw === undefined
        ? null
        : Number(ordemRaw);

    if (ordem != null && !Number.isFinite(ordem)) {
      this.erro.set('Ordem deve ser um número.');
      return;
    }

    const payload = {
      titulo: raw.titulo.trim(),
      categoriaId: Number(raw.categoriaId),
      dataPublicacao: raw.dataPublicacao,
      ordem,
      ativo: raw.ativo,
    };

    const editId = this.editandoId();
    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const req = editId
      ? this.comunicadosService.atualizar(editId, payload)
      : this.comunicadosService.criar(payload);

    req.subscribe({
      next: () => {
        this.mensagem.set(editId ? 'Comunicado atualizado.' : 'Comunicado criado.');
        this.salvando.set(false);
        this.modalAberto.set(false);
        this.cancelar();
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar comunicado.');
        this.salvando.set(false);
      },
    });
  }

  async excluir(c: ComunicadoAdmin): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${c.titulo}”?`,
      texto: 'Esta ação não pode ser desfeita.',
    });
    if (!ok) return;

    this.comunicadosService.remover(c.id).subscribe({
      next: () => {
        this.mensagem.set('Comunicado excluído.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) =>
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir o comunicado.'),
    });
  }

  dataLabel(c: ComunicadoAdmin): string {
    return formatarDataExibicao(c.dataPublicacao);
  }
}
