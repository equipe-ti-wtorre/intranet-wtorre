import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { UiService } from '../core/ui.service';
import { Task, TeamDashboard } from '../core/models';
import { activityValue, minutesLabel, relativeTime } from '../core/format';
import { AvatarComponent, IconComponent, TaskRowComponent } from '../shared/ui';
import { TEAM_SLIDES, TeamSlideKey, buildTeamDeck, defaultTeamSlides } from '../presentation/team-deck';
import { DeckSlide } from '../presentation/day-deck';
import { DeckViewerComponent } from '../presentation/deck-viewer.component';
import { downloadDeckPptx } from '../presentation/deck-pptx';
import { DeckTheme, DeckThemePickerComponent, readDeckTheme } from '../presentation/deck-theme';
import { savePainelLast } from '../core/sector-nav';
import { TeamBarComponent } from '../shared/team-bar.component';

const KIND_LABEL = { team: 'Equipe', sector: 'Setor' } as const;
type DashKind = 'team' | 'sector';
type ProjectFilter = 'all' | 'done' | 'doing' | 'paused';
const PROJECT_STATUS_LABEL = { done: 'Concluído', paused: 'Em pausa', attention: 'Atenção', doing: 'Em andamento' } as const;

@Component({
  selector: 'app-team-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent, AvatarComponent, TaskRowComponent, DeckViewerComponent, TeamBarComponent, DeckThemePickerComponent],
  template: `
    @if (d(); as d) {
      <div class="page td-page" [class.td-page--sector]="kind() === 'sector'">
        <div class="page-head">
          <div>
            <div class="crumb">Painel › {{ d.team.name }}</div>
            @if (kind() === 'team') {
              <h1 class="td-title">
                <span class="td-dot" [style.background]="d.team.color"></span>
                {{ d.team.name }}
              </h1>
              @if (d.scope === 'mine') {
                <p class="muted">Equipe · Mostrando só os seus projetos e tarefas. · atualizado {{ relativeTime(d.generated_at) }}</p>
              } @else {
                <p class="muted">Equipe · {{ d.people.length }} {{ d.people.length === 1 ? 'pessoa' : 'pessoas' }} · atualizado {{ relativeTime(d.generated_at) }}</p>
              }
            } @else {
              <h1>Setor · {{ d.team.name }}</h1>
              <p class="sub">Projetos e trabalho das equipes do setor — atualizado {{ relativeTime(d.generated_at) }}. Clique em um cartão para filtrar os projetos.</p>
            }
          </div>
          <div class="actions">
            @if (kind() === 'team') {
              <button class="btn-action-primary btn-sm" (click)="openPresent()">Apresentar</button>
              <a class="btn-action-secondary btn-sm" [routerLink]="['/ti/taskhub/equipes']" [queryParams]="{ equipe: d.team.id }">Membros da equipe</a>
            }
            <button class="btn-action-secondary btn-sm" [disabled]="loading()" (click)="load()">{{ loading() ? 'Atualizando…' : 'Atualizar' }}</button>
          </div>
        </div>

        <app-team-bar view="painel" [current]="kind() === 'team' ? d.team.id : null" [currentSector]="kind() === 'sector' ? d.team.id : null" />

        @if (kind() === 'sector') {
          <div class="td-kpis">
            <button class="td-kpi" type="button" [class.td-kpi--on]="projectFilter() === 'all'" (click)="setProjectFilter('all')">
              <b>{{ d.project_kpis?.total || 0 }}</b>
              <span><span class="l">Total de projetos</span><small>em todas as equipes do setor</small></span>
            </button>
            <button class="td-kpi td-kpi--ok" type="button" [class.td-kpi--on]="projectFilter() === 'done'" (click)="setProjectFilter('done')">
              <b>{{ d.project_kpis?.done || 0 }}</b>
              <span><span class="l">Concluídos</span><small>{{ donePct() }}% do total</small></span>
            </button>
            <button class="td-kpi td-kpi--brand" type="button" [class.td-kpi--on]="projectFilter() === 'doing'" (click)="setProjectFilter('doing')">
              <b>{{ d.project_kpis?.doing || 0 }}</b>
              <span><span class="l">Em andamento</span>
                <small>{{ d.project_kpis?.attention || 0 }} com atenção</small></span>
            </button>
            <button class="td-kpi td-kpi--warn" type="button" [class.td-kpi--on]="projectFilter() === 'paused'" (click)="setProjectFilter('paused')">
              <b>{{ d.project_kpis?.paused || 0 }}</b>
              <span><span class="l">Em pausa</span><small>parados por decisão</small></span>
            </button>
          </div>
        } @else {
          <div class="td-kpis">
            <button class="td-kpi td-kpi--brand" type="button" (click)="goTasks({ status: 'open' })">
              <b>{{ d.kpis.open }}</b>
              <span><span class="l">Abertas</span>
                <small>{{ d.kpis.created_week }} {{ d.kpis.created_week === 1 ? 'criada' : 'criadas' }} nesta semana</small></span>
            </button>
            <button class="td-kpi td-kpi--brand" type="button" (click)="goTasks({ status: 'doing' })">
              <b>{{ d.kpis.doing }}</b>
              <span><span class="l">Em andamento</span><small>sendo feitas agora</small></span>
            </button>
            <button class="td-kpi" [class.td-kpi--bad]="d.kpis.overdue" type="button" (click)="goTasks({ status: 'open', due: 'overdue' })">
              <b>{{ d.kpis.overdue }}</b>
              <span><span class="l">Atrasadas</span><small>{{ d.kpis.overdue ? 'passaram do prazo' : 'tudo em dia' }}</small></span>
            </button>
            <button class="td-kpi" [class.td-kpi--warn]="d.kpis.blocked" type="button" (click)="goTasks({ status: 'blocked' })">
              <b>{{ d.kpis.blocked }}</b>
              <span><span class="l">Bloqueadas</span><small>{{ d.kpis.blocked ? 'precisam de ajuda' : 'nada travado' }}</small></span>
            </button>
            <button class="td-kpi td-kpi--brand" type="button" (click)="goTasks({ status: 'done' })">
              <b>{{ d.kpis.done_week }}</b>
              <span><span class="l">Concluídas na semana</span><small>semana passada: {{ d.kpis.done_prev_week }}</small></span>
            </button>
            <div class="td-kpi" [class.td-kpi--ok]="(onTimePct() ?? -1) >= 80" [class.td-kpi--warn]="(onTimePct() ?? 100) < 80">
              <b>{{ onTime() }}</b>
              <span><span class="l">Pontualidade</span>
                <small>{{ onTimePct() === null ? 'ainda sem entregas com prazo' : 'entregas com prazo em 30 dias' }}</small></span>
            </div>
          </div>
        }

        @if (kind() === 'sector') {
          <div class="td-card td-proj-wrap">
            <h2 class="td-card-title">Projetos por equipe</h2>
            <p class="muted">Todos os projetos · clique para abrir o projeto.</p>
            @if (filteredTeamProjects().length) {
              @for (g of filteredTeamProjects(); track g.id) {
                <div class="td-proj-team">
                  <div class="td-proj-team-h">
                    <span class="td-dot" [style.background]="g.color"></span>
                    <b>{{ g.name }}</b>
                    <span class="muted">{{ g.projects.length }} {{ g.projects.length === 1 ? 'projeto' : 'projetos' }}</span>
                  </div>
                  @for (p of g.projects; track p.id) {
                    <a class="td-proj" [routerLink]="['/ti/taskhub/equipes', p.team_id, 'projetos', p.id]">
                      <span class="td-dot" [style.background]="p.color"></span>
                      <span class="td-proj-name">{{ p.name }}</span>
                      <span class="td-badge" [class.td-badge--ok]="p.status === 'done'" [class.td-badge--warn]="p.status === 'attention'" [class.td-badge--pause]="p.status === 'paused'">{{ projectStatusLabel[p.status] }}</span>
                      <span class="td-proj-bar"><i [class.td-proj-bar--done]="p.status === 'done'" [class.td-proj-bar--attn]="p.status === 'attention'" [class.td-proj-bar--pause]="p.status === 'paused'" [style.width.%]="p.pct"></i></span>
                      <span class="td-proj-meta">
                        @if (p.status === 'done') { {{ p.pct }}% concluído }
                        @else if (p.due_date) { {{ p.pct }}% entrega {{ activityValue(p.due_date) }} }
                        @else { {{ p.pct }}% }
                      </span>
                      <span class="td-proj-owner">{{ p.owner_name || '—' }}</span>
                    </a>
                  }
                </div>
              }
            } @else {
              <div class="td-empty">Nenhum projeto neste setor.</div>
            }
          </div>
        }

        <div class="td-card td-people">
          @if (kind() === 'sector') {
            <h2 class="td-card-title">Pessoas</h2>
            <p class="muted">Carga = horas estimadas de tudo o que está a pessoa (compartilhado ou não) com prazo até 7 dias ou sem prazo, sobre uma semana de referência de 35 h. Os números da tabela mostram só o que foi compartilhado com você.</p>
          } @else {
            <div class="td-card-head">
              <h2 class="td-card-title">Pessoas</h2>
              <span class="td-count">{{ d.people.length }}</span>
            </div>
            <p class="muted">Carga da semana: tarefas abertas com prazo até sexta, ou sem prazo. 100% = 5 dias no ritmo de cada um.</p>
          }
          <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Abertas</th>
                @if (kind() === 'sector') {
                  <th>Em andamento</th>
                  <th>Bloqueadas</th>
                }
                <th>Atrasadas</th>
                <th>Concluídas 7 d</th>
                @if (kind() === 'sector') { <th>Para outros setores</th> }
                <th>Carga da semana</th>
              </tr>
            </thead>
            <tbody>
              @for (p of d.people; track p.id) {
                <tr class="click" (click)="goPerson(p.id)">
                  <td>
                    <div class="who">
                      <app-avatar [person]="p" />
                      <div>
                        @if (kind() === 'sector') {
                          <div>
                            {{ p.name }}
                            @if (p.is_manager) { <span class="td-badge">gestor</span> }
                            @if (p.away_until) { <span class="td-badge td-badge--warn">ausente</span> }
                          </div>
                        } @else {
                          <div>{{ p.name }}@if (p.is_manager) { <span class="td-badge">Gestor</span> }</div>
                          <div class="muted">{{ p.job_title || '—' }}@if (p.away_until) { · ausente }</div>
                        }
                      </div>
                    </div>
                  </td>
                  <td>{{ p.open }}</td>
                  @if (kind() === 'sector') {
                    <td>{{ p.doing }}</td>
                    <td [class.wk-late]="p.blocked">{{ p.blocked }}</td>
                  }
                  <td [class.wk-late]="p.overdue">{{ kind() === 'sector' ? p.overdue : (p.overdue || '—') }}</td>
                  <td>{{ p.done_7d }}</td>
                  @if (kind() === 'sector') { <td>{{ p.other_teams }}</td> }
                  <td>
                    <div class="td-load">
                      <span class="loadbar"><i [class.warn]="p.load_pct > 80" [class.over]="p.load_pct > 100" [style.width.%]="Math.min(p.load_pct, 100)"></i></span>
                      @if (kind() === 'sector') {
                        <span [class.wk-late]="p.load_pct > 100">{{ p.load_pct }}% · {{ minutesLabel(p.load_week_min) || '0 min' }}</span>
                      } @else {
                        <b [class.wk-late]="p.load_pct > 100">{{ p.load_pct }}%</b>
                        <span class="muted">{{ minutesLabel(p.load_week_min) }}</span>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>
        </div>

        <div class="td-grid">
          <div class="td-card">
            <div class="td-card-head">
              <h2 class="td-card-title">Atrasadas</h2>
              <span class="td-count" [class.td-count--bad]="d.overdue.length">{{ d.overdue.length }}</span>
              <span class="td-info" title="Passaram do prazo e continuam abertas."><app-icon name="info" [size]="14" /></span>
            </div>
            @for (t of d.overdue; track t.id) { <app-task-row [task]="t" (open)="openTask($event)" /> }
            @if (!d.overdue.length) { <div class="td-empty"><app-icon name="check" [size]="16" /> Nenhuma atrasada.</div> }
          </div>
          <div class="td-card">
            <div class="td-card-head">
              <h2 class="td-card-title">Bloqueadas</h2>
              <span class="td-count">{{ d.blocked.length }}</span>
              <span class="td-info" title="Travadas: alguém precisa desbloquear."><app-icon name="info" [size]="14" /></span>
            </div>
            @for (t of d.blocked; track t.id) { <app-task-row [task]="t" (open)="openTask($event)" /> }
            @if (!d.blocked.length) { <div class="td-empty"><app-icon name="check" [size]="16" /> Nada bloqueado.</div> }
          </div>
          <div class="td-card">
            <div class="td-card-head">
              <h2 class="td-card-title">Prazos da semana</h2>
              <span class="td-count">{{ d.due_soon.length }}</span>
              <span class="td-info" title="Vencem nos próximos 7 dias."><app-icon name="info" [size]="14" /></span>
            </div>
            @for (t of d.due_soon; track t.id) { <app-task-row [task]="t" (open)="openTask($event)" /> }
            @if (!d.due_soon.length) { <div class="td-empty"><app-icon name="check" [size]="16" /> Sem prazos na semana.</div> }
          </div>
          <div class="td-card">
            <div class="td-card-head">
              <h2 class="td-card-title">Para triagem</h2>
              <span class="td-count">{{ d.triage.length }}</span>
              <span class="td-info" title="Abertas sem prazo. Combinar uma data."><app-icon name="info" [size]="14" /></span>
            </div>
            @for (t of d.triage; track t.id) { <app-task-row [task]="t" (open)="openTask($event)" /> }
            @if (!d.triage.length) { <div class="td-empty"><app-icon name="check" [size]="16" /> Tudo com prazo.</div> }
          </div>
          @if (d.waiting_other.length) {
            <div class="td-card full">
              <div class="td-card-head">
                <h2 class="td-card-title">Aguardando outros setores</h2>
                <span class="td-count">{{ d.waiting_other.length }}</span>
                <span class="td-info" title="Etapa atual é de alguém de outro setor."><app-icon name="info" [size]="14" /></span>
              </div>
              @for (t of d.waiting_other; track t.id) {
                <app-task-row [task]="t" (open)="openTask($event)" />
                <p class="td-wait muted">espera {{ t.waiting_on.map(w => w.name).join(', ') }}</p>
              }
            </div>
          }
        </div>
      </div>
    } @else if (loading()) {
      <div class="empty"><p>Carregando o painel…</p></div>
    } @else if (denied(); as msg) {
      <div class="page">
        <div class="vp-empty">
          <app-icon name="chart" [size]="28" />
          <b>{{ msg }}</b>
          <span>O painel aparece para gestores e para quem recebe o acesso de ver o painel da equipe.</span>
          <a class="btn btn-sm" routerLink="/ti/taskhub/kanban" style="margin-top:8px">Voltar ao Corporativo</a>
        </div>
      </div>
    }

    @if (choosing()) {
      <div class="modal-scrim" (click)="choosing.set(false)">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Apresentar o painel">
          <div class="modal-head">Apresentar<div class="muted small" style="font-weight:500;margin-top:2px">{{ d()?.team?.name }} · escolha os slides e como apresentar</div></div>
          <div class="modal-body">
            <app-deck-theme-picker [value]="theme()" (valueChange)="theme.set($event)" />
                        <div class="row" style="justify-content: space-between">
              <span class="form-label">Slides ({{ picked().length }} de {{ slideOptions().length }})</span>
              <span class="row small"><button type="button" class="link-btn" (click)="picked.set(slideOptions().map(s => s.key))">Todos</button> · <button type="button" class="link-btn" (click)="picked.set([])">Nenhum</button></span>
            </div>
            <div class="pd-pick">
              @for (s of slideOptions(); track s.key) {
                <label class="check-label" style="align-items: flex-start">
                  <input type="checkbox" style="margin-top: 3px" [checked]="picked().includes(s.key)" (change)="togglePick(s.key)" />
                  <span>{{ s.label }}<br /><span class="muted small">{{ s.hint }}</span></span>
                </label>
              }
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn-action-secondary" [disabled]="!picked().length || exporting()" (click)="downloadPptx()">{{ exporting() ? 'Gerando…' : 'Baixar PowerPoint' }}</button>
            <button type="button" class="btn-action-primary" [disabled]="!picked().length" (click)="present()">Apresentar</button>
          </div>
        </div>
      </div>
    }
    @if (presenting() && deck().length) {
      <app-deck-viewer [slides]="deck()" [theme]="theme()" [footer]="'TaskHub · ' + (d()?.team?.name || '')" (close)="presenting.set(false)" />
    }
  `,
})
export class TeamDashboardPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  kind = input<DashKind>('team');
  d = signal<TeamDashboard | null>(null);
  loading = signal(false);
  denied = signal('');
  choosing = signal(false);
  presenting = signal(false);
  exporting = signal(false);
  deck = signal<DeckSlide[]>([]);
  theme = signal<DeckTheme>('nubank-parque');
  picked = signal<TeamSlideKey[]>([]);
  projectFilter = signal<ProjectFilter>('all');
  readonly Math = Math;
  readonly minutesLabel = minutesLabel;
  readonly relativeTime = relativeTime;
  readonly activityValue = activityValue;
  readonly projectStatusLabel = PROJECT_STATUS_LABEL;
  kindLabel = computed(() => KIND_LABEL[this.kind()]);
  slideOptions = computed(() => TEAM_SLIDES.filter(s => s.key !== 'equipes' || this.kind() === 'sector'));
  onTimePct = computed(() => {
    const k = this.d()?.kpis;
    if (!k || !Number(k.done_with_due_30d)) return null;
    return Math.round((Number(k.on_time_30d) / Number(k.done_with_due_30d)) * 100);
  });
  onTime = computed(() => {
    const p = this.onTimePct();
    return p == null ? '—' : `${p}%`;
  });
  donePct = computed(() => {
    const k = this.d()?.project_kpis;
    if (!k?.total) return 0;
    return Math.round((k.done / k.total) * 100);
  });
  filteredTeamProjects = computed(() => {
    const groups = this.d()?.team_projects || [];
    const f = this.projectFilter();
    if (f === 'all') return groups;
    return groups
      .map(g => ({ ...g, projects: g.projects.filter(p => f === 'doing' ? p.status === 'doing' || p.status === 'attention' : p.status === f) }))
      .filter(g => g.projects.length);
  });
  private sub?: Subscription;
  private lastId = 0;

  ngOnInit() {
    this.sub = this.route.paramMap.subscribe(p => {
      const id = Number(p.get('id') || p.get('teamId'));
      if (id && id !== this.lastId) { this.lastId = id; this.load(); }
    });
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  load() {
    const id = this.lastId || Number(this.route.snapshot.paramMap.get('id'));
    if (!id) return;
    this.loading.set(true);
    this.api.teamDashboard(id, this.kind()).subscribe({
      next: d => {
        this.d.set(d); this.denied.set(''); this.projectFilter.set('all'); this.loading.set(false);
        savePainelLast(this.kind() === 'sector' ? 'setor' : 'equipe', id);
      },
      error: e => {
        this.loading.set(false);
        if (e?.status === 403) { this.d.set(null); this.denied.set(errorMessage(e, 'Você não acompanha este painel.')); return; }
        this.toast.error(errorMessage(e, 'Não foi possível carregar o painel.'));
      },
    });
  }

  goTasks(q: Record<string, string>) {
    const d = this.d();
    if (!d) return;
    const scope = this.kind() === 'sector' ? { sector_id: String(d.team.id) } : { team_id: String(d.team.id) };
    void this.router.navigate(['/ti/taskhub/tarefas'], { queryParams: { v: 'filtro', ...scope, ...q } });
  }
  setProjectFilter(f: ProjectFilter) {
    this.projectFilter.set(this.projectFilter() === f && f !== 'all' ? 'all' : f);
  }
  goPerson(id: number) {
    void this.router.navigate(['/ti/taskhub/tarefas'], { queryParams: { v: 'pessoa', pessoa: id, status: 'open' } });
  }
  openTask(t: Task) { this.ui.openTask(t.id); }

  openPresent() {
    const d = this.d();
    if (!d) return;
    this.picked.set(defaultTeamSlides(d, this.kind() === 'sector'));
    this.theme.set(readDeckTheme(this.ui.palette()));
    this.choosing.set(true);
  }
  togglePick(k: TeamSlideKey) {
    this.picked.update(l => (l.includes(k) ? l.filter(x => x !== k) : [...l, k]));
  }
  private buildDeck() {
    const d = this.d();
    if (!d) return [];
    return buildTeamDeck(d, this.picked(), this.kindLabel(), d.team.name);
  }
  present() {
    this.deck.set(this.buildDeck());
    this.choosing.set(false);
    this.presenting.set(true);
  }
  async downloadPptx() {
    this.exporting.set(true);
    try {
      const name = this.d()?.team.name || 'painel';
      const file = `painel-${name.replace(/[^\wÀ-ÿ-]+/g, '-').replace(/^-|-$/g, '') || 'painel'}`;
      await downloadDeckPptx(this.buildDeck(), this.theme(), `TaskHub · ${name}`, file);
      this.toast.show('PowerPoint gerado. O arquivo foi baixado.');
      this.choosing.set(false);
    } catch {
      this.toast.error('Não foi possível gerar o PowerPoint.');
    } finally { this.exporting.set(false); }
  }
}
