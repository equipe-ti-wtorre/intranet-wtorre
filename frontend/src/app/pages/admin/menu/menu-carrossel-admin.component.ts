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
import {
  HomeCarrosselConfig,
  HOME_CARROSSEL_DEFAULTS,
} from '../../../models/home-carrossel.model';

function carrosselLinkUrlValidator(): ValidatorFn {
  return (ctrl: AbstractControl) => {
    const url = String(ctrl.value ?? '').trim();
    if (!url) return null;
    return /^https?:\/\/.+/i.test(url)
      ? null
      : { urlExterna: 'Link deve começar com http:// ou https://.' };
  };
}

@Component({
  selector: 'app-menu-carrossel-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminDropzoneComponent],
  templateUrl: './menu-carrossel-admin.component.html',
  styleUrl: './menu-carrossel-admin.component.scss',
})
export class MenuCarrosselAdminComponent implements OnInit, OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);

  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly carregando = signal(true);
  readonly uploadando = signal<number | null>(null);

  readonly form = this.fb.nonNullable.group({
    autoplay: [true],
    intervaloMs: [5000, [Validators.required, Validators.min(1000), Validators.max(60000)]],
    alturaPx: [420, [Validators.required, Validators.min(200), Validators.max(800)]],
    slides: this.fb.array<FormGroup>([]),
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

  slidesArray(): FormArray<FormGroup> {
    return this.form.controls.slides;
  }

  private carregar(): void {
    this.menuService.getHomeCarrossel().subscribe({
      next: (config) => {
        this.patchForm(config);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else {
          this.erro.set(err.error?.mensagem || 'Erro ao carregar carrossel.');
        }
        this.patchForm(HOME_CARROSSEL_DEFAULTS);
        this.carregando.set(false);
      },
    });
  }

  private patchForm(config: HomeCarrosselConfig): void {
    this.form.patchValue({
      autoplay: config.autoplay,
      intervaloMs: config.intervaloMs,
      alturaPx: config.alturaPx,
    });
    this.slidesArray().clear();
    for (const slide of config.slides.sort((a, b) => a.ordem - b.ordem)) {
      this.slidesArray().push(this.criarSlideGroup(slide));
    }
  }

  private criarSlideGroup(slide?: Partial<HomeCarrosselConfig['slides'][0]>): FormGroup {
    return this.fb.nonNullable.group({
      id: [slide?.id ?? this.gerarId(), Validators.required],
      url: [slide?.url ?? '', Validators.required],
      alt: [slide?.alt ?? ''],
      legenda: [slide?.legenda ?? ''],
      link: [slide?.link ?? '', carrosselLinkUrlValidator()],
    });
  }

  adicionarSlide(): void {
    this.slidesArray().push(this.criarSlideGroup());
  }

  removerSlide(index: number): void {
    this.slidesArray().removeAt(index);
  }

  moverSlide(index: number, dir: -1 | 1): void {
    const target = index + dir;
    const arr = this.slidesArray();
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(target, ctrl);
  }

  trocarSlideImagem(dropzone: AdminDropzoneComponent): void {
    dropzone.openFilePicker();
  }

  removerSlideImagem(index: number): void {
    this.slidesArray().at(index).patchValue({ url: '' });
  }

  onSlideFile(index: number, file: File): void {
    this.uploadando.set(index);
    this.erro.set('');

    this.menuService.uploadCarrosselImagem(file).subscribe({
      next: (res) => {
        const group = this.slidesArray().at(index);
        group.patchValue({ url: res.url });
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
    const config: HomeCarrosselConfig = {
      autoplay: raw.autoplay,
      intervaloMs: raw.intervaloMs,
      alturaPx: raw.alturaPx,
      slides: raw.slides.map((slide, index) => {
        const alt = (slide['alt'] || '').trim();
        const legenda = slide['legenda']?.trim() || alt || null;
        return {
          id: slide['id'].trim(),
          url: slide['url'].trim(),
          alt,
          legenda,
          link: slide['link']?.trim() || null,
          ordem: index,
        };
      }),
    };

    this.menuService.salvarHomeCarrossel(config).subscribe({
      next: () => {
        this.mensagem.set('Carrossel da home salvo.');
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else if (err.status === 403) {
          this.erro.set('Sem permissão para editar o carrossel.');
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
    if (ctrl.errors['min']) return `Valor mínimo: ${ctrl.errors['min'].min}.`;
    if (ctrl.errors['max']) return `Valor máximo: ${ctrl.errors['max'].max}.`;
    if (ctrl.errors['urlExterna']) {
      return typeof ctrl.errors['urlExterna'] === 'string'
        ? ctrl.errors['urlExterna']
        : 'Link inválido.';
    }
    return 'Valor inválido.';
  }

  estaUploadando(index: number): boolean {
    return this.uploadando() === index;
  }

  private coletarErrosValidacao(): string {
    const erros: string[] = [];
    if (this.form.controls.intervaloMs.invalid) erros.push('intervalo');
    if (this.form.controls.alturaPx.invalid) erros.push('altura do banner');
    this.slidesArray().controls.forEach((group, i) => {
      const id = group.get('id')?.invalid ? 'ID' : null;
      const img = group.get('url')?.invalid ? 'imagem' : null;
      const url = group.get('link')?.invalid ? 'link' : null;
      const parts = [id, img, url].filter(Boolean);
      if (parts.length) erros.push(`Slide ${i + 1}: ${parts.join(', ')}`);
    });
    return erros.length
      ? `Preencha os campos obrigatórios: ${erros.join('; ')}.`
      : 'Verifique os campos do formulário.';
  }

  private gerarId(): string {
    return `slide-${crypto.randomUUID().slice(0, 8)}`;
  }
}
