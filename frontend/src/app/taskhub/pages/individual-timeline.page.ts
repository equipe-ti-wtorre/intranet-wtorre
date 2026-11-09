import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { corpTeamLink } from '../core/corp-views';
import { DataService } from '../core/data.service';
import { buildSectorNav, saveKanbanTeam } from '../core/sector-nav';
import { IconComponent } from '../shared/ui';
import { ProjectTimelineComponent } from './project-timeline.component';

// Linha do tempo do Individual: o quadro pessoal e, em seguida, cada equipe.
@Component({
  selector: 'app-individual-timeline',
  standalone: true,
  imports: [RouterLink, IconComponent, ProjectTimelineComponent],
  template: `
    <div class="page works-page">
      <div class="page-head">
        <div>
          <h1>Linha do tempo</h1>
          <div class="sub">Seus projetos individuais e os das suas equipes</div>
        </div>
      </div>

      @if (boardId(); as id) {
        <section class="tla-team">
          <header class="tla-team__head">
            <h2>Individual</h2>
            <span class="tla-team__n">seus projetos</span>
          </header>
          <app-project-timeline [projectId]="id" />
        </section>
      } @else if (error()) {
        <div class="muted" style="padding: 40px 0">{{ error() }}</div>
      } @else {
        <div class="muted" style="padding: 40px 0">Carregando…</div>
      }

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
      }
    </div>
  `,
})
export class IndividualTimelinePage implements OnInit {
  data = inject(DataService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  corpTeamLink = corpTeamLink;
  boardId = signal<number | null>(null);
  error = signal('');
  teams = computed(() => buildSectorNav(this.data, this.auth).flatMap(g => g.teams));
  multiSector = computed(() => new Set(this.teams().map(t => t.sector_id)).size > 1);

  ngOnInit() {
    this.api.personalBoard().subscribe({
      next: r => this.boardId.set(r.project_id),
      error: () => this.error.set('Não foi possível abrir a linha do tempo individual.'),
    });
  }

  remember(id: number) { saveKanbanTeam(id); }
}
