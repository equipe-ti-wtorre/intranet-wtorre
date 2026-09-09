import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Colaborador } from '../../models/colaborador.model';
import { RamalAuthService } from '../../services/ramal-auth.service';
import { AlertasService } from '../../services/alertas.service';
import {
  corMarcaEmpresa,
  empresasDistintas,
  fallbackLogoMapPorNome,
  logoUrlEmpresa as resolveLogoUrlEmpresa,
} from '../../utils/empresa-classe.util';
import { corAvatarDeNome, iniciaisDeNome } from '../../utils/iniciais.util';

@Component({
  selector: 'app-ramal-lista',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ramal-lista.component.html',
  styleUrl: './ramal-lista.component.scss',
})
export class RamalListaComponent implements OnInit {
  private readonly api = inject(RamalAuthService);
  private readonly alertas = inject(AlertasService);

  readonly colaboradores = signal<Colaborador[]>([]);
  readonly sincronizadoEm = signal<string | null>(null);
  readonly departamentos = signal<string[]>([]);
  readonly busca = signal('');
  readonly empresaFiltro = signal<string | null>(null);
  readonly departamentoFiltro = signal('');
  readonly carregando = signal(false);
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

  readonly iniciais = iniciaisDeNome;
  readonly corAvatar = corAvatarDeNome;
  readonly corMarcaEmpresa = corMarcaEmpresa;

  metaLinha(c: Colaborador): string {
    return [c.departamento, c.empresa].filter((v): v is string => !!v).join(' · ');
  }

  ngOnInit(): void {
    this.carregar();
    this.api.getDepartamentos().subscribe({
      next: (deps) => this.departamentos.set(deps),
      error: () => {},
    });
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api.getDiretorio().subscribe({
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

  async copiar(texto: string | null | undefined): Promise<void> {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      this.alertas.sucesso(`Copiado: ${texto}`);
    } catch {
      this.alertas.erro('Não foi possível copiar.');
    }
  }
}
