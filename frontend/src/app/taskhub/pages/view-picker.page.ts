import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CorpView, CORP_VIEWS, corpTeamLink, corpViewPath } from '../core/corp-views';
import { DataService } from '../core/data.service';
import { buildSectorNav, readKanbanTeam, readPainelLast } from '../core/sector-nav';
import { IconComponent } from '../shared/ui';

const VIEW_ORDER: CorpView[] = ['kanban', 'quadro', 'linha', 'painel'];
const DIRECT: CorpView[] = ['kanban', 'quadro'];

@Component({
  selector: 'app-view-picker',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="page vp-page">
      @if (!redirecting()) {
      <div class="page-head vp-head">
        <div class="vp-title">
          <span class="vp-title__ico"><app-icon [name]="meta().icon" [size]="20" /></span>
          <div>
            <h1>{{ meta().label }}</h1>
            <div class="sub">{{ meta().hint }}</div>
          </div>
        </div>
        <div class="actions">
          <label class="vp-search">
            <app-icon name="search" [size]="15" />
            <input type="search" placeholder="Buscar equipe ou setor" aria-label="Buscar equipe ou setor"
                   [value]="q()" (input)="q.set($any($event.target).value)" />
          </label>
        </div>
      </div>

      <nav class="vp-views" aria-label="Trocar visão">
        @for (v of views; track v) {
          <a [routerLink]="corpViewPath(v)" [class.on]="v === view()" [attr.aria-current]="v === view() ? 'page' : null">
            <app-icon [name]="CORP_VIEWS[v].icon" [size]="14" />{{ CORP_VIEWS[v].label }}
          </a>
        }
      </nav>

      @for (g of groups(); track g.id) {
        <section class="vp-sector">
          <header class="vp-sector__head">
            <span class="vp-sector__dot" [style.background]="g.color"></span>
            <h2>{{ g.name }}</h2>
            <span class="vp-sector__count">{{ g.teams.length }} {{ g.teams.length === 1 ? 'equipe' : 'equipes' }}</span>
            <span class="grow"></span>
            @if (view() === 'painel' && g.canDashboard) {
              <a class="btn btn-sm" [routerLink]="['/ti/taskhub/painel/setores', g.id]"><app-icon name="chart" [size]="14" />Painel do setor</a>
            }
          </header>
          <div class="vp-grid">
            @for (t of g.teams; track t.id) {
              <a class="vp-team" [routerLink]="corpTeamLink(view(), t.id)" [style.--vp-color]="t.color">
                <span class="vp-team__body">
                  <b class="ellipsis">{{ t.name }}</b>
                  <span class="vp-team__meta">
                    {{ t.projects_count || 0 }} {{ t.projects_count === 1 ? 'projeto' : 'projetos' }}
                    · {{ t.members_count || 0 }} {{ t.members_count === 1 ? 'pessoa' : 'pessoas' }}
                  </span>
                </span>
                <app-icon class="vp-team__go" name="chevron" [size]="16" />
              </a>
            } @empty {
              <div class="vp-none">Nenhuma equipe sua neste setor.</div>
            }
          </div>
        </section>
      } @empty {
        <div class="vp-empty">
          <app-icon [name]="q().trim() ? 'search' : 'people'" [size]="28" />
          @if (q().trim()) {
            <b>Nenhuma equipe encontrada</b>
            <span>Tente outro nome de equipe ou setor.</span>
          } @else {
            <b>Nenhuma equipe ainda</b>
            <span>Quando um gestor incluir você numa equipe, ela aparece aqui.</span>
          }
        </div>
      }
      }
    </div>
  `,
})
export class ViewPickerPage {
  view = input<CorpView>('kanban');
  private data = inject(DataService);
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly views = VIEW_ORDER;

  // Sem tela de escolha: abre a última equipe (ou painel) usada, ou a primeira disponível.
  constructor() {
    effect(() => {
      const dest = this.target();
      if (dest) void this.router.navigate(dest, { replaceUrl: true });
    });
  }
  private target = computed<string[] | null>(() => {
    const v = this.view();
    if (v === 'painel') {
      const sectors = this.all().filter(g => g.canDashboard);
      const teams = this.all().flatMap(g => g.teams).filter(t => t.can_dashboard);
      const last = readPainelLast();
      if (last?.kind === 'setor' && sectors.some(s => s.id === last.id)) return ['/ti/taskhub/painel/setores', String(last.id)];
      if (last?.kind === 'equipe' && teams.some(t => t.id === last.id)) return corpTeamLink('painel', last.id);
      if (sectors.length) return ['/ti/taskhub/painel/setores', String(sectors[0].id)];
      return teams.length ? corpTeamLink('painel', teams[0].id) : null;
    }
    if (!DIRECT.includes(v)) return null;
    const teams = this.all().flatMap(g => g.teams);
    if (!teams.length) return null;
    const last = readKanbanTeam();
    return corpTeamLink(v, teams.some(t => t.id === last) ? last! : teams[0].id);
  });
  readonly CORP_VIEWS = CORP_VIEWS;
  corpTeamLink = corpTeamLink;
  corpViewPath = corpViewPath;
  q = signal('');
  meta = computed(() => CORP_VIEWS[this.view()] || CORP_VIEWS.kanban);
  private all = computed(() => buildSectorNav(this.data, this.auth));
  redirecting = computed(() => this.target() !== null);
  groups = computed(() => {
    if (this.view() === 'painel') return [];
    const q = this.q().trim().toLocaleLowerCase('pt-BR');
    if (!q) return this.all();
    return this.all()
      .map(g => g.name.toLocaleLowerCase('pt-BR').includes(q)
        ? g
        : { ...g, teams: g.teams.filter(t => t.name.toLocaleLowerCase('pt-BR').includes(q)) })
      .filter(g => g.teams.length);
  });
}
