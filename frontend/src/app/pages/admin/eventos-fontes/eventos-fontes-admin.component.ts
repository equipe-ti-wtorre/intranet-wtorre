import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminModalComponent } from '../../../shared/admin/admin-modal/admin-modal.component';
import {
  DocEntidadeLogoPickerComponent,
  LogoPickerUploadFn,
} from '../../../shared/documentos/doc-entidade-logo-picker.component';
import { AlertasService } from '../../../services/alertas.service';
import { EventosFontesService } from '../../../services/eventos-fontes.service';
import {
  Evento,
  EventoFonte,
  EventoFontePayload,
  EventoParserTipo,
} from '../../../models/evento.model';

@Component({
  selector: 'app-eventos-fontes-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminModalComponent, DocEntidadeLogoPickerComponent],
  templateUrl: './eventos-fontes-admin.component.html',
  styleUrl: './eventos-fontes-admin.component.scss',
})
export class EventosFontesAdminComponent implements OnInit {
  private readonly fontesService = inject(EventosFontesService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly uploadLogoFonte: LogoPickerUploadFn = (file) =>
    this.fontesService.uploadLogo(file);

  readonly parsers = signal<EventoParserTipo[]>([]);
  readonly fontes = signal<EventoFonte[]>([]);
  readonly busca = signal('');
  readonly carregando = signal(true);
  readonly carregandoParsers = signal(true);
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly testando = signal(false);
  readonly editandoId = signal<number | null>(null);
  readonly modalAberto = signal(false);
  readonly previewAberto = signal(false);
  readonly previewEventos = signal<Evento[]>([]);
  readonly previewTitulo = signal('');
  readonly previewTotal = signal(0);

  readonly fontesFiltradas = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const list = this.fontes();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.nome.toLowerCase().includes(q) ||
        f.url.toLowerCase().includes(q) ||
        f.codigo.toLowerCase().includes(q) ||
        f.parserTipo.toLowerCase().includes(q)
    );
  });

  private buscaTimer: ReturnType<typeof setTimeout> | null = null;

  readonly form = this.fb.group({
    codigo: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    nome: this.fb.nonNullable.control('', Validators.required),
    url: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.pattern(/^https?:\/\//i),
    ]),
    parserTipo: this.fb.nonNullable.control('', Validators.required),
    ordem: this.fb.nonNullable.control(0),
    limite: this.fb.nonNullable.control('' as string | number),
    ativo: this.fb.nonNullable.control(true),
    rotulo: this.fb.control<string | null>(null),
    logoUrl: this.fb.control<string | null>(null),
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
    this.carregarParsers();
    this.carregar();
  }

  onBuscaInput(value: string): void {
    if (this.buscaTimer) clearTimeout(this.buscaTimer);
    this.buscaTimer = setTimeout(() => this.busca.set(value), 300);
  }

  carregarParsers(): void {
    this.carregandoParsers.set(true);
    this.fontesService.listarParsers().subscribe({
      next: (list) => {
        this.parsers.set(list);
        this.carregandoParsers.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar tipos de parser.');
        this.carregandoParsers.set(false);
      },
    });
  }

  carregar(): void {
    this.carregando.set(true);
    this.fontesService.listarAdmin(this.busca()).subscribe({
      next: (list) => {
        this.fontes.set(list);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar fontes.');
        this.carregando.set(false);
      },
    });
  }

  novo(): void {
    this.cancelar();
    const primeiroParser = this.parsers()[0]?.codigo || '';
    this.form.controls.codigo.setValidators([
      Validators.required,
      Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ]);
    this.form.controls.codigo.enable();
    this.form.patchValue({
      codigo: '',
      nome: '',
      url: '',
      parserTipo: primeiroParser,
      ordem: 0,
      limite: '',
      ativo: true,
      rotulo: null,
      logoUrl: null,
    });
    this.form.controls.codigo.updateValueAndValidity();
    this.modalAberto.set(true);
  }

  editar(fonte: EventoFonte): void {
    this.editandoId.set(fonte.id);
    this.form.controls.codigo.clearValidators();
    this.form.controls.codigo.enable();
    this.form.patchValue({
      codigo: fonte.codigo,
      nome: fonte.nome,
      url: fonte.url,
      parserTipo: fonte.parserTipo,
      ordem: fonte.ordem,
      limite: fonte.limite ?? '',
      ativo: fonte.ativo,
      rotulo: fonte.rotulo ?? null,
      logoUrl: fonte.logoUrl ?? null,
    });
    this.form.controls.codigo.updateValueAndValidity();
    this.modalAberto.set(true);
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.cancelar();
  }

  fecharPreview(): void {
    this.previewAberto.set(false);
    this.previewEventos.set([]);
  }

  cancelar(): void {
    this.editandoId.set(null);
    this.form.controls.codigo.setValidators([
      Validators.required,
      Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ]);
    this.form.controls.codigo.enable();
    this.form.reset({ ordem: 0, ativo: true, limite: '', rotulo: null, logoUrl: null });
    this.form.controls.codigo.updateValueAndValidity();
  }

  codigoSomenteLeitura(): boolean {
    return this.editandoId() != null;
  }

  tituloModal(): string {
    return this.editandoId() ? 'Editar fonte' : 'Nova fonte';
  }

  subtituloModal(): string {
    return 'Configure uma página externa para importar eventos no mural da intranet.';
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const limiteRaw = raw.limite;
    const limite =
      limiteRaw === '' || limiteRaw === null || limiteRaw === undefined
        ? null
        : Number(limiteRaw);

    const payload: EventoFontePayload = {
      nome: (raw.nome || '').trim(),
      url: (raw.url || '').trim(),
      parserTipo: raw.parserTipo || '',
      ordem: Number(raw.ordem) || 0,
      limite: limite && Number.isFinite(limite) ? limite : null,
      ativo: !!raw.ativo,
      rotulo: raw.rotulo?.trim() || null,
      logoUrl: raw.logoUrl?.trim() || null,
    };

    const editId = this.editandoId();

    if (!editId) {
      payload.codigo = (raw.codigo || '').trim().toLowerCase();
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const req = editId
      ? this.fontesService.atualizar(editId, payload)
      : this.fontesService.criar(payload);

    req.subscribe({
      next: () => {
        this.mensagem.set(editId ? 'Fonte atualizada.' : 'Fonte criada.');
        this.salvando.set(false);
        this.modalAberto.set(false);
        this.cancelar();
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao salvar fonte.');
        this.salvando.set(false);
      },
    });
  }

  async excluir(fonte: EventoFonte): Promise<void> {
    const ok = await this.alertas.confirmarExclusao({
      titulo: `Excluir “${fonte.nome}”?`,
      texto: 'Os eventos desta fonte deixarão de aparecer no mural.',
    });
    if (!ok) return;

    this.fontesService.remover(fonte.id).subscribe({
      next: () => {
        this.mensagem.set('Fonte excluída.');
        this.carregar();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao excluir fonte.');
      },
    });
  }

  testar(fonte: EventoFonte): void {
    this.testando.set(true);
    this.erro.set('');
    this.fontesService.testar(fonte.id).subscribe({
      next: (res) => {
        this.previewTitulo.set(fonte.nome);
        this.previewTotal.set(res.total);
        this.previewEventos.set(res.eventos);
        this.previewAberto.set(true);
        this.testando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao testar fonte.');
        this.testando.set(false);
      },
    });
  }

  parserLabel(codigo: string): string {
    return this.parsers().find((p) => p.codigo === codigo)?.nome || codigo;
  }
}
