import { Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MenuService } from '../../../services/menu.service';
import { AuthService } from '../../../services/auth.service';
import { AlertasService } from '../../../services/alertas.service';
import { AdminDropzoneComponent } from '../../../shared/admin/admin-dropzone/admin-dropzone.component';
import { TopbarConfig, TOPBAR_DEFAULTS } from '../../../models/topbar.model';

function topbarLinkUrlValidator(): ValidatorFn {
  return (ctrl: AbstractControl) => {
    const url = String(ctrl.value ?? '').trim();
    if (!url) return null;
    return /^https?:\/\/.+/i.test(url)
      ? null
      : { urlExterna: 'URL deve começar com http:// ou https://.' };
  };
}

@Component({
  selector: 'app-menu-topbar-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminDropzoneComponent],
  templateUrl: './menu-topbar-admin.component.html',
  styleUrl: './menu-topbar-admin.component.scss',
})
export class MenuTopbarAdminComponent implements OnInit, OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly carregando = signal(true);
  readonly uploadando = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    suporte_texto: ['', Validators.required],
    logos: this.fb.array<FormGroup>([]),
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
    if (!this.auth.estaLogado()) {
      this.erro.set('Sessão não encontrada. Faça login novamente.');
      this.carregando.set(false);
      return;
    }

    this.auth.carregarPerfil().subscribe({
      next: () => this.carregar(),
      error: () => {
        if (this.auth.estaLogado()) this.carregar();
        else {
          this.erro.set('Sessão expirada. Faça login novamente.');
          this.carregando.set(false);
        }
      },
    });
  }

  ngOnDestroy(): void {}

  logosArray(): FormArray<FormGroup> {
    return this.form.controls.logos;
  }

  private carregar(): void {
    this.menuService.getTopbar().subscribe({
      next: (config) => {
        this.patchForm(config);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else {
          this.erro.set(err.error?.mensagem || 'Erro ao carregar barra superior.');
        }
        this.patchForm(TOPBAR_DEFAULTS);
        this.carregando.set(false);
      },
    });
  }

  private patchForm(config: TopbarConfig): void {
    this.form.patchValue({ suporte_texto: config.suporte.texto });
    this.logosArray().clear();
    for (const logo of config.logos.sort((a, b) => a.ordem - b.ordem)) {
      this.logosArray().push(this.criarLogoGroup(logo));
    }
  }

  private criarLogoGroup(logo?: Partial<TopbarConfig['logos'][0]>): FormGroup {
    return this.fb.nonNullable.group({
      id: [logo?.id ?? this.gerarId(), Validators.required],
      nome: [logo?.nome ?? '', Validators.required],
      alt: [logo?.alt ?? logo?.nome ?? ''],
      imagem_url: [logo?.imagem_url ?? '', Validators.required],
      link_url: [logo?.link_url ?? '', topbarLinkUrlValidator()],
      nova_aba: [logo?.nova_aba !== false],
    });
  }

  adicionarLogo(): void {
    this.logosArray().push(this.criarLogoGroup());
  }

  removerLogo(index: number): void {
    this.logosArray().removeAt(index);
  }

  moverLogo(index: number, dir: -1 | 1): void {
    const target = index + dir;
    const arr = this.logosArray();
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(target, ctrl);
  }

  trocarLogoImagem(dropzone: AdminDropzoneComponent): void {
    dropzone.openFilePicker();
  }

  removerLogoImagem(index: number): void {
    this.logosArray().at(index).patchValue({ imagem_url: '' });
  }

  onLogoFile(index: number, file: File): void {
    const group = this.logosArray().at(index);
    const logoId = group.get('id')?.value as string;
    if (!logoId?.trim()) {
      this.erro.set('Defina um ID para o logo antes de enviar a imagem.');
      return;
    }

    this.uploadando.set(logoId);
    this.erro.set('');

    this.menuService.uploadLogoImagem(logoId, file).subscribe({
      next: (res) => {
        group.patchValue({ imagem_url: res.imagem_url });
        if (res.compactado) {
          this.alertas.sucesso('Imagem otimizada automaticamente.');
        } else {
          this.mensagem.set('Imagem enviada.');
        }
        this.uploadando.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao enviar imagem.');
        this.uploadando.set(null);
      },
    });
  }

  salvar(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.erro.set(this.coletarErrosValidacao());
      return;
    }

    this.salvando.set(true);
    this.erro.set('');
    this.mensagem.set('');

    const raw = this.form.getRawValue();
    const config: TopbarConfig = {
      suporte: { texto: raw.suporte_texto.trim() },
      logos: raw.logos.map((logo, index) => ({
        id: logo['id'].trim(),
        nome: logo['nome'].trim(),
        alt: (logo['alt'] || logo['nome']).trim(),
        imagem_url: logo['imagem_url'].trim(),
        link_url: logo['link_url']?.trim() || null,
        nova_aba: logo['nova_aba'],
        ordem: index,
      })),
    };

    this.menuService.salvarTopbar(config).subscribe({
      next: () => {
        this.mensagem.set('Barra superior salva.');
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else if (err.status === 403) {
          this.erro.set('Sem permissão para editar a barra superior.');
        } else {
          this.erro.set(err.error?.mensagem || 'Erro ao salvar.');
        }
        this.salvando.set(false);
      },
    });
  }

  campoInvalido(ctrl: AbstractControl | null): boolean {
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  erroCampo(ctrl: AbstractControl | null): string {
    if (!ctrl?.errors) return '';
    if (ctrl.errors['required']) return 'Campo obrigatório.';
    if (ctrl.errors['urlExterna']) {
      return typeof ctrl.errors['urlExterna'] === 'string'
        ? ctrl.errors['urlExterna']
        : 'URL inválida.';
    }
    return 'Valor inválido.';
  }

  estaUploadando(logoId: string): boolean {
    return this.uploadando() === logoId;
  }

  private coletarErrosValidacao(): string {
    const erros: string[] = [];
    if (this.form.controls.suporte_texto.invalid) {
      erros.push('Texto CCO / suporte');
    }
    this.logosArray().controls.forEach((group, i) => {
      const nome = group.get('nome')?.invalid ? 'nome' : null;
      const id = group.get('id')?.invalid ? 'ID' : null;
      const img = group.get('imagem_url')?.invalid ? 'imagem' : null;
      const url = group.get('link_url')?.invalid ? 'URL externa' : null;
      const parts = [nome, id, img, url].filter(Boolean);
      if (parts.length) erros.push(`Logo ${i + 1}: ${parts.join(', ')}`);
    });
    return erros.length
      ? `Preencha os campos obrigatórios: ${erros.join('; ')}.`
      : 'Verifique os campos do formulário.';
  }

  private gerarId(): string {
    return `logo-${crypto.randomUUID().slice(0, 8)}`;
  }
}
