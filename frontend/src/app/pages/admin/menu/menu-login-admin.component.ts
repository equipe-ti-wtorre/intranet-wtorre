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
import { SiteBrandingService } from '../../../services/site-branding.service';
import { AdminDropzoneComponent } from '../../../shared/admin/admin-dropzone/admin-dropzone.component';
import {
  LoginConfig,
  LoginEmpresaEstilo,
  LoginEmpresaVariante,
  LOGIN_DEFAULTS,
  LOGIN_VARIANTE_ESTILOS,
  corDeVariante,
  estiloDeVariante,
} from '../../../models/login.model';

const VARIANTES: { value: LoginEmpresaVariante; label: string }[] = [
  { value: 'wt', label: 'WTorre (azul)' },
  { value: 'nb', label: 'Nubank (roxo)' },
  { value: 'bs', label: 'Base (verde)' },
  { value: 'an', label: 'Anhangabaú (laranja)' },
];

const ESTILOS: { value: LoginEmpresaEstilo; label: string }[] = [
  { value: 'wlogo', label: 'Badge escuro (WTorre)' },
  { value: 'led', label: 'Ponto colorido' },
];

function hexCorValidator(): ValidatorFn {
  return (ctrl: AbstractControl) => {
    const v = String(ctrl.value ?? '').trim();
    if (!v) return null;
    return /^#?[0-9a-fA-F]{6}$/.test(v) ? null : { hexCor: 'Use cor em formato #RRGGBB.' };
  };
}

function empresaLinkUrlValidator(): ValidatorFn {
  return (ctrl: AbstractControl) => {
    const url = String(ctrl.value ?? '').trim();
    if (!url) return null;
    return /^https?:\/\/.+/i.test(url)
      ? null
      : { urlExterna: 'URL deve começar com http:// ou https://.' };
  };
}

