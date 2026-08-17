import { Component, forwardRef, inject, input, OnInit, signal } from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminDropzoneComponent } from '../admin/admin-dropzone/admin-dropzone.component';
import { MenuService } from '../../services/menu.service';
import { DocumentosService } from '../../services/documentos.service';
import { AlertasService } from '../../services/alertas.service';
import { TopbarLogo } from '../../models/topbar.model';

export type LogoPickerUploadFn = (file: File) => Observable<{
  url: string;
  compactado?: boolean;
}>;

@Component({
  selector: 'app-doc-entidade-logo-picker',
  standalone: true,
  imports: [FormsModule, AdminDropzoneComponent],
  templateUrl: './doc-entidade-logo-picker.component.html',
  styleUrl: './doc-entidade-logo-picker.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DocEntidadeLogoPickerComponent),
      multi: true,
    },
  ],
})
export class DocEntidadeLogoPickerComponent implements ControlValueAccessor, OnInit {
  private readonly menuService = inject(MenuService);
  private readonly documentosService = inject(DocumentosService);
  private readonly alertas = inject(AlertasService);

  readonly disabled = input(false);
  /** Quando informado, usa este upload em vez do endpoint de documentos/páginas. */
  readonly uploadLogo = input<LogoPickerUploadFn | null>(null);

  readonly logosGrupo = signal<TopbarLogo[]>([]);
  readonly carregandoLogos = signal(true);
  readonly uploadando = signal(false);
  readonly urlManualAberta = signal(false);
  readonly valorAtual = signal('');

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};
  private isDisabled = false;

  ngOnInit(): void {
    this.menuService.getTopbarPublic().subscribe({
      next: (config) => {
        this.logosGrupo.set([...config.logos].sort((a, b) => a.ordem - b.ordem));
        this.carregandoLogos.set(false);
      },
      error: () => {
        this.logosGrupo.set([]);
        this.carregandoLogos.set(false);
      },
    });
  }

  writeValue(value: string | null): void {
    const v = value ?? '';
    this.valorAtual.set(v);
    if (v && !this.logosGrupo().some((l) => l.imagem_url === v)) {
      this.urlManualAberta.set(true);
    }
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

  estaDesabilitado(): boolean {
    return this.disabled() || this.isDisabled;
  }

  selecionarLogo(url: string): void {
    if (this.estaDesabilitado()) return;
    this.patchValor(url);
  }

  removerLogo(): void {
    if (this.estaDesabilitado()) return;
    this.patchValor('');
  }

  alternarUrlManual(): void {
    this.urlManualAberta.update((v) => !v);
    this.onTouched();
  }

  onUrlManualInput(value: string): void {
    this.patchValor(value);
  }

  onLogoFile(file: File): void {
    if (this.estaDesabilitado()) return;
    this.uploadando.set(true);
    const customUpload = this.uploadLogo();
    const upload$ = customUpload
      ? customUpload(file)
      : this.documentosService.uploadPaginaLogo(file);
    upload$.subscribe({
      next: (res) => {
        this.patchValor(res.url);
        if (res.compactado) {
          this.alertas.sucesso('Imagem otimizada automaticamente.');
        }
        this.uploadando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao enviar logo.');
        this.uploadando.set(false);
      },
    });
  }

  logoSelecionado(url: string): boolean {
    return this.valorAtual() === url;
  }

  private patchValor(value: string): void {
    const v = value.trim();
    this.valorAtual.set(v);
    this.onChange(v || null);
    this.onTouched();
  }
}
