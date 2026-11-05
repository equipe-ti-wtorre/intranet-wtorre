import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { corpTeamLink } from '../core/corp-views';
import { DataService } from '../core/data.service';
import { buildSectorNav, saveKanbanTeam } from '../core/sector-nav';
import { IconComponent } from '../shared/ui';
import { TeamBarComponent } from '../shared/team-bar.component';
import { ProjectTimelineComponent } from './project-timeline.component';

@Component({
  selector: 'app-timeline-all',
  standalone: true,
  imports: [RouterLink, IconComponent, TeamBarComponent, ProjectTimelineComponent],
  template: `
    <div class="page works-page">
      <div class="page-head">
        <div>
          <h1>Linha do tempo</h1>
          <div class="sub">Projetos de todas as suas equipes</div>
        </div>
      </div>

      <app-team-bar view="linha" [current]="null" [showAll]="true" />

      @for (tm of teams(); track tm.id) {
        <section class="tla-team" [class.tla-team--empty]="!tm.projects_count">
          <header class="tla-team__head">
            <span class="wk-teambar__dot" [style.background]="tm.color"></span>
            <h2>{{ tm.name }}</h2>
            @if (multiSector()) { <span class="muted small">{{ tm.sector_name }}</span> }
            <span class="tla-team__n">
              @if (tm.projects_count) { {{ tm.projects_count }} {{ tm.projects_count === 1 ? 'projeto' : 'projetos' }} }
              @else { ainda sem projetos }
            </span>
            <span class="grow"></span>
            <a class="btn btn-sm" [routerLink]="corpTeamLink('linha', tm.id)" (click)="remember(tm.id)">Abrir só esta equipe<app-icon name="chevron" [size]="14" /></a>
          </header>
          @if (tm.projects_count && tm.board_id) {
            <app-project-timeline [projectId]="tm.board_id" [board]="true" (changed)="data.reloadTeams()" />
          }
        </section>
      } @empty {
        <div class="vp-empty">
          <app-icon name="calendar" [size]="28" />
          <b>Nenhuma equipe ainda</b>
          <span>Quando um gestor incluir você numa equipe, a linha do tempo dela aparece aqui.</span>
        </div>
      }
    </div>
  `,
})
export class TimelineAllPage {
  data = inject(DataService);
  private auth = inject(AuthService);
  corpTeamLink = corpTeamLink;
  teams = computed(() => buildSectorNav(this.data, this.auth).flatMap(g => g.teams));
  multiSector = computed(() => new Set(this.teams().map(t => t.sector_id)).size > 1);
  remember(id: number) { saveKanbanTeam(id); }
}