@Component({
  selector: 'app-menu-login-admin',
  standalone: true,
  imports: [ReactiveFormsModule, AdminDropzoneComponent],
  templateUrl: './menu-login-admin.component.html',
  styleUrl: './menu-login-admin.component.scss',
})
export class MenuLoginAdminComponent implements OnInit, OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly alertas = inject(AlertasService);
  private readonly siteBranding = inject(SiteBrandingService);

  readonly variantes = VARIANTES;
  readonly estilos = ESTILOS;
  readonly mensagem = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly carregando = signal(true);
  readonly uploadando = signal<string | null>(null);
  readonly faviconPreviewStamp = signal(0);
  readonly FAVICON_LOGO_ID = 'site-favicon';

  readonly form = this.fb.nonNullable.group({
    favicon_url: [''],
    marca_exibir: [true],
    marca_titulo: ['', Validators.required],
    marca_subtitulo: ['', Validators.required],
    hero_exibir: [true],
    hero_linha1: ['', Validators.required],
    hero_destaque: ['', Validators.required],
    hero_lead: ['', Validators.required],
    pill_texto: ['', Validators.required],
    auth_titulo: ['', Validators.required],
    auth_subtitulo: ['', Validators.required],
    aviso_seguranca: ['', Validators.required],
    rodape_copyright: ['', Validators.required],
    rodape_contato: ['', Validators.required],
    empresas_titulo: ['', Validators.required],
    empresas: this.fb.array<FormGroup>([]),
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

  empresasArray(): FormArray<FormGroup> {
    return this.form.controls.empresas;
  }

  private carregar(): void {
    this.menuService.getLogin().subscribe({
      next: (config) => {
        this.patchForm(config);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else {
          this.erro.set(err.error?.mensagem || 'Erro ao carregar página de login.');
        }
        this.patchForm(LOGIN_DEFAULTS);
        this.carregando.set(false);
      },
    });
  }

  private patchForm(config: LoginConfig): void {
    this.form.patchValue({
      favicon_url: config.favicon_url ?? '',
      marca_exibir: config.marca_topo.exibir !== false,
      marca_titulo: config.marca_topo.titulo,
      marca_subtitulo: config.marca_topo.subtitulo,
      hero_exibir: config.hero.exibir !== false,
      hero_linha1: config.hero.titulo_linha1,
      hero_destaque: config.hero.titulo_destaque,
      hero_lead: config.hero.lead,
      pill_texto: config.pill.texto,
      auth_titulo: config.auth.titulo,
      auth_subtitulo: config.auth.subtitulo,
      aviso_seguranca: config.aviso_seguranca,
      rodape_copyright: config.rodape.copyright,
      rodape_contato: config.rodape.contato,
      empresas_titulo: config.empresas_titulo,
    });
    this.empresasArray().clear();
    for (const empresa of [...config.empresas].sort((a, b) => a.ordem - b.ordem)) {
      this.empresasArray().push(this.criarEmpresaGroup(empresa));
    }
    this.aplicarValidadoresExibicao();
  }

  aplicarValidadoresExibicao(): void {
    const marcaExibir = this.form.controls.marca_exibir.value;
    const heroExibir = this.form.controls.hero_exibir.value;

    this.setRequired(this.form.controls.marca_titulo, marcaExibir);
    this.setRequired(this.form.controls.marca_subtitulo, marcaExibir);
    this.setRequired(this.form.controls.hero_linha1, heroExibir);
    this.setRequired(this.form.controls.hero_destaque, heroExibir);
    this.setRequired(this.form.controls.hero_lead, heroExibir);
  }

  private setRequired(ctrl: AbstractControl, required: boolean): void {
    if (required) {
      ctrl.setValidators(Validators.required);
    } else {
      ctrl.clearValidators();
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private criarEmpresaGroup(empresa?: Partial<LoginConfig['empresas'][0]>): FormGroup {
    const variante = (empresa?.variante ?? 'wt') as LoginEmpresaVariante;
    return this.fb.nonNullable.group({
      id: [empresa?.id ?? this.gerarId(), Validators.required],
      nome: [empresa?.nome ?? '', Validators.required],
      variante: [variante, Validators.required],
      cor: [empresa?.cor ?? corDeVariante(variante), [Validators.required, hexCorValidator()]],
      estilo: [empresa?.estilo ?? estiloDeVariante(variante), Validators.required],
      imagem_url: [empresa?.imagem_url ?? ''],
      link_url: [empresa?.link_url ?? '', empresaLinkUrlValidator()],
      nova_aba: [empresa?.nova_aba !== false],
    });
  }

  aplicarPresetCor(index: number): void {
    const group = this.empresasArray().at(index);
    const variante = group.get('variante')?.value as LoginEmpresaVariante;
    group.patchValue({
      cor: corDeVariante(variante),
      estilo: LOGIN_VARIANTE_ESTILOS[variante],
    });
  }

  onCorPickerChange(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.empresasArray().at(index).patchValue({ cor: value });
  }

  corParaPicker(hex: string): string {
    const v = String(hex ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
    return '#1d54e6';
  }

  adicionarEmpresa(): void {
    this.empresasArray().push(this.criarEmpresaGroup());
  }

  removerEmpresa(index: number): void {
    this.empresasArray().removeAt(index);
  }

  moverEmpresa(index: number, dir: -1 | 1): void {
    const target = index + dir;
    const arr = this.empresasArray();
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(target, ctrl);
  }

  trocarEmpresaImagem(dropzone: AdminDropzoneComponent): void {
    dropzone.openFilePicker();
  }

  trocarFavicon(dropzone: AdminDropzoneComponent): void {
    dropzone.openFilePicker();
  }

  removerFavicon(): void {
    this.form.patchValue({ favicon_url: '' });
    this.faviconPreviewStamp.update((v) => v + 1);
    this.siteBranding.applyFavicon(null);
  }

  onFaviconFile(file: File): void {
    this.uploadando.set(this.FAVICON_LOGO_ID);
    this.erro.set('');

    this.menuService.uploadLogoImagem(this.FAVICON_LOGO_ID, file).subscribe({
      next: (res) => {
        this.form.patchValue({ favicon_url: res.imagem_url });
        this.faviconPreviewStamp.update((v) => v + 1);
        this.siteBranding.applyFavicon(res.imagem_url);
        if (res.compactado) {
          this.alertas.sucesso('Favicon salvo e otimizado automaticamente.');
        } else {
          this.mensagem.set('Favicon salvo.');
        }
        this.uploadando.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao enviar favicon.');
        this.uploadando.set(null);
      },
    });
  }

  estaUploadandoFavicon(): boolean {
    return this.uploadando() === this.FAVICON_LOGO_ID;
  }

  removerEmpresaImagem(index: number): void {
    this.empresasArray().at(index).patchValue({ imagem_url: '' });
  }

  onEmpresaFile(index: number, file: File): void {
    const group = this.empresasArray().at(index);
    const empresaId = group.get('id')?.value as string;
    if (!empresaId?.trim()) {
      this.erro.set('Defina um ID para a empresa antes de enviar a imagem.');
      return;
    }

    this.uploadando.set(empresaId);
    this.erro.set('');

    this.menuService.uploadLogoImagem(empresaId, file).subscribe({
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
    const config: LoginConfig = {
      favicon_url: raw.favicon_url?.trim() || null,
      marca_topo: {
        titulo: raw.marca_titulo.trim(),
        subtitulo: raw.marca_subtitulo.trim(),
        exibir: raw.marca_exibir,
      },
      hero: {
        titulo_linha1: raw.hero_linha1.trim(),
        titulo_destaque: raw.hero_destaque.trim(),
        lead: raw.hero_lead.trim(),
        exibir: raw.hero_exibir,
      },
      pill: { texto: raw.pill_texto.trim() },
      auth: {
        titulo: raw.auth_titulo.trim(),
        subtitulo: raw.auth_subtitulo.trim(),
      },
      aviso_seguranca: raw.aviso_seguranca.trim(),
      rodape: {
        copyright: raw.rodape_copyright.trim(),
        contato: raw.rodape_contato.trim(),
      },
      empresas_titulo: raw.empresas_titulo.trim(),
      empresas: raw.empresas.map((empresa, index) => {
        const corRaw = String(empresa['cor'] ?? '').trim();
        const cor = corRaw.startsWith('#') ? corRaw : `#${corRaw}`;
        return {
          id: empresa['id'].trim(),
          nome: empresa['nome'].trim(),
          variante: empresa['variante'] as LoginEmpresaVariante,
          cor,
          estilo: empresa['estilo'] as LoginEmpresaEstilo,
          imagem_url: empresa['imagem_url']?.trim() || null,
          link_url: empresa['link_url']?.trim() || null,
          nova_aba: empresa['nova_aba'],
          ordem: index,
        };
      }),
    };

    this.menuService.salvarLogin(config).subscribe({
      next: () => {
        this.siteBranding.applyFavicon(config.favicon_url);
        this.mensagem.set('Página de login salva.');
        this.salvando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.erro.set('Sessão expirada. Faça login novamente.');
          void this.auth.logout(true, false);
        } else if (err.status === 403) {
          this.erro.set('Sem permissão para editar a página de login.');
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
    if (ctrl.errors['hexCor']) {
      return typeof ctrl.errors['hexCor'] === 'string'
        ? ctrl.errors['hexCor']
        : 'Cor inválida.';
    }
    if (ctrl.errors['urlExterna']) {
      return typeof ctrl.errors['urlExterna'] === 'string'
        ? ctrl.errors['urlExterna']
        : 'URL inválida.';
    }
    return 'Valor inválido.';
  }

  estaUploadando(empresaId: string): boolean {
    return this.uploadando() === empresaId;
  }

  private coletarErrosValidacao(): string {
    const erros: string[] = [];
    const labels: Record<string, string> = {
      marca_titulo: 'Título da marca',
      marca_subtitulo: 'Subtítulo da marca',
      hero_linha1: 'Hero linha 1',
      hero_destaque: 'Hero destaque',
      hero_lead: 'Hero texto de apoio',
      pill_texto: 'Selo restrito',
      auth_titulo: 'Título autenticação',
      auth_subtitulo: 'Subtítulo autenticação',
      aviso_seguranca: 'Aviso de segurança',
      rodape_copyright: 'Copyright',
      rodape_contato: 'Contato',
      empresas_titulo: 'Título empresas',
    };
    for (const [key, label] of Object.entries(labels)) {
      const ctrl = this.form.get(key);
      if (ctrl?.invalid) erros.push(label);
    }
    this.empresasArray().controls.forEach((group, i) => {
      if (
        group.get('id')?.invalid ||
        group.get('nome')?.invalid ||
        group.get('cor')?.invalid ||
        group.get('link_url')?.invalid
      ) {
        erros.push(`Empresa ${i + 1}`);
      }
    });
    return erros.length
      ? `Preencha os campos obrigatórios: ${erros.join('; ')}.`
      : 'Verifique os campos do formulário.';
  }

  private gerarId(): string {
    return `empresa-${crypto.randomUUID().slice(0, 8)}`;
  }
}
