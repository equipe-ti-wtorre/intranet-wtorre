import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { PublicChromeComponent } from '../../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../../shared/footer/footer.component';
import { CamarotesDashboardComponent } from '../../../shared/camarotes/camarotes-dashboard.component';
import { CamarotesService } from '../../../services/camarotes.service';
import { AuthService } from '../../../services/auth.service';
import { AlertasService } from '../../../services/alertas.service';
import { CamarotesDashboard } from '../../../models/camarote.model';

@Component({
  selector: 'app-camarotes-view',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, CamarotesDashboardComponent, RouterLink],
  templateUrl: './camarotes-view.component.html',
  styleUrl: './camarotes-view.component.scss',
})
export class CamarotesViewComponent implements OnInit, OnDestroy {
  private readonly camarotesService = inject(CamarotesService);
  private readonly alertas = inject(AlertasService);
  private readonly document = inject(DOCUMENT);
  readonly auth = inject(AuthService);

  readonly dashboard = signal<CamarotesDashboard | null>(null);
  readonly carregando = signal(false);
  readonly sincronizando = signal(false);
  readonly erro = signal('');

  readonly podeAdmin = computed(() => this.auth.hasModulo('camarotes'));

  readonly ultimaSyncLabel = computed(() => {
    const d = this.dashboard()?.ultima_sync;
    return d ? new Date(d).toLocaleString('pt-BR') : 'Nunca sincronizado';
  });

  ngOnInit(): void {
    this.document.body.classList.add('pagina-camarotes');
    this.carregar();
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('pagina-camarotes');
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.camarotesService.dashboard().subscribe({
      next: (d) => {
        this.dashboard.set(d);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar dashboard.');
        this.carregando.set(false);
      },
    });
  }

  async sincronizar(): Promise<void> {
    const ok = await this.alertas.confirmar({
      titulo: 'Sincronizar planilha',
      texto: 'Importar dados do SharePoint agora? Os registros atuais de camarotes serão substituídos.',
      confirmar: 'Sincronizar',
    });
    if (!ok) return;

    this.sincronizando.set(true);
    this.camarotesService.sincronizar().subscribe({
      next: () => {
        this.alertas.sucesso('Sincronização concluída.');
        this.carregar();
        this.sincronizando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro na sincronização.');
        this.sincronizando.set(false);
      },
    });
  }
}
