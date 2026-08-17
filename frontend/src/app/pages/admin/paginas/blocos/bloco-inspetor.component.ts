import { Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import {
  AlinhamentoBotao,
  BlocoBotaoConfig,
  BlocoCarrosselConfig,
  BlocoImagemConfig,
  BlocoTextoConfig,
  CarrosselSlide,
  EstiloBotao,
  PaginaBloco,
  TipoBloco,
} from '../../../../models/pagina.model';
import { PaginasService } from '../../../../services/paginas.service';
import { AlertasService } from '../../../../services/alertas.service';
import { AdminDropzoneComponent } from '../../../../shared/admin/admin-dropzone/admin-dropzone.component';
import { TextoRicoEditorComponent } from './texto-rico-editor.component';

@Component({
  selector: 'app-bloco-inspetor',
  standalone: true,
  imports: [ReactiveFormsModule, AdminDropzoneComponent, TextoRicoEditorComponent],
  templateUrl: './bloco-inspetor.component.html',
  styleUrl: './bloco-inspetor.component.scss',
})
export class BlocoInspetorComponent {
  private readonly fb = inject(FormBuilder);
  private readonly paginasService = inject(PaginasService);
  private readonly alertas = inject(AlertasService);

  readonly bloco = input<PaginaBloco | null>(null);
  readonly blocoChange = output<PaginaBloco>();

  readonly uploadProgress = output<number>();

  readonly form = this.fb.group({
    tituloTexto: [''],
    html: [''],
    url: [''],
    alt: [''],
    legenda: [''],
    link: [''],
    label: [''],
    urlBotao: [''],
    estilo: ['primario' as EstiloBotao],
    alinhamento: ['left' as AlinhamentoBotao],
    novaAba: [false],
    autoplay: [false],
    intervaloMs: [5000],
  });

  slides: CarrosselSlide[] = [];
  private syncing = false;
  private uploadQueue = 0;

  constructor() {
    effect(() => {
      const b = this.bloco();
      this.syncFromBloco(b);
    });

    this.form.valueChanges.subscribe(() => {
      if (this.syncing || !this.bloco()) return;
      this.emitBlocoAtualizado();
    });
  }

  private syncFromBloco(b: PaginaBloco | null): void {
    this.syncing = true;
    if (!b) {
      this.form.reset();
      this.slides = [];
      this.syncing = false;
      return;
    }

    const c = b.config;
    switch (b.tipo) {
      case 'texto': {
        const tc = c as BlocoTextoConfig;
        this.form.patchValue({ tituloTexto: tc.titulo || '', html: tc.html || '' }, { emitEvent: false });
        break;
      }
      case 'imagem': {
        const ic = c as BlocoImagemConfig;
        this.form.patchValue(
          { url: ic.url || '', alt: ic.alt || '', legenda: ic.legenda || '', link: ic.link || '' },
          { emitEvent: false }
        );
        break;
      }
      case 'carrossel': {
        const cc = c as BlocoCarrosselConfig;
        if (this.uploadQueue <= 0) {
          this.slides = [...(cc.slides || [])];
        }
        this.form.patchValue(
          { autoplay: !!cc.autoplay, intervaloMs: cc.intervaloMs ?? 5000 },
          { emitEvent: false }
        );
        break;
      }
      case 'botao': {
        const bc = c as BlocoBotaoConfig;
        this.form.patchValue(
          {
            label: bc.label || '',
            urlBotao: bc.url || '',
            estilo: bc.estilo || 'primario',
            alinhamento: bc.alinhamento || 'left',
            novaAba: !!bc.novaAba,
          },
          { emitEvent: false }
        );
        break;
      }
    }
    this.syncing = false;
  }

  private emitBlocoAtualizado(): void {
    const b = this.bloco();
    if (!b) return;
    const v = this.form.getRawValue();

    let config: PaginaBloco['config'];
    switch (b.tipo) {
      case 'texto':
        config = {
          html: v.html || '<p></p>',
          ...(v.tituloTexto?.trim() ? { titulo: v.tituloTexto.trim() } : {}),
        };
        break;
      case 'imagem':
        config = {
          url: v.url || '',
          ...(v.alt?.trim() ? { alt: v.alt.trim() } : {}),
          ...(v.legenda?.trim() ? { legenda: v.legenda.trim() } : {}),
          ...(v.link?.trim() ? { link: v.link.trim() } : {}),
        };
        break;
      case 'carrossel':
        config = {
          slides: this.slides,
          ...(v.autoplay ? { autoplay: true } : {}),
          ...(v.intervaloMs ? { intervaloMs: Number(v.intervaloMs) } : {}),
        };
        break;
      case 'botao':
        config = {
          label: v.label || 'Botão',
          url: v.urlBotao || '/',
          estilo: v.estilo || 'primario',
          alinhamento: v.alinhamento || 'left',
          novaAba: !!v.novaAba,
        };
        break;
      default:
        return;
    }

    this.blocoChange.emit({ ...b, config });
  }

  uploadVariasParaCarrossel(files: File[]): void {
    const lista = files.filter((f) => f.type.startsWith('image/'));
    if (!lista.length) {
      this.alertas.erro('Selecione ao menos uma imagem válida.');
      return;
    }
    this.uploadSequencialCarrossel(lista, this.slides.filter((s) => s.url?.trim()));
  }

  uploadImagem(file: File, target: 'imagem' | 'slide', slideIdx?: number): void {
    this.enviarImagem(file, {
      onOk: (url) => {
        if (target === 'imagem') {
          this.form.patchValue({ url });
        } else if (slideIdx != null) {
          this.slides = this.slides.map((s, i) => (i === slideIdx ? { ...s, url } : s));
          this.emitBlocoAtualizado();
        }
      },
    });
  }

  private uploadSequencialCarrossel(files: File[], base: CarrosselSlide[]): void {
    let slides = [...base];
    let idx = 0;

    const next = (): void => {
      if (idx >= files.length) {
        this.slides = slides.length ? slides : [{ url: '', alt: '' }];
        this.emitBlocoAtualizado();
        if (this.uploadQueue <= 0) this.uploadProgress.emit(0);
        return;
      }

      const file = files[idx];
      idx += 1;
      this.enviarImagem(file, {
        onOk: (url) => {
          slides = [...slides, { url, alt: '' }];
          this.slides = slides;
          this.emitBlocoAtualizado();
          next();
        },
        onFail: () => next(),
      });
    };

    next();
  }

  private enviarImagem(
    file: File,
    handlers: { onOk: (url: string) => void; onFail?: () => void }
  ): void {
    this.uploadQueue += 1;
    this.paginasService.uploadImagem(file).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const pct = Math.round((100 * event.loaded) / event.total);
          this.uploadProgress.emit(pct);
        }
        if (event.type === HttpEventType.Response && event.body?.url) {
          handlers.onOk(event.body.url);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao enviar imagem.');
        handlers.onFail?.();
      },
      complete: () => {
        this.uploadQueue -= 1;
        if (this.uploadQueue <= 0) this.uploadProgress.emit(0);
      },
    });
  }

  adicionarSlide(): void {
    this.slides = [...this.slides, { url: '', alt: '' }];
    this.emitBlocoAtualizado();
  }

  removerSlide(idx: number): void {
    this.slides = this.slides.filter((_, i) => i !== idx);
    this.emitBlocoAtualizado();
  }

  atualizarSlideCampo(idx: number, campo: keyof CarrosselSlide, valor: string): void {
    this.slides = this.slides.map((s, i) => (i === idx ? { ...s, [campo]: valor } : s));
    this.emitBlocoAtualizado();
  }

  labelTipo(tipo: TipoBloco | undefined): string {
    const map: Record<TipoBloco, string> = {
      texto: 'Texto',
      imagem: 'Imagem',
      carrossel: 'Carrossel',
      botao: 'Botão',
    };
    return tipo ? map[tipo] : '';
  }
}
