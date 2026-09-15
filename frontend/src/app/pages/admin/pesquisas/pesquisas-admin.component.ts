import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AlertasService } from '../../../services/alertas.service';
import { PesquisasService } from '../../../services/pesquisas.service';
import { PesquisasListItem, PesquisasPortalSlide, PesquisasTemplateVisual, STATUS_LABEL } from '../../../models/pesquisas.model';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';

type Aba = 'formularios' | 'templates' | 'carrossel';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const CODIGO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Component({
  selector: 'app-pesquisas-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminModalComponent],
  templateUrl: './pesquisas-admin.component.html',
  styleUrl: './pesquisas-admin.component.scss',
})
export class PesquisasAdminComponent implements OnInit, OnDestroy {
  private readonly api = inject(PesquisasService);
  private readonly alertas = inject(AlertasService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly busca$ = new Subject<string>();
  private sub = this.busca$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((q) => {
    this.q.set(q);
    this.carregar();
  });

  readonly aba = signal<Aba>('formularios');
  readonly loading = signal(true);
  readonly items = signal<PesquisasListItem[]>([]);
  readonly templates = signal<PesquisasTemplateVisual[]>([]);
  readonly slides = signal<PesquisasPortalSlide[]>([]);
  readonly q = signal('');
  readonly statusLabel = STATUS_LABEL;

  readonly modalAberto = signal(false);
  readonly salvando = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly editandoCodigo = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    codigo: ['', [Validators.required, Validators.pattern(CODIGO)]],
    nome: ['', [Validators.required, Validators.maxLength(80)]],
    wordmark: ['', [Validators.required, Validators.maxLength(80)]],
    corPrimaria: ['#1d54e6', [Validators.required, Validators.pattern(HEX)]],
    corPrimariaEscura: ['#0b2a6b', [Validators.required, Validators.pattern(HEX)]],
    raioPx: [10, [Validators.required, Validators.min(0), Validators.max(40)]],
    ordem: [0, [Validators.min(0), Validators.max(999)]],
    ativo: [true],
  });

  readonly modalSlideAberto = signal(false);
  readonly salvandoSlide = signal(false);
  readonly editandoSlideId = signal<number | null>(null);
  readonly slideTitulo = signal('');
  readonly slideAtivo = signal(true);
  readonly slideFile = signal<File | null>(null);
  readonly slidePreviewUrl = signal<string | null>(null);
  readonly slideErroArquivo = signal('');
  private slideObjectUrl: string | null = null;

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.revokeSlidePreview();
  }

  selecionarAba(aba: Aba): void {
    this.aba.set(aba);
    this.q.set('');
    this.carregar();
  }

  onBusca(value: string): void {
    this.busca$.next(value);
  }

  carregar(): void {
    this.loading.set(true);
    if (this.aba() === 'templates') {
      this.api.adminTemplates(this.q()).subscribe({
        next: (rows) => {
          this.templates.set(rows);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao carregar os templates.');
          this.loading.set(false);
        },
      });
      return;
    }
    if (this.aba() === 'carrossel') {
      this.api.adminCarrossel(this.q()).subscribe({
        next: (rows) => {
          this.slides.set(rows);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.alertas.erro(err.error?.mensagem || 'Erro ao carregar o carrossel.');
          this.loading.set(false);
        },
      });
      return;
    }
    const req$ = this.api.adminFormularios(this.q());
    req$.subscribe({
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

  ver(item: PesquisasListItem): void {
    void this.router.navigate(['/pesquisas/formulario', item.id, 'resultados']);
  }

  async encerrar(item: PesquisasListItem): Promise<void> {
    const ok = await this.alertas.confirmar({
      titulo: `Encerrar “${item.title}”?`,
      texto: 'Ninguém poderá mais responder este formulário.',
      confirmar: 'Encerrar',
    });
    if (!ok) return;
    this.api.adminEncerrarFormulario(item.id).subscribe({
      next: () => {
        this.alertas.sucesso('Formulário encerrado.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível encerrar.');
      },
    });
  }

  async excluir(item: PesquisasListItem): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${item.title}”?`,
      texto: 'Esta ação não pode ser desfeita.',
    });
    if (!ok) return;
    const req$ = this.api.adminExcluirFormulario(item.id);
    req$.subscribe({
      next: () => {
        this.alertas.sucesso('Excluído.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir.');
      },
    });
  }

  novoTemplate(): void {
    this.editandoId.set(null);
    this.editandoCodigo.set(null);
    this.form.reset({
      codigo: '',
      nome: '',
      wordmark: '',
      corPrimaria: '#1d54e6',
      corPrimariaEscura: '#0b2a6b',
      raioPx: 10,
      ordem: 0,
      ativo: true,
    });
    this.form.controls.codigo.enable();
    this.form.controls.ativo.enable();
    this.modalAberto.set(true);
  }

  editarTemplate(t: PesquisasTemplateVisual): void {
    this.editandoId.set(t.id ?? null);
    this.editandoCodigo.set(t.codigo);
    this.form.reset({
      codigo: t.codigo,
      nome: t.nome,
      wordmark: t.wordmark,
      corPrimaria: t.corPrimaria,
      corPrimariaEscura: t.corPrimariaEscura,
      raioPx: t.raioPx,
      ordem: t.ordem ?? 0,
      ativo: t.ativo !== false,
    });
    this.form.controls.codigo.disable();
    if (t.codigo === 'wtorre') this.form.controls.ativo.disable();
    else this.form.controls.ativo.enable();
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.editandoId.set(null);
    this.editandoCodigo.set(null);
  }

  tituloModal(): string {
    return this.editandoId() ? 'Editar template' : 'Novo template';
  }

  isWtorre(): boolean {
    return this.editandoCodigo() === 'wtorre';
  }

  salvarTemplate(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const payload: Record<string, unknown> = {
      nome: raw.nome.trim(),
      wordmark: raw.wordmark.trim(),
      corPrimaria: raw.corPrimaria,
      corPrimariaEscura: raw.corPrimariaEscura,
      raioPx: Number(raw.raioPx) || 10,
      ordem: Number(raw.ordem) || 0,
      ativo: this.isWtorre() ? true : raw.ativo,
    };
    const editId = this.editandoId();
    if (!editId) payload['codigo'] = raw.codigo.trim().toLowerCase();

    this.salvando.set(true);
    const req$ = editId ? this.api.atualizarTemplate(editId, payload) : this.api.criarTemplate(payload);
    req$.subscribe({
      next: () => {
        this.alertas.sucesso(editId ? 'Template atualizado.' : 'Template criado.');
        this.salvando.set(false);
        this.fecharModal();
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar o template.');
        this.salvando.set(false);
      },
    });
  }

  async excluirTemplate(t: PesquisasTemplateVisual): Promise<void> {
    if (t.codigo === 'wtorre' || !t.id) return;
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${t.nome}”?`,
      texto: 'Templates em uso por formulários não podem ser excluídos.',
    });
    if (!ok) return;
    this.api.excluirTemplate(t.id).subscribe({
      next: () => {
        this.alertas.sucesso('Template excluído.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir o template.');
      },
    });
  }

  novaImagem(): void {
    this.editandoSlideId.set(null);
    this.slideTitulo.set('');
    this.slideAtivo.set(true);
    this.slideFile.set(null);
    this.slideErroArquivo.set('');
    this.revokeSlidePreview();
    this.slidePreviewUrl.set(null);
    this.modalSlideAberto.set(true);
  }

  editarSlide(s: PesquisasPortalSlide): void {
    this.editandoSlideId.set(s.id);
    this.slideTitulo.set(s.titulo || '');
    this.slideAtivo.set(s.ativo);
    this.slideFile.set(null);
    this.slideErroArquivo.set('');
    this.revokeSlidePreview();
    this.slidePreviewUrl.set(s.imagemUrl);
    this.modalSlideAberto.set(true);
  }

  fecharModalSlide(): void {
    this.modalSlideAberto.set(false);
    this.editandoSlideId.set(null);
    this.slideFile.set(null);
    this.slideErroArquivo.set('');
    this.revokeSlidePreview();
    this.slidePreviewUrl.set(null);
  }

  tituloModalSlide(): string {
    return this.editandoSlideId() ? 'Editar imagem' : 'Nova imagem';
  }

  slideSaveDisabled(): boolean {
    if (this.salvandoSlide()) return true;
    if (!this.editandoSlideId() && !this.slideFile()) return true;
    return !!this.slideErroArquivo();
  }

  onSlideFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.slideErroArquivo.set('');
    if (!file) {
      this.slideFile.set(null);
      return;
    }
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!ok) {
      this.slideFile.set(null);
      this.slideErroArquivo.set('Use JPEG, PNG ou WebP.');
      input.value = '';
      return;
    }
    this.slideFile.set(file);
    this.revokeSlidePreview();
    this.slideObjectUrl = URL.createObjectURL(file);
    this.slidePreviewUrl.set(this.slideObjectUrl);
  }

  salvarSlide(): void {
    if (this.slideSaveDisabled()) return;
    const editId = this.editandoSlideId();
    const payload = {
      titulo: this.slideTitulo().trim(),
      ativo: this.slideAtivo(),
      imagem: this.slideFile() || undefined,
    };
    if (!editId && !payload.imagem) return;
    this.salvandoSlide.set(true);
    const req$ = editId
      ? this.api.atualizarCarrosselSlide(editId, payload)
      : this.api.criarCarrosselSlide({ titulo: payload.titulo, ativo: payload.ativo, imagem: payload.imagem as File });
    req$.subscribe({
      next: () => {
        this.alertas.sucesso(editId ? 'Imagem atualizada.' : 'Imagem adicionada.');
        this.salvandoSlide.set(false);
        this.fecharModalSlide();
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível salvar a imagem.');
        this.salvandoSlide.set(false);
      },
    });
  }

  async excluirSlide(s: PesquisasPortalSlide): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir ${s.titulo ? `“${s.titulo}”` : 'esta imagem'}?`,
      texto: 'Ela deixa de aparecer na porta pública.',
    });
    if (!ok) return;
    this.api.excluirCarrosselSlide(s.id).subscribe({
      next: () => {
        this.alertas.sucesso('Imagem excluída.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível excluir.');
      },
    });
  }

  moverSlide(s: PesquisasPortalSlide, direcao: 'up' | 'down'): void {
    this.api.moverCarrosselSlide(s.id, direcao).subscribe({
      next: () => this.carregar(),
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Não foi possível reordenar.');
      },
    });
  }

  private revokeSlidePreview(): void {
    if (this.slideObjectUrl) {
      URL.revokeObjectURL(this.slideObjectUrl);
      this.slideObjectUrl = null;
    }
  }
}
