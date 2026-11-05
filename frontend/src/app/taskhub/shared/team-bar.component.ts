import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CorpView, corpTeamLink, corpViewPath } from '../core/corp-views';
import { DataService } from '../core/data.service';
import { buildSectorNav, saveKanbanTeam, savePainelLast } from '../core/sector-nav';
import { IconComponent } from './ui';

@Component({
  selector: 'app-team-bar',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    @if (teams().length || sectors().length) {
      <div class="wk-teambar" role="group" [attr.aria-label]="isPainel() ? 'Painel' : 'Equipe'">
        <span class="wk-teambar__label">{{ isPainel() ? 'Painel' : 'Equipe' }}</span>
        <div class="wk-teambar__list">
          @if (showAll()) {
            <a [routerLink]="corpViewPath(view())" [class.on]="current() === null" [attr.aria-current]="current() === null ? 'page' : null">
              Todas
              <span class="wk-teambar__n">{{ total() }}</span>
            </a>
          }
          @for (s of sectors(); track s.id) {
            <a class="wk-teambar__sector-chip" [routerLink]="['/ti/taskhub/painel/setores', s.id]" [class.on]="s.id === currentSector()"
               [attr.aria-current]="s.id === currentSector() ? 'page' : null" (click)="rememberSector(s.id)">
              <app-icon name="chart" [size]="14" />
              Setor {{ s.name }}
              <span class="wk-teambar__n">{{ s.teams.length }}</span>
            </a>
          }
          @for (tm of teams(); track tm.id) {
            <a [routerLink]="corpTeamLink(view(), tm.id)" [class.on]="tm.id === current()" [attr.aria-current]="tm.id === current() ? 'page' : null" (click)="remember(tm.id)">
              <span class="wk-teambar__dot" [style.background]="tm.color"></span>
              @if (multiSector()) { <span class="wk-teambar__sector">{{ tm.sector_name }} ·</span> }
              {{ tm.name }}
              <span class="wk-teambar__n">{{ tm.projects_count || 0 }}</span>
            </a>
          }
        </div>
      </div>
    }
  `,
})
export class TeamBarComponent {
  view = input.required<CorpView>();
  current = input<number | null>(null);
  currentSector = input<number | null>(null);
  showAll = input(false);
  private data = inject(DataService);
  private auth = inject(AuthService);
  corpTeamLink = corpTeamLink;
  corpViewPath = corpViewPath;
  isPainel = computed(() => this.view() === 'painel');
  private groups = computed(() => buildSectorNav(this.data, this.auth));
  sectors = computed(() => (this.isPainel() ? this.groups().filter(g => g.canDashboard) : []));
  teams = computed(() => {
    const all = this.groups().flatMap(g => g.teams);
    return this.isPainel() ? all.filter(t => t.can_dashboard) : all;
  });
  multiSector = computed(() => new Set(this.teams().map(t => t.sector_id)).size > 1);
  total = computed(() => this.teams().reduce((n, t) => n + (t.projects_count || 0), 0));
  remember(id: number) {
    if (this.isPainel()) savePainelLast('equipe', id);
    else saveKanbanTeam(id);
  }
  rememberSector(id: number) { savePainelLast('setor', id); }
}
