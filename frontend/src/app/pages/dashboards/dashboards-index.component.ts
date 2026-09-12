import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { PowerBiService } from '../../services/powerbi.service';
import { PowerBiReportListItem } from '../../models/powerbi.model';

@Component({
  selector: 'app-dashboards-index',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, RouterLink],
  templateUrl: './dashboards-index.component.html',
  styleUrl: './dashboards-index.component.scss',
})
export class DashboardsIndexComponent implements OnInit {
  private readonly powerBi = inject(PowerBiService);

  readonly relatorios = signal<PowerBiReportListItem[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal('');

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.powerBi.listarReports().subscribe({
      next: (items) => {
        this.relatorios.set(items);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Não foi possível carregar os dashboards.');
        this.carregando.set(false);
      },
    });
  }
}
