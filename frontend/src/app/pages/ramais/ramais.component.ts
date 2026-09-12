import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { ToastComponent } from '../../shared/toast/toast.component';
import { ToastService } from '../../shared/toast/toast.service';
import { ColaboradoresService } from '../../services/colaboradores.service';
import { AuthService } from '../../services/auth.service';
import { MenuService } from '../../services/menu.service';
import { RamaisCardComponent } from './ramais-card/ramais-card.component';
import {
  buildLogoMapPorNome,
  corMarcaEmpresa,
  empresasDistintas,
  fallbackLogoMapPorNome,
  logoUrlEmpresa as resolveLogoUrlEmpresa,
} from '../../utils/empresa-classe.util';

@Component({
  selector: 'app-ramais',
  standalone: true,
  imports: [
    PublicChromeComponent,
    FooterComponent,
    ToastComponent,
    FormsModule,
    RamaisCardComponent,
  ],
  templateUrl: './ramais.component.html',
  styleUrl: './ramais.component.scss',
})
export class RamaisComponent implements OnInit, OnDestroy {
  private readonly colaboradoresService = inject(ColaboradoresService);
  private readonly auth = inject(AuthService);
  private readonly menuService = inject(MenuService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  readonly colaboradores = signal<import('../../models/colaborador.model').Colaborador[]>([]);
  readonly sincronizadoEm = signal<string | null>(null);
  readonly departamentos = signal<string[]>([]);
  readonly busca = signal('');
  readonly empresaFiltro = signal<string | null>(null);
  readonly departamentoFiltro = signal<string>('');
  readonly carregando = signal(false);
  readonly sincronizando = signal(false);
  readonly erro = signal('');
  readonly logosPorEmpresa = signal<Record<string, string>>(fallbackLogoMapPorNome());

  readonly OUTROS_EMPRESA = '__outros__';

  readonly empresas = computed(() => empresasDistintas(this.colaboradores()));

  readonly temOutros = computed(() => this.colaboradores().some((c) => !c.empresa));

  readonly colaboradoresFiltrados = computed(() => {
    const q = this.busca().trim().toLowerCase();
    const empresa = this.empresaFiltro();
    const dept = this.departamentoFiltro();

    return this.colaboradores().filter((c) => {
      if (empresa === this.OUTROS_EMPRESA) {
        if (c.empresa) return false;
      } else if (empresa && c.empresa !== empresa) {
        return false;
      }
      if (dept && c.departamento !== dept) return false;
      if (!q) return true;
      const hay = [c.nome, c.cargo, c.departamento, c.email, c.ramal, c.celular, c.empresa]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  });

  ngOnInit(): void {
    this.document.body.classList.add('pagina-inicio');
    this.auth.carregarPerfil().subscribe();
    this.carregar();
    this.colaboradoresService.getDepartamentos().subscribe({
      next: (deps) => this.departamentos.set(deps),
      error: () => {},
    });
    this.menuService.getTopbarPublic().subscribe({
      next: (config) => {
        if (config.logos?.length) {
          this.logosPorEmpresa.set(buildLogoMapPorNome(config.logos));
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('pagina-inicio');
  }

  podeSincronizar(): boolean {
    return this.auth.hasModulo('colaboradores');
  }

  carregar(force = false): void {
    this.carregando.set(true);
    this.erro.set('');
    this.colaboradoresService.getDiretorio(force).subscribe({
      next: (res) => {
        this.colaboradores.set(res.colaboradores);
        this.sincronizadoEm.set(res.sincronizado_em);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar diretório.');
        this.carregando.set(false);
      },
    });
  }

  sincronizar(): void {
    this.sincronizando.set(true);
    this.colaboradoresService.sincronizar().subscribe({
      next: () => {
        this.toast.success('Diretório sincronizado.');
        this.carregar(true);
        this.sincronizando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.toast.error(err.error?.mensagem || 'Erro ao sincronizar.');
        this.sincronizando.set(false);
      },
    });
  }

  limparEmpresa(): void {
    this.empresaFiltro.set(null);
  }

  toggleEmpresa(empresa: string): void {
    this.empresaFiltro.update((atual) => (atual === empresa ? null : empresa));
  }

  toggleOutros(): void {
    this.empresaFiltro.update((atual) =>
      atual === this.OUTROS_EMPRESA ? null : this.OUTROS_EMPRESA
    );
  }

  logoUrlEmpresa(empresa: string): string | null {
    return resolveLogoUrlEmpresa(empresa, this.logosPorEmpresa());
  }

  readonly corMarcaEmpresa = corMarcaEmpresa;

  tempoDesdeSync(): string {
    const iso = this.sincronizadoEm();
    if (!iso) return 'nunca';
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'agora';
    if (min === 1) return '1 min';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return h === 1 ? '1 h' : `${h} h`;
  }

  async copiar(texto: string, label: string): Promise<void> {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      this.toast.success(`Copiado: ${texto}`);
    } catch {
      this.toast.error('Não foi possível copiar.');
    }
  }
}
