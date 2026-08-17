import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as pbi from 'powerbi-client';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { PowerBiService } from '../../services/powerbi.service';

@Component({
  selector: 'app-dashboards-view',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, RouterLink],
  templateUrl: './dashboards-view.component.html',
  styleUrl: './dashboards-view.component.scss',
})
export class DashboardsViewComponent implements OnInit, OnDestroy {
  @ViewChild('embedHost', { static: true }) embedHost!: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly powerBi = inject(PowerBiService);

  private embedService: pbi.service.Service | null = null;
  private embeddedReport: pbi.Report | null = null;

  readonly carregando = signal(true);
  readonly erro = signal('');
  readonly titulo = signal('Dashboard');

  reportId = '';

  ngOnInit(): void {
    this.reportId = this.route.snapshot.paramMap.get('reportId') || '';
    if (!this.reportId) {
      this.erro.set('Relatório inválido.');
      this.carregando.set(false);
      return;
    }
    this.embedService = new pbi.service.Service(
      pbi.factories.hpmFactory,
      pbi.factories.wpmpFactory,
      pbi.factories.routerFactory
    );
    this.carregarEmbed();
  }

  ngOnDestroy(): void {
    if (this.embeddedReport) {
      this.embeddedReport.off('tokenExpired');
    }
    if (this.embedService) {
      this.embedService.reset(this.embedHost.nativeElement);
    }
  }

  private carregarEmbed(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.powerBi.obterEmbedToken(this.reportId).subscribe({
      next: (token) => {
        this.titulo.set(this.reportId);
        this.renderEmbed(token.embedUrl, token.embedToken);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Não foi possível abrir o dashboard.');
        this.carregando.set(false);
      },
    });
  }

  private renderEmbed(embedUrl: string, accessToken: string): void {
    if (!this.embedService) return;

    const config: pbi.IEmbedConfiguration = {
      type: 'report',
      embedUrl,
      accessToken,
      tokenType: pbi.models.TokenType.Embed,
      settings: {
        panes: {
          filters: { expanded: false, visible: false },
          pageNavigation: { visible: true },
        },
      },
    };

    const embedded = this.embedService.embed(this.embedHost.nativeElement, config);
    this.embeddedReport = embedded as pbi.Report;

    this.embeddedReport.on('tokenExpired', () => {
      this.powerBi.obterEmbedToken(this.reportId).subscribe({
        next: (token) => {
          this.embeddedReport?.setAccessToken(token.embedToken);
        },
        error: () => {
          this.erro.set('Sessão do dashboard expirou. Recarregue a página.');
        },
      });
    });
  }
}
