import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { PublicChromeComponent } from '../../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../../shared/footer/footer.component';
import { AlertasService } from '../../../services/alertas.service';
import { RustdeskService } from '../../../services/rustdesk.service';
import { RustdeskServidorComponent } from './rustdesk-servidor.component';
import { RustdeskBibliotecaComponent } from './rustdesk-biblioteca.component';

export type RustdeskAba = 'servidor' | 'biblioteca';

@Component({
  selector: 'app-rustdesk',
  standalone: true,
  imports: [
    PublicChromeComponent,
    FooterComponent,
    RustdeskServidorComponent,
    RustdeskBibliotecaComponent,
  ],
  templateUrl: './rustdesk.component.html',
  styleUrl: './rustdesk.component.scss',
})
export class RustdeskComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(RustdeskService);
  private readonly alertas = inject(AlertasService);

  readonly baixandoInstalador = signal(false);

  readonly aba = toSignal(
    this.route.queryParamMap.pipe(
      map((q): RustdeskAba => (q.get('aba') === 'servidor' ? 'servidor' : 'biblioteca'))
    ),
    { initialValue: 'biblioteca' as RustdeskAba }
  );

  selecionarAba(aba: RustdeskAba): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba },
      queryParamsHandling: 'merge',
    });
  }

  baixarInstalador(): void {
    if (this.baixandoInstalador()) return;
    this.baixandoInstalador.set(true);
    this.api.baixarInstalador().subscribe({
      next: (blob) => {
        this.baixandoInstalador.set(false);
        if (blob.type && blob.type.includes('json')) {
          void blob.text().then((t) => {
            try {
              const parsed = JSON.parse(t) as { mensagem?: string };
              this.alertas.erro(parsed.mensagem || 'Instalador indisponível.');
            } catch {
              this.alertas.erro('Instalador indisponível.');
            }
          });
          return;
        }
        this.api.downloadBlob(blob, 'Rustdesk.zip');
        this.alertas.sucesso('Download do instalador iniciado.');
      },
      error: async (err: HttpErrorResponse) => {
        this.baixandoInstalador.set(false);
        let msg = 'Não foi possível baixar o instalador.';
        if (err.error instanceof Blob) {
          try {
            const parsed = JSON.parse(await err.error.text()) as { mensagem?: string };
            msg = parsed.mensagem || msg;
          } catch {
            /* ignora */
          }
        } else if (err.error?.mensagem) {
          msg = err.error.mensagem;
        }
        this.alertas.erro(msg);
      },
    });
  }
}
