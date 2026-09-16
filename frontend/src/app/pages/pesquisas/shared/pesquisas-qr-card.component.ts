import {
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toCanvas } from 'qrcode';
import { PesquisasTemplateVisual } from '../../../models/pesquisas.model';
import { MenuService } from '../../../services/menu.service';
import { AlertasService } from '../../../services/alertas.service';
import { PesqIconComponent } from './pesq-icon.component';
import {
  PESQUISAS_TPL_WTORRE,
  PesquisasMarcaLogo,
  pesquisasLogoSrc,
  pesquisasLogoSrcDark,
  pesquisasMarcaCores,
  pesquisasMarcasOficiais,
} from './pesquisas-marca.util';
import { exportPesquisasQrPdf, printPesquisasQrPdf } from './pesquisas-qr-export.util';

export type PesquisasQrModo = 'botao' | 'dialogo';

@Component({
  selector: 'app-pesquisas-qr-card',
  standalone: true,
  imports: [PesqIconComponent],
  templateUrl: './pesquisas-qr-card.component.html',
  host: {
    '[class.pesq-qr-trigger]': 'modo() === "botao"',
    '[class.pesq-qr-dialog-host]': 'modo() === "dialogo"',
  },
})
export class PesquisasQrCardComponent implements OnInit {
  private readonly menu = inject(MenuService);
  private readonly alertas = inject(AlertasService);
  private readonly qrCanvas = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  readonly modo = input<PesquisasQrModo>('botao');
  readonly url = input('');
  readonly titulo = input('');
  readonly dataLabel = input('');
  readonly template = input<PesquisasTemplateVisual | null>(null);
  readonly abertoChange = output<boolean>();

  readonly exportando = signal(false);
  readonly marcas = signal<PesquisasMarcaLogo[]>(pesquisasMarcasOficiais());
  readonly tpl = computed(() => this.template() || PESQUISAS_TPL_WTORRE);
  readonly marcaCores = computed(() => pesquisasMarcaCores(this.tpl().codigo));
  readonly headerLogo = computed(() => {
    const codigo = this.tpl().codigo;
    const dark = pesquisasLogoSrcDark(codigo);
    const light = pesquisasLogoSrc(codigo, this.marcas());
    const src = dark || light;
    if (!src) return null;
    return { src, invert: !dark || dark === light };
  });

  constructor() {
    effect(() => {
      const canvas = this.qrCanvas()?.nativeElement;
      const url = this.url();
      const cores = this.marcaCores();
      if (!canvas) return;
      if (!url) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      void toCanvas(canvas, url, {
        width: 170,
        margin: 1,
        color: { dark: cores.primaria, light: cores.corpo },
        errorCorrectionLevel: 'M',
      });
    });
  }

  ngOnInit(): void {
    this.menu.getTopbarPublic().subscribe({
      next: (config) => this.marcas.set(pesquisasMarcasOficiais(config.logos)),
    });
  }

  abrir(): void {
    if (!this.url()) {
      this.alertas.erro('Salve o formulário para gerar o QR Code.');
      return;
    }
    this.abertoChange.emit(true);
  }

  fechar(): void {
    this.abertoChange.emit(false);
  }

  async imprimir(): Promise<void> {
    await this.gerarPdf('print');
  }

  async baixarPdf(): Promise<void> {
    await this.gerarPdf('save');
  }

  private async gerarPdf(destino: 'print' | 'save'): Promise<void> {
    if (this.exportando()) return;
    if (!this.url()) {
      this.alertas.erro('Salve o formulário para gerar o QR Code.');
      return;
    }
    this.exportando.set(true);
    try {
      const params = {
        url: this.url(),
        titulo: this.titulo(),
        dataLabel: this.dataLabel(),
        template: this.tpl(),
      };
      if (destino === 'print') {
        await printPesquisasQrPdf(params);
      } else {
        await exportPesquisasQrPdf(params);
        this.alertas.sucesso('PDF gerado.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível gerar o PDF.';
      this.alertas.erro(msg);
    } finally {
      this.exportando.set(false);
    }
  }
}
