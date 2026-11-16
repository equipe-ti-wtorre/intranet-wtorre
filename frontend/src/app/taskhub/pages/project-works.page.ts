import { Component, ElementRef, HostListener, OnChanges, SimpleChanges, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { CORP_VIEWS, CorpView, PERSONAL_VIEWS, corpViewPath } from '../core/corp-views';
import { saveKanbanTeam } from '../core/sector-nav';
import { TeamBarComponent } from '../shared/team-bar.component';
import { DataService } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { UiService } from '../core/ui.service';
import { Person, Phase, PhaseScope, Project, SchedulePreview, Task, TaskFile, Team, Work, WorkPhaseLog } from '../core/models';
import { TASK_FILE_MAX, TASK_FILE_MAX_MB, dueLabel, fileSize, isExternalFileDrag, taskFileError, termsFor, todayIso } from '../core/format';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';
import { ProjectTimelineComponent } from './project-timeline.component';
import { businessSpan, DEFAULT_DURATION, endAfter, parseIso, sumPhaseDays } from '../core/timeline';
import { PhaseColumns } from '../shared/phase-columns';
import { ConfirmDeleteComponent } from '../shared/confirm-delete.component';
import { PhaseRescheduleComponent } from '../shared/phase-reschedule.component';
import { ScheduleImpactComponent, noneAccepted } from '../shared/schedule-impact.component';
import { PersonPickerComponent } from '../shared/person-picker.component';
import { confirmOpen, openWorkLines } from '../core/confirm-open';

const COLORS = ['#4c8dff', '#2fbf71', '#e11d48', '#f97316', '#a78bfa', '#14b8a6', '#c9a84c', '#ec4899'];
type Filter = 'todos' | 'responsavel' | 'participo' | 'atraso';
type Sort = 'prazo' | 'nome' | 'progresso';
type KanbanSort = 'manual' | Sort;

// Projeto → Trabalhos → Tarefas. Ao abrir o projeto aparecem os trabalhos em cartões.
@Component({
  selector: 'app-project-works',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, RouterLink, AutofocusDirective, AvatarComponent, IconComponent, ProjectTimelineComponent, ConfirmDeleteComponent, TeamBarComponent, PersonPickerComponent, PhaseRescheduleComponent, ScheduleImpactComponent],
  template: `
    <div class="page works-page">
      @if (project(); as p) {
        <div class="crumb">
          @if (personal() && locked(); as lv) {
            {{ PERSONAL_VIEWS[lv].label }} › Individual
          } @else if (locked(); as lv) {
            <a [routerLink]="corpViewPath(lv)">{{ CORP_VIEWS[lv].label }}</a>
            @if (team()?.sector_name || p.sector_name) { › {{ team()?.sector_name || p.sector_name }} }
            › {{ team()?.name || p.name }}
          } @else {
            @if (p.sector_name) { <span>{{ p.sector_name }}</span> › } @if (isBoard()) { Equipe › } {{ p.name }}
          }
        </div>
        <div class="page-head">
          <div class="grow">
            <div class="row" style="gap: 10px">
              <span class="wk-dot" [style.background]="p.color"></span>
              <h1>{{ personal() ? 'Individual' : p.name }}</h1>
              @if (!isBoard() && !personal()) { <span class="health" [class]="'health ' + p.health"><i></i>{{ healthLabel[p.health] }}</span> }
              @if (team()?.members?.length) {
                <span class="wk-avatars" [title]="memberNames()">@for (m of team()!.members!.slice(0, 6); track m.id) { <app-avatar [person]="m" /> }@if (team()!.members!.length > 6) { <span class="wk-more">+{{ team()!.members!.length - 6 }}</span> }</span>
              }
            </div>
            <div class="sub">
              {{ works().length }} {{ works().length === 1 ? t().one : t().many }}
              · {{ totals().done }} de {{ totals().total }} tarefas concluídas
              @if (totals().overdue) { · <span class="wk-late">{{ totals().overdue }} atrasadas</span> }
              @if (team(); as tm) { · {{ tm.members_count }} {{ tm.members_count === 1 ? 'pessoa' : 'pessoas' }} na equipe }
              @else if (p.owner_name && p.space === 'profissional') { · Gestor: {{ p.owner_name }} }
              @if (p.end_date && !isBoard() && !personal()) { · Entrega {{ due(p.end_date) }} }
            </div>
          </div>
          <div class="actions">
            @if (locked(); as lv) {
              @if (!teamMode() && !personal()) { <a class="btn btn-sm" [routerLink]="corpViewPath(lv)">Trocar equipe</a> }
            }
            @if (view() === 'kanban') {
              <button type="button" class="btn btn-sm" (click)="present()" title="Mostrar o Kanban em tela cheia"><app-icon name="board" [size]="14" />Apresentar</button>
            }
            @if (team(); as tm) {
              @if (!locked()) {
                @if (tm.can_panel) { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/painel/equipes', tm.id]"><app-icon name="chart" [size]="14" />Painel</a> }
              }
              <a class="btn btn-sm" routerLink="/ti/taskhub/equipes" [queryParams]="{ equipe: tm.id }">Configurações da equipe</a>
            } @else if (p.my_role === 'manage' && !personal()) { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/projetos', p.id, 'configuracoes']">Configurações</a> }
            @if (canCreate()) { <button class="btn btn-primary btn-sm" (click)="openNew()"><app-icon name="plus" [size]="14" />{{ t().novo }}</button> }
          </div>
        </div>
        @if (p.description && !isBoard() && !personal()) { <p class="muted" style="max-width: 760px; margin: -6px 0 14px; white-space: pre-wrap">{{ p.description }}</p> }

        @if (!locked()) {
          <div class="tl-tabs" role="tablist" aria-label="Visão do projeto">
            <button type="button" role="tab" [class.on]="view() === 'kanban'" [attr.aria-selected]="view() === 'kanban'" (click)="setView(null)"><app-icon name="board" [size]="14" />Kanban</button>
            <button type="button" role="tab" [class.on]="view() === 'cards'" [attr.aria-selected]="view() === 'cards'" (click)="setView('cards')"><app-icon name="folder" [size]="14" />{{ t().Many }}</button>
            <button type="button" role="tab" [class.on]="view() === 'linha'" [attr.aria-selected]="view() === 'linha'" (click)="setView('linha')"><app-icon name="calendar" [size]="14" />Linha do tempo</button>
          </div>
        }

        @if (locked(); as lv) {
          @if (teamMode()) { <app-team-bar [view]="lv" [current]="currentTeamId()" [showAll]="lv === 'linha'" /> }
        }
        @if (view() === 'linha') {
          <app-project-timeline [projectId]="p.id" [board]="isBoard()" (changed)="load(); data.reloadProjects()" />
        } @else {
        <div class="wk-toolbar">
          <input class="input" style="width: 240px; height: 36px" [placeholder]="'Buscar ' + t().one + ' ou #id'" [ngModel]="queryText" (ngModelChange)="search($event)" [attr.aria-label]="'Buscar ' + t().one" />
          <div class="wk-filter">
            <button type="button" class="btn btn-sm wk-filter-btn" [class.on]="filtersOpen()" [attr.aria-expanded]="filtersOpen()" (click)="filtersOpen.set(!filtersOpen())">
              <app-icon name="list" [size]="14" />Filtros
              @if (activeFilters()) { <span class="wk-filter-btn__n">{{ activeFilters() }}</span> }
              <app-icon class="wk-filter-btn__caret" [class.open]="filtersOpen()" name="chevron" [size]="12" />
            </button>
            @if (filtersOpen()) {
              <div class="wk-filter-scrim" (click)="filtersOpen.set(false)"></div>
              <div class="wk-filter-panel" role="dialog" aria-label="Filtros e ordenação">
                <div class="wk-filter-panel__col">
                  <div class="wk-filter-panel__title">Mostrar</div>
                  @for (f of filters(); track f.key) {
                    <button type="button" class="wk-filter-opt" [class.on]="filter() === f.key" (click)="filter.set(f.key)">
                      <span class="wk-filter-opt__radio"></span>{{ f.label }}<span class="wk-filter-opt__n">{{ countOf(f.key) }}</span>
                    </button>
                  }
                </div>
                @if (phases().length) {
                  <div class="wk-filter-panel__col">
                    <div class="wk-filter-panel__title">Fase</div>
                    <button type="button" class="wk-filter-opt" [class.on]="phaseFilter() === null" (click)="phaseFilter.set(null)">
                      <span class="wk-filter-opt__radio"></span>Todas
                    </button>
                    @for (ph of phases(); track ph.id) {
                      <button type="button" class="wk-filter-opt" [class.on]="phaseFilter() === ph.id" (click)="phaseFilter.set(ph.id)">
                        <span class="wk-filter-opt__radio"></span><span class="wk-filter-opt__dot" [style.background]="ph.color"></span>{{ ph.name }}
                      </button>
                    }
                  </div>
                }
                <div class="wk-filter-panel__col">
                  <div class="wk-filter-panel__title">Ordenar</div>
                  @for (s of kanbanSorts; track s.key) {
                    <button type="button" class="wk-filter-opt" [class.on]="kanbanSort() === s.key" (click)="kanbanSort.set(s.key)">
                      <span class="wk-filter-opt__radio"></span>{{ s.label }}
                    </button>
                  }
                </div>
                <div class="wk-filter-panel__foot">
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="!activeFilters()" (click)="clearFilters()">Limpar</button>
                  <button type="button" class="btn btn-sm" (click)="filtersOpen.set(false)">Fechar</button>
                </div>
              </div>
            }
          </div>
        </div>

        @if (view() === 'kanban') {
          <div #kanban class="wk-kanban" [class.wk-kanban--present]="presenting()">
            @if (presenting()) {
              <div class="wk-present-head">
                <span class="wk-dot" [style.background]="p.color"></span>
                <h2>{{ personal() ? 'Individual' : p.name }}</h2>
                <span class="muted">{{ works().length }} {{ works().length === 1 ? t().one : t().many }} · {{ totals().done }} de {{ totals().total }} tarefas concluídas</span>
                <span class="grow"></span>
                <button type="button" class="btn btn-sm" (click)="stopPresent()">Sair da apresentação</button>
              </div>
            }
            <div class="wk-kanban__cols">
              @for (col of columns(); track col.phase.id; let ci = $index; let lastCol = $last) {
                <section class="wk-col" [class.drop]="dropPhase() === col.phase.id"
                         (dragover)="dragOver($event, col.phase.id)" (dragleave)="dropPhase.set(null)" (drop)="dropOn($event, col.phase, null)">
                  <header class="wk-col__head" [class.open]="cols.colMenu() === col.phase.id">
                    <span class="wk-col__dot" [style.background]="col.phase.color"></span>
                    @if (cols.renaming() === col.phase.id) {
                      <input class="inline grow" appAutofocus maxlength="60" [ngModel]="col.phase.name" aria-label="Nome da fase"
                             (blur)="cols.finishRename(col.phase, $any($event.target).value)" (keydown.enter)="$any($event.target).blur()"
                             (keydown.escape)="cols.renaming.set(null)" />
                    } @else if (editCols()) {
                      <button type="button" class="wk-col__name bcol-name" (click)="cols.startRename(col.phase)" title="Renomear fase">{{ col.phase.name }}</button>
                    } @else {
                      <span class="wk-col__name">{{ col.phase.name }}</span>
                    }
                    <span class="wk-col__dur" [title]="'Previsto: ' + (col.phase.duration_days ?? 0) + ' dias úteis'">{{ col.phase.duration_days ?? 0 }} d</span>
                    <span class="wk-col__n">{{ col.works.length }}</span>
                    @if (editCols()) {
                      <button type="button" class="bcol-more" (click)="cols.toggleMenu(col.phase.id, $event)" aria-label="Opções da fase"><app-icon name="more" [size]="16" /></button>
                      @if (cols.colMenu() === col.phase.id) {
                        <div class="bcol-menu" [style.top.px]="cols.menuPos()?.top" [style.left.px]="cols.menuPos()?.left" (click)="$event.stopPropagation()">
                          <button type="button" (click)="cols.startRename(col.phase)"><app-icon name="pencil" [size]="14" /> Renomear</button>
                          <div class="bcol-swatches">
                            @for (c of cols.colors; track c) {
                              <button type="button" [style.background]="c" [class.on]="col.phase.color.toLowerCase() === c" (click)="cols.paint(col.phase, c)" [attr.aria-label]="'Cor ' + c"></button>
                            }
                          </div>
                          <label class="bcol-menu-field">Dias úteis previstos
                            <input class="input" type="number" min="0" max="365" [ngModel]="col.phase.duration_days ?? 0"
                                   (click)="$event.stopPropagation()" (keydown.enter)="cols.setDuration(col.phase, $any($event.target).value); $event.preventDefault()"
                                   (blur)="cols.setDuration(col.phase, $any($event.target).value)" [attr.aria-label]="'Dias previstos de ' + col.phase.name" />
                          </label>
                          <button type="button" [disabled]="ci === 0" (click)="cols.move(col.phase, -1)"><app-icon name="back" [size]="14" /> Mover para a esquerda</button>
                          <button type="button" [disabled]="lastCol" (click)="cols.move(col.phase, 1)"><app-icon name="arrow" [size]="14" /> Mover para a direita</button>
                          <button type="button" class="danger" [disabled]="phases().length === 1" (click)="cols.remove(col.phase)"><app-icon name="trash" [size]="14" /> Excluir fase</button>
                          <div class="wk-col__hint">{{ isBoard() ? 'Vale para todos os projetos da equipe.' : 'Vale só para este quadro.' }}</div>
                        </div>
                      }
                    }
                  </header>
                  <div class="wk-col__body">
                    @for (w of col.works; track w.id) {
                      <div class="wk-kcard" [attr.draggable]="canMove(w) && !presenting()" [class.dragging]="dragId() === w.id" [class.movable]="canMove(w) && !presenting()"
                           (dragstart)="dragStart($event, w)" (dragend)="dragId.set(null); dropPhase.set(null)" (click)="openWork($event, w)"
                           (dragover)="dragOver($event, col.phase.id)" (drop)="dropOn($event, col.phase, w); $event.stopPropagation()">
                        <ng-container *ngTemplateOutlet="card; context: { $implicit: w }" />
                      </div>
                    } @empty {
                      @if (!canCreate() || presenting()) { <div class="wk-col__empty">Nenhum {{ t().one }} nesta fase</div> }
                    }
                    @if (canCreate() && !presenting()) {
                      <button type="button" class="wk-col__add" (click)="openNew(col.phase.id)">+ Adicionar</button>
                    }
                  </div>
                </section>
              }
              @if (editCols()) {
                <button type="button" class="bcol-new wk-col-new" (click)="cols.add()">+ Nova coluna</button>
              }
            </div>
            @if (cols.colMenu() !== null) { <div class="bcol-menu-scrim" (click)="cols.closeMenu()"></div> }
          </div>
        } @else {
          <div class="wk-table-card">
            <div class="table-scroll">
              <table class="table wk-table">
                <thead>
                  <tr>
                    <th class="wk-table__name"><button type="button" class="wk-th-sort" (click)="sortHead('nome')">Projeto{{ sortMark('nome') }}</button></th>
                    <th>Status</th>
                    <th><button type="button" class="wk-th-sort" (click)="sortHead('progresso')">Andamento{{ sortMark('progresso') }}</button></th>
                    <th>Prazo</th>
                    <th>Início</th>
                    <th><button type="button" class="wk-th-sort" (click)="sortHead('prazo')">Previsão de entrega{{ sortMark('prazo') }}</button></th>
                    <th>Solicitante</th>
                    <th>Departamento</th>
                  </tr>
                </thead>
                <tbody>
                  @for (w of tableRows(); track w.id) {
                    <tr class="click" tabindex="0" (click)="openDetail(w)" (keydown.enter)="openDetail(w)">
                      <td class="wk-table__name">
                        <div class="wk-table__proj">
                          <span class="wk-table__sq" [style.background]="w.color"></span>
                          <span class="wk-table__txt">
                            <b class="ellipsis"><span class="wk-id">#{{ w.id }}</span>{{ w.name }}</b>
                            <span class="muted small ellipsis">{{ w.owners[0]?.name || w.owner_name || 'Sem responsável' }}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        @if (w.completed_at) { <span class="wk-badge wk-badge--ok">Concluído</span> }
                        @else if (w.phase_name) { <span class="wk-badge" [style.--wk-badge]="w.phase_color">{{ w.phase_name }}</span> }
                        @else { <span class="muted">—</span> }
                      </td>
                      <td>
                        <div class="wk-table__pct">
                          <span class="wk-bar"><span [style.width.%]="pct(w)" [class.wk-bar--late]="w.tasks_overdue && !w.completed_at" [class.wk-bar--done]="!!w.completed_at"></span></span>
                          <b>{{ pct(w) }}%</b>
                        </div>
                      </td>
                      <td><span class="wk-dl" [class]="'wk-dl wk-dl--' + deadlineState(w).tone">{{ deadlineState(w).label }}</span></td>
                      <td class="wk-table__date">{{ fmtDate(w.start_date) }}</td>
                      <td class="wk-table__date">{{ fmtDate(w.due_date) }}</td>
                      <td>
                        @if (w.members[0]; as m) {
                          <span class="wk-table__person"><app-avatar [person]="m" /><span class="ellipsis">{{ m.name }}</span>
                            @if (w.members.length > 1) { <span class="muted small" [title]="namesOf(w.members)">+{{ w.members.length - 1 }}</span> }</span>
                        } @else { <span class="muted">—</span> }
                      </td>
                      <td>
                        @if (departments(w); as deps) {
                          @if (deps.length) {
                            <span class="ellipsis" [title]="deps.join(', ')">{{ deps[0] }}</span>
                            @if (deps.length > 1) { <span class="muted small"> +{{ deps.length - 1 }}</span> }
                          } @else { <span class="muted">—</span> }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (!tableRows().length) {
              <div class="wk-table__empty">
                @if (works().length) { Nenhum {{ t().one }} com esses filtros. }
                @else if (isBoard() && !seesAll()) { Você ainda não participa de nenhum {{ t().one }} desta equipe. }
                @else { {{ isBoard() ? 'Esta equipe ainda não tem' : 'Ainda não há' }} {{ t().many }}. }
                @if (canCreate()) { <button type="button" class="btn btn-sm" (click)="openNew()">+ {{ t().novo }}</button> }
              </div>
            }
          </div>
        }
        }
      } @else if (error()) {
        <div class="muted" style="padding: 40px 0">{{ error() }}</div>
      } @else {
        <div class="muted" style="padding: 40px 0">Carregando…</div>
      }
    </div>

    <ng-template #card let-w>
      <div class="wk-card" [class.wk-card--done]="!!w.completed_at">
        <div class="row" style="gap: 10px">
          <span class="wk-ic" [style.background]="w.completed_at ? 'var(--text-subtle)' : w.color">{{ initials(w.name) }}</span>
          <div style="min-width: 0; flex: 1">
            <a class="wk-name" [routerLink]="workLink(w)"><span class="wk-id">#{{ w.id }}</span>{{ w.name }}</a>
            <div class="wk-meta">{{ w.description || 'Sem descrição' }}</div>
            @if (w.continues?.length || w.continued_by?.length) {
              <div class="wk-meta">@if (w.continues?.length) { Continua de {{ namesOf(w.continues) }} }@if (w.continues?.length && w.continued_by?.length) { · }@if (w.continued_by?.length) { Nova versão: {{ namesOf(w.continued_by) }} }</div>
            }
          </div>
          @if (w.my_role === 'manage') {
            <div class="wk-actions">
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="openEdit(w)" [attr.aria-label]="'Editar ' + t().one" [title]="'Editar ' + t().one"><app-icon name="gear" [size]="14" /></button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="toggleDone(w)" [attr.aria-label]="w.completed_at ? 'Reabrir ' + t().one : 'Marcar como concluído'" [title]="w.completed_at ? 'Reabrir ' + t().one : 'Marcar como concluído'"><app-icon name="check" [size]="14" /></button>
              @if (!w.completed_at) {
                @if (w.pause_start) {
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="resume(w)" [attr.aria-label]="'Retomar ' + t().one" [title]="'Retomar ' + t().one"><app-icon name="play" [size]="14" /></button>
                } @else {
                  <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="startPause(w)" [attr.aria-label]="'Pausar ' + t().one" [title]="'Pausar ' + t().one"><app-icon name="pause" [size]="14" /></button>
                }
              }
              @if (canCreate()) {
                <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="deleting.set(w)" [attr.aria-label]="'Excluir ' + t().one" [title]="'Excluir ' + t().one"><app-icon name="trash" [size]="14" /></button>
              }
            </div>
          }
        </div>
        @if (w.my_role !== 'follow') {
        <div>
          <div class="row wk-progress-head">
            <span>{{ w.tasks_done }} de {{ w.tasks_total }} {{ w.tasks_total === 1 ? 'tarefa' : 'tarefas' }}</span>
            @if (w.completed_at) { <span class="wk-ok">concluído {{ due(w.completed_at.slice(0, 10)) }}</span> }
            @else if (w.tasks_overdue) { <span class="wk-late">{{ w.tasks_overdue }} {{ w.tasks_overdue === 1 ? 'atrasada' : 'atrasadas' }}</span> }
            @else if (w.tasks_blocked) { <span class="wk-warn">{{ w.tasks_blocked }} {{ w.tasks_blocked === 1 ? 'bloqueada' : 'bloqueadas' }}</span> }
            @else if (w.due_date) { <span class="muted">previsão {{ due(w.due_date) }}</span> }
          </div>
          <div class="wk-bar"><span [style.width.%]="pct(w)" [class.wk-bar--late]="w.tasks_overdue && !w.completed_at" [class.wk-bar--done]="!!w.completed_at"></span></div>
        </div>
        } @else {
          <div class="row wk-progress-head"><span class="muted">Você acompanha como solicitante</span>
            @if (w.completed_at) { <span class="wk-ok">concluído {{ due(w.completed_at.slice(0, 10)) }}</span> }
          </div>
        }
        <div class="row wk-foot">
          @if (pausedNow(w)) { <span class="wk-pause" [title]="pauseTitle(w)">{{ openPause(w) ? 'Em pausa' : 'Em pausa até ' + dmShort(w.pause_end!) }}</span> }
          @else if (!w.completed_at && w.pause_start) { <span class="wk-pause" [title]="pauseTitle(w)">Pausa a partir de {{ dmShort(w.pause_start) }}</span> }
          @if (view() !== 'kanban' && w.phase_name) {
            <span class="phase-chip" [style.--phase]="w.phase_color">{{ w.phase_name }}</span>
          }
          @if (w.owners?.length) {
            <span class="row" style="gap: 6px" [title]="'Responsáveis: ' + ownerNames(w)"><span class="wk-avatars">@for (o of w.owners.slice(0, 3); track o.id) { <app-avatar [person]="o" /> }</span>{{ w.owners[0].name.split(' ')[0] }}@if (w.owners.length > 1) { <span class="muted"> +{{ w.owners.length - 1 }}</span> }@if (w.due_date && (w.tasks_overdue || w.tasks_blocked)) { <span class="muted"> · previsão {{ due(w.due_date) }}</span> }</span>
          } @else if (w.owner_name) {
            <span class="row" style="gap: 6px"><app-avatar [person]="{ name: w.owner_name, initials: w.owner_initials || '', color: w.owner_color || '' }" />{{ w.owner_name.split(' ')[0] }}@if (w.due_date && (w.tasks_overdue || w.tasks_blocked)) { <span class="muted"> · previsão {{ due(w.due_date) }}</span> }</span>
          }
          <span class="grow"></span>
          <span class="wk-avatars">@for (m of w.members.slice(0, 3); track m.id) { <app-avatar [person]="m" /> }@if (w.members.length > 3) { <span class="wk-more">+{{ w.members.length - 3 }}</span> }</span>
        </div>
      </div>
    </ng-template>

    @if (form) {
      <div class="modal-scrim" (click)="dismissForm()">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" [attr.aria-label]="form.id ? 'Editar ' + t().one : t().novo">
          <div class="modal-head">{{ form.id ? 'Editar ' + t().one : t().novo }}
            @if (!form.id && formPhase(); as fp) { <span class="phase-chip" style="margin-left: 8px" [style.--phase]="fp.color">{{ fp.name }}</span> }
          </div>
          <div class="modal-body">
            <div class="field"><label for="wk-n">Nome</label><input id="wk-n" class="input" appAutofocus [(ngModel)]="form.name" placeholder="Ex.: Customização Fiscal" /></div>
            <div class="field"><label for="wk-d">Descrição/Escopo</label>
              <textarea id="wk-d" class="textarea" style="min-height: 80px" [(ngModel)]="form.description" placeholder="O que será entregue e o que fica de fora"></textarea></div>
            <div class="field">
              <span class="label">Anexos</span>
              <div class="qa-files" [class.file-over]="fileOver()"
                   (dragenter)="fileEnter($event)" (dragover)="fileHover($event)" (dragleave)="fileLeave($event)" (drop)="fileDrop($event)">
                @if (form.id) {
                  @if (formFilesLoading()) { <div class="muted small">Carregando anexos…</div> }
                  @for (f of formFiles(); track f.id) {
                    <span class="qa-file-chip">
                      <app-icon name="paperclip" [size]="13" />
                      <button type="button" class="qa-file-name" (click)="downloadWorkFile(form.id, f)" [title]="'Baixar ' + f.name">{{ f.name }}</button>
                      <span class="muted small">{{ fileSize(f.size_bytes) }}</span>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="removeWorkFile(form.id, f)" [attr.aria-label]="'Remover ' + f.name"><app-icon name="x" [size]="12" /></button>
                    </span>
                  }
                } @else {
                  @for (f of pendingFiles(); track $index) {
                    <span class="qa-file-chip">
                      <app-icon name="paperclip" [size]="13" />
                      <span class="qa-file-name" [title]="f.name">{{ f.name }}</span>
                      <span class="muted small">{{ fileSize(f.size) }}</span>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="removePending($index)" [attr.aria-label]="'Remover ' + f.name"><app-icon name="x" [size]="12" /></button>
                    </span>
                  }
                }
                @if ((form.id ? formFiles().length : pendingFiles().length) < fileMax) {
                  <label class="btn btn-ghost btn-sm qa-file-add">
                    <app-icon name="paperclip" [size]="14" />
                    {{ uploadingFiles() ? 'Enviando…' : 'Anexar arquivos' }}
                    <input type="file" multiple hidden [disabled]="uploadingFiles()" (change)="pickFiles($event)" />
                  </label>
                }
              </div>
              <span class="hint">Qualquer tipo de arquivo. Até {{ fileMax }} arquivos, {{ fileMaxMb }} MB cada. Arraste para a área acima.</span>
            </div>
            <div class="field">
              <label>Responsáveis</label>
              <div class="row" style="flex-wrap: wrap; gap: 6px">
                @for (m of chosenOwners(); track m.id) {
                  <span class="pill"><app-avatar [person]="m" />{{ m.name }}<button type="button" (click)="toggleOwner(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button></span>
                }
              </div>
              <app-person-picker [people]="ownerCandidates()" placeholder="Adicionar responsável…" (picked)="toggleOwner($event ?? 0)" />
              @if (!ownerIds().length) { <span class="hint" style="color: var(--danger)">Escolha pelo menos um responsável.</span> }
              @else { <span class="hint">Quem responde pelo {{ t().one }}. Todos os responsáveis podem editar e mover o {{ t().one }}.</span> }
            </div>
            <ng-container [ngTemplateOutlet]="membersField" />
            <div class="field">
                <label for="wk-dep">Departamento</label>
                <input id="wk-dep" class="input" list="wk-dep-list" maxlength="200" autocomplete="off" [ngModel]="form.department" (ngModelChange)="form.department = $event; deptAuto = false" placeholder="Área que pediu o projeto" />
                <datalist id="wk-dep-list">@for (d of departmentOptions(); track d) { <option [value]="d"></option> }</datalist>
                <span class="hint">Aparece na coluna Departamento de Projetos. Segue o primeiro solicitante até você digitar outro.</span>
            </div>
            <div class="fields">
              <div class="field"><label for="wk-s">Data inicial</label><input id="wk-s" type="date" class="input" [ngModel]="form.start_date" (ngModelChange)="onStart($event)" /></div>
              <div class="field"><label for="wk-p">Previsão de entrega</label><input id="wk-p" type="date" class="input" [min]="form.start_date || ''" [ngModel]="form.due_date" (ngModelChange)="onDue($event)" /></div>
            </div>
            @if (spanError()) { <span class="hint" style="margin-top: -6px; color: var(--danger)">A previsão de entrega deve ser igual ou depois da data inicial.</span> }
            @else if (form.start_date && form.due_date) { <span class="hint" style="margin-top: -6px">{{ span() }} {{ span() === 1 ? 'dia útil' : 'dias úteis' }} na linha do tempo. Pessoas diferentes andam em paralelo; o mesmo responsável faz um por vez e a fila dele é reajustada.</span> }
            @else if (form.start_date && phaseDays()) { <span class="hint" style="margin-top: -6px">Roteiro {{ isBoard() ? 'da equipe' : 'do projeto' }}: {{ phaseDays() }} {{ phaseDays() === 1 ? 'dia útil' : 'dias úteis' }}. O prazo é preenchido sozinho.</span> }
            @if (needsReason()) {
              <div class="field">
                <label for="wk-reason">Motivo da alteração das datas <span class="wk-late">*</span></label>
                <textarea id="wk-reason" class="textarea" rows="2" maxlength="500" [(ngModel)]="dateReason" placeholder="Ex.: cliente pediu para adiar a entrega"></textarea>
                @if (dateReason.trim().length < 10) { <span class="hint" style="color: var(--danger)">Informe o motivo (pelo menos 10 letras). Ele fica no histórico de datas e as novas datas viram o planejado.</span> }
                @else { <span class="hint">Fica no histórico de datas. As novas datas viram o planejado.</span> }
              </div>
            }
            <app-schedule-impact [impact]="impact()" [many]="t().many" (toggle)="toggleAdjust($event)" (useSuggested)="applySuggested()" />
            <ng-template #membersField>
            <div class="field">
              <label>Solicitantes</label>
              <div class="row" style="flex-wrap: wrap; gap: 6px">
                @for (m of chosen(); track m.id) {
                  <span class="pill"><app-avatar [person]="m" />{{ m.name }}<button type="button" (click)="toggleMember(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button></span>
                }
              </div>
              <app-person-picker [people]="candidates()"  placeholder="Adicionar solicitante…" (picked)="toggleMember($event ?? 0)" />
              <span class="hint">Quem pediu o projeto, de qualquer área. Só acompanha: vê a fase e o histórico e é avisado a cada mudança de fase, sem ver as tarefas.</span>
            </div>
            </ng-template>
            <div class="field">
                <label>Continua de</label>
                <div class="row" style="flex-wrap: wrap; gap: 6px">
                  @for (rel of chosenLinks(); track rel.id) {
                    <span class="pill">{{ rel.name }}<button type="button" (click)="toggleLink(rel.id)" [attr.aria-label]="'Desvincular ' + rel.name"><app-icon name="x" [size]="12" /></button></span>
                  }
                </div>
                <select #lk class="select" (change)="toggleLink(+lk.value); lk.value = ''" aria-label="Relacionar com um projeto">
                  <option value="">Relacionar com um projeto…</option>
                  @for (rel of linkCandidates(); track rel.id) { <option [value]="rel.id">{{ rel.name }}</option> }
                </select>
                <span class="hint">Se for uma nova versão de outro projeto {{ isBoard() ? 'da equipe' : 'deste quadro' }}, escolha qual. Pode marcar mais de um.</span>
            </div>
            <div class="field"><label>Cor</label>
              <div class="row">@for (c of colors; track c) {
                <button type="button" class="wk-color" [style.background]="c" [class.on]="form.color === c" (click)="form.color = c" [attr.aria-label]="'Cor ' + c"></button>
              }</div></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="cancelForm()">Cancelar</button>
            @if (impact()?.conflicts?.length) {
              <button class="btn btn-sm" [disabled]="saving()" (click)="applySuggested()">Usar data sugerida</button>
              <button class="btn btn-primary" [disabled]="!form.name.trim() || !ownerIds().length || saving() || spanError() || reasonMissing()" (click)="save(true)">{{ noneAccepted(impact()) ? 'Salvar (ficam juntos)' : 'Salvar e reajustar' }}</button>
            } @else {
              <button class="btn btn-primary" [disabled]="!form.name.trim() || !ownerIds().length || saving() || spanError() || reasonMissing()" (click)="save()">Salvar</button>
            }
          </div>
        </div>
      </div>
    }

    @if (pausing(); as w) {
      <div class="modal-scrim" (click)="pausing.set(null)">
        <div class="modal" style="max-width: 460px" (click)="$event.stopPropagation()" role="dialog" [attr.aria-label]="'Pausar ' + t().one">
          <div class="modal-head">Pausar {{ t().one }}</div>
          <div class="modal-body">
            <p class="muted small" style="margin: 0 0 12px"><span class="wk-id">#{{ w.id }}</span>{{ w.name }}</p>
            <div class="fields">
              <div class="field"><label for="pz-s">Início da pausa</label><input id="pz-s" type="date" class="input" [min]="today" [(ngModel)]="pauseForm.start" /></div>
              <div class="field"><label for="pz-e">Retomar em <span class="muted">(opcional)</span></label><input id="pz-e" type="date" class="input" [min]="pauseForm.start || today" [(ngModel)]="pauseForm.end" />
                <span class="hint">{{ pauseForm.end ? 'Último dia da pausa.' : 'Sem data: fica pausado até alguém retomar.' }}</span></div>
            </div>
            <div class="field"><label for="pz-r">Motivo</label>
              <textarea id="pz-r" class="textarea" style="min-height: 70px" maxlength="470" appAutofocus [(ngModel)]="pauseForm.reason" placeholder="Ex.: aguardando retorno do fornecedor"></textarea>
              @if (pauseForm.reason.trim().length < 10) {
                <span class="hint" style="color: var(--warn, #b45309)">Escreva pelo menos 10 letras · faltam {{ 10 - pauseForm.reason.trim().length }}</span>
              } @else {
                <span class="hint">Vai para o histórico de datas e para o aviso a responsáveis e solicitantes.</span>
              }</div>
            @if (w.due_date && pauseForm.end) {
              <label class="check-label" style="align-items: flex-start">
                <input type="checkbox" [(ngModel)]="pauseForm.push_due" />
                <span>Adiar a previsão de entrega pelos dias úteis da pausa @if (pauseDays()) { <span class="muted">({{ pauseDays() }} {{ pauseDays() === 1 ? 'dia' : 'dias' }}; previsão atual {{ fmtYear(w.due_date) }})</span> }</span>
              </label>
            } @else if (w.due_date) {
              <p class="hint" style="margin: 0">Sem data de retorno, a previsão de entrega não muda agora. Ao retomar, você escolhe se ela anda os dias úteis em que o {{ t().one }} ficou parado.</p>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="pausing.set(null)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="pauseInvalid() || saving()" (click)="savePause(w)">Pausar</button>
          </div>
        </div>
      </div>
    }

    @if (deleting(); as w) {
      <app-confirm-delete [title]="'Excluir ' + t().one" [name]="w.name" [busy]="removing()" [message]="deleteMessage(w)"
                          (cancel)="deleting.set(null)" (confirm)="remove(w)" />
    }

    @if (cols.rescheduleScope(); as sc) {
      <app-phase-reschedule [scope]="sc" (closed)="cols.closeReschedule($event); $event === 'applied' && load()" />
    }

    @if (detail(); as w) {
      <div class="modal-scrim" (click)="closeDetail()">
        <div class="modal wk-detail" (click)="$event.stopPropagation()" role="dialog" [attr.aria-label]="w.name">
          <div class="wk-detail__head">
            <span class="wk-table__sq wk-detail__sq" [style.background]="w.color"></span>
            <div class="grow">
              <h2><span class="wk-id">#{{ w.id }}</span>{{ w.name }}</h2>
              <div class="wk-detail__badges">
                @if (w.completed_at) { <span class="wk-badge wk-badge--ok">Concluído</span> }
                @else if (w.phase_name) { <span class="wk-badge" [style.--wk-badge]="w.phase_color">{{ w.phase_name }}</span> }
                <span [class]="'wk-dl wk-dl--' + deadlineState(w).tone">{{ deadlineState(w).label }}</span>
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="closeDetail()" aria-label="Fechar"><app-icon name="x" [size]="16" /></button>
          </div>
          <div class="modal-body">
            <div>
              <div class="wk-detail__title">Descrição/Escopo</div>
              @if ((w.description || '').trim()) { <p class="wk-detail__desc">{{ w.description }}</p> }
              @else { <p class="muted small">Sem descrição.</p> }
            </div>

            <div>
              <div class="wk-detail__title">Anexos @if (detailFiles().length) { <span class="muted">· {{ detailFiles().length }}</span> }</div>
              @if (detailFilesLoading()) { <div class="muted small">Carregando anexos…</div> }
              @else {
                <div class="th-files">
                  @for (f of detailFiles(); track f.id) {
                    <div class="th-file">
                      <span class="th-file-ico"><app-icon name="paperclip" [size]="14" /></span>
                      <div class="th-file-meta">
                        <button type="button" class="th-file-name" (click)="downloadWorkFile(w.id, f)" [title]="'Baixar ' + f.name">{{ f.name }}</button>
                        <span class="muted small">{{ fileSize(f.size_bytes) }}@if (f.uploaded_by) { · {{ f.uploaded_by.name }} }</span>
                      </div>
                    </div>
                  } @empty { <div class="muted small">Nenhum anexo.</div> }
                </div>
              }
            </div>

            <div class="wk-detail__grid">
              <div><span>Início</span><b>{{ fmtDate(w.start_date) }}</b></div>
              <div><span>Previsão de entrega</span><b>{{ fmtDate(w.due_date) }}</b></div>
              <div><span>Duração prevista</span><b>{{ w.duration_days ? w.duration_days + ' dias úteis' : '—' }}</b></div>
              <div><span>Departamento</span><b>{{ departments(w).join(', ') || '—' }}</b></div>
              <div><span>Atrasadas</span><b [class.wk-late]="w.tasks_overdue">{{ w.tasks_overdue }}</b></div>
              <div><span>Bloqueadas</span><b [class.wk-warn]="w.tasks_blocked">{{ w.tasks_blocked }}</b></div>
              <div class="wk-detail__progress">
                <span>Andamento</span>
                <div class="wk-table__pct">
                  <span class="wk-bar"><span [style.width.%]="pct(w)" [class.wk-bar--late]="w.tasks_overdue && !w.completed_at" [class.wk-bar--done]="!!w.completed_at"></span></span>
                  <b>{{ pct(w) }}%</b>
                </div>
                <small class="muted">{{ w.tasks_done }} de {{ w.tasks_total }} {{ w.tasks_total === 1 ? 'tarefa' : 'tarefas' }}</small>
              </div>
            </div>

            <div class="wk-detail__people">
              <div>
                <div class="wk-detail__title">Responsáveis</div>
                @for (o of w.owners; track o.id) {
                  <div class="wk-detail__person"><app-avatar [person]="o" /><span><b>{{ o.name }}</b>@if (o.department) { <small class="muted">{{ o.department }}</small> }</span></div>
                } @empty { <div class="muted small">Nenhum</div> }
              </div>
              <div>
                <div class="wk-detail__title">Solicitantes</div>
                @for (m of w.members; track m.id) {
                  <div class="wk-detail__person"><app-avatar [person]="m" /><span><b>{{ m.name }}</b>@if (m.department) { <small class="muted">{{ m.department }}</small> }</span></div>
                } @empty { <div class="muted small">Nenhum</div> }
              </div>
            </div>

            @if (w.continues?.length || w.continued_by?.length) {
              <div>
                <div class="wk-detail__title">Ligações</div>
                @if (w.continues?.length) { <div class="small">Continua de: <b>{{ namesOf(w.continues) }}</b></div> }
                @if (w.continued_by?.length) { <div class="small">Continuado por: <b>{{ namesOf(w.continued_by) }}</b></div> }
              </div>
            }

            @if (w.my_role !== 'follow') {
              <div>
                <div class="wk-detail__title">Tarefas @if (!detailTasksLoading() && detailTasks().length) { <span class="muted">· {{ detailTasks().length }}</span> }</div>
                @if (detailTasksLoading()) {
                  <div class="muted small">Carregando…</div>
                } @else if (!detailTasks().length) {
                  <div class="muted small">Nenhuma tarefa.</div>
                } @else {
                  <div class="wk-detail__tasks">
                    @for (task of detailTasks(); track task.id) {
                      <div class="wk-detail__task">
                        <div class="wk-detail__task-h">
                          <b>{{ task.title }}</b>
                          @if (task.status.category === 'done') {
                            <span class="wk-badge wk-badge--ok">{{ task.status.name }}</span>
                          } @else {
                            <span class="wk-badge" [style.--wk-badge]="task.status.color">{{ task.status.name }}</span>
                          }
                        </div>
                        @if (task.assignee) { <div class="muted small">{{ task.assignee.name }}</div> }
                        @if (task.steps?.length) {
                          <button type="button" class="wk-detail__steps-toggle" (click)="toggleSteps(task.id)" [attr.aria-expanded]="stepsOpen(task.id)">
                            Etapas
                            <app-icon name="chevron" [size]="12" [class.rot-down]="stepsOpen(task.id)" />
                          </button>
                          @if (stepsOpen(task.id)) {
                            <ol class="wk-detail__steps">
                              @for (s of task.steps; track s.id; let i = $index) {
                                <li>
                                  <b>{{ s.title }}</b>
                                  <span [class]="'step-badge step-badge--' + stepKind(task.steps, i)">{{ stepTag(task.steps, i) }}</span>
                                  @if (s.assignee_name) { <em>{{ s.assignee_name }}</em> }
                                </li>
                              }
                            </ol>
                          }
                        } @else {
                          <div class="muted small">Sem etapas.</div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <div>
              <div class="wk-detail__title">Histórico de fases</div>
              @if (detailLoading()) {
                <div class="muted small">Carregando…</div>
              } @else {
                <ol class="wk-detail__log">
                  @for (l of detailLog(); track l.id) {
                    <li>
                      <span class="wk-detail__logdot" [style.background]="l.phase_color"></span>
                      <b>{{ l.phase_name }}</b>
                      <span class="muted small">{{ fmtDateTime(l.changed_at) }}@if (l.changed_by_name) { · {{ l.changed_by_name }} }</span>
                    </li>
                  } @empty { <li class="muted small">Ainda sem mudanças de fase.</li> }
                </ol>
              }
            </div>
          </div>
          <div class="modal-foot">
            @if (w.my_role === 'manage') { <button type="button" class="btn btn-sm" (click)="editFromDetail(w)"><app-icon name="pencil" [size]="14" />Editar</button> }
            <a class="btn btn-primary btn-sm" [routerLink]="workLink(w)">Abrir projeto</a>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProjectWorksPage implements OnChanges {
  id = input<string>();
  teamId = input<string>();
  vista = input<string | undefined>();
  lockedView = input<CorpView | undefined>();
  /** Quadro único do Individual: visão travada, sem escolher projeto. */
  personal = input(false);
  private pid = signal(0);
  team = signal<Team | null>(null);
  isBoard = computed(() => !!this.project()?.is_board);
  t = computed(() => termsFor());
  memberNames = computed(() => (this.team()?.members || []).map(m => m.name).join(', '));
  // Pausa manual: período e motivo; a previsão anda os dias úteis da pausa se a pessoa quiser.
  pausing = signal<Work | null>(null);
  pauseForm = { start: '', end: '', reason: '', push_due: true };
  readonly today = todayIso();
  deleting = signal<Work | null>(null);
  removing = signal(false);
  locked = computed(() => {
    const v = this.lockedView();
    return v === 'kanban' || v === 'quadro' || v === 'linha' ? v : null;
  });
  view = computed<'kanban' | 'cards' | 'linha'>(() => {
    const lock = this.locked();
    if (lock === 'linha') return 'linha';
    if (lock === 'quadro') return 'cards';
    if (lock === 'kanban') return 'kanban';
    return this.vista() === 'linha' ? 'linha' : this.vista() === 'cards' ? 'cards' : 'kanban';
  });
  corpViewPath = corpViewPath;
  CORP_VIEWS = CORP_VIEWS;
  PERSONAL_VIEWS = PERSONAL_VIEWS;
  private ui = inject(UiService);
  private boardLoading = false;
  private watchNew = effect(() => {
    if (!this.personal() || !this.ui.openPersonalWork() || !this.project()) return;
    this.ui.openPersonalWork.set(false);
    this.openNew();
  }, { allowSignalWrites: true });
  currentTeamId = computed(() => Number(this.teamId()) || null);
  filtersOpen = signal(false);
  kanbanSort = signal<KanbanSort>('manual');
  readonly kanbanSorts: { key: KanbanSort; label: string }[] = [
    { key: 'manual', label: 'Manual (ordem do quadro)' }, { key: 'prazo', label: 'Prazo' },
    { key: 'nome', label: 'Nome' }, { key: 'progresso', label: 'Progresso' },
  ];
  teamMode = computed(() => this.locked() !== null && !this.personal());
  phaseFilter = signal<number | null>(null);
  activeFilters = computed(() => (this.filter() !== 'todos' ? 1 : 0) + (this.kanbanSort() !== 'manual' ? 1 : 0) + (this.phaseFilter() !== null ? 1 : 0));
  clearFilters() { this.filter.set('todos'); this.kanbanSort.set('manual'); this.phaseFilter.set(null); }
  tableRows = computed(() => {
    const s = this.kanbanSort();
    return [...this.visible()].sort(s === 'manual' ? this.boardOrder : this.sortBy(s));
  });
  sortHead(s: Sort) { this.kanbanSort.set(this.kanbanSort() === s ? 'manual' : s); }
  sortMark(s: Sort) { return this.kanbanSort() === s ? ' ↓' : ''; }
  deadlineState(w: Work): { label: string; tone: 'ok' | 'bad' | 'warn' | 'none' } {
    const due = w.due_date?.slice(0, 10);
    if (w.my_role === 'follow') return w.completed_at ? { label: 'Entregue', tone: 'ok' } : { label: '—', tone: 'none' };
    if (w.completed_at) {
      if (!due) return { label: 'Entregue', tone: 'ok' };
      return w.completed_at.slice(0, 10) <= due ? { label: 'Entregue no prazo', tone: 'ok' } : { label: 'Entregue com atraso', tone: 'bad' };
    }
    if (!due) return { label: 'Sem prazo', tone: 'none' };
    if (due < todayIso()) return { label: 'Atrasado', tone: 'bad' };
    if (w.tasks_overdue > 0) return { label: 'Em risco', tone: 'warn' };
    return { label: 'No prazo', tone: 'ok' };
  }
  pausedNow(w: Work) {
    const t = todayIso();
    return !w.completed_at && !!w.pause_start && !!w.pause_end && w.pause_start.slice(0, 10) <= t && t <= w.pause_end.slice(0, 10);
  }
  dmShort(iso: string) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
  fmtDate(iso: string | null | undefined) { return iso ? this.fmtYear(iso) : '—'; }
  fmtDateTime(iso: string) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? this.fmtDate(iso)
      : `${this.fmtYear(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  departments(w: Work) {
    const own = (w.department || '').trim();
    return own ? [own] : [...new Set(w.members.map(m => (m.department || '').trim()).filter(Boolean))];
  }
  detail = signal<Work | null>(null);
  detailLog = signal<WorkPhaseLog[]>([]);
  detailLoading = signal(false);
  detailTasks = signal<Task[]>([]);
  detailTasksLoading = signal(false);
  private stepsOpenIds = signal<Record<number, boolean>>({});
  detailFiles = signal<TaskFile[]>([]);
  detailFilesLoading = signal(false);
  formFiles = signal<TaskFile[]>([]);
  formFilesLoading = signal(false);
  pendingFiles = signal<File[]>([]);
  uploadingFiles = signal(false);
  fileOver = signal(false);
  fileMax = TASK_FILE_MAX;
  fileMaxMb = TASK_FILE_MAX_MB;
  fileSize = fileSize;
  openDetail(w: Work) {
    this.detail.set(w);
    this.detailLog.set([]);
    this.detailFiles.set([]);
    this.detailTasks.set([]);
    this.stepsOpenIds.set({});
    this.detailFilesLoading.set(true);
    if (w.my_role !== 'follow') {
      this.detailTasksLoading.set(true);
      this.api.tasks({ project_id: w.project_id, section_id: w.id, status: 'all', with_steps: 1 }).subscribe({
        next: list => { if (this.detail()?.id === w.id) { this.detailTasks.set(list); this.detailTasksLoading.set(false); } },
        error: () => { if (this.detail()?.id === w.id) this.detailTasksLoading.set(false); },
      });
    }
    this.api.workFiles(w.id).subscribe({
      next: list => { if (this.detail()?.id === w.id) { this.detailFiles.set(list); this.detailFilesLoading.set(false); } },
      error: () => { if (this.detail()?.id === w.id) this.detailFilesLoading.set(false); },
    });
    this.detailLoading.set(true);
    this.api.workPhasesLog(w.id).subscribe({
      next: log => { if (this.detail()?.id === w.id) { this.detailLog.set(log); this.detailLoading.set(false); } },
      error: () => { if (this.detail()?.id === w.id) this.detailLoading.set(false); },
    });
  }
  closeDetail() { this.detail.set(null); }
  stepsOpen(id: number) { return !!this.stepsOpenIds()[id]; }
  toggleSteps(id: number) { this.stepsOpenIds.update(m => ({ ...m, [id]: !m[id] })); }
  stepKind(steps: Task['steps'], index: number) {
    const list = steps || [];
    if (list[index]?.done) return 'done';
    return index === list.findIndex(s => !s.done) ? 'turn' : 'wait';
  }
  stepTag(steps: Task['steps'], index: number) {
    const kind = this.stepKind(steps, index);
    return kind === 'done' ? 'Concluída' : kind === 'turn' ? 'Na vez' : 'Aguardando';
  }
  editFromDetail(w: Work) { this.detail.set(null); this.openEdit(w); }

  private loadFormFiles(workId: number) {
    this.formFilesLoading.set(true);
    this.api.workFiles(workId).subscribe({
      next: list => { if (this.form?.id === workId) { this.formFiles.set(list); this.formFilesLoading.set(false); } },
      error: () => { if (this.form?.id === workId) this.formFilesLoading.set(false); },
    });
  }
  pickFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const picked = [...(input.files || [])];
    input.value = '';
    this.takeFiles(picked);
  }

  fileEnter(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.fileOver.set(true);
  }
  fileHover(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
  }
  fileLeave(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    const next = ev.relatedTarget as Node | null;
    if (next && (ev.currentTarget as Node).contains(next)) return;
    this.fileOver.set(false);
  }
  fileDrop(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.fileOver.set(false);
    this.takeFiles([...(ev.dataTransfer?.files || [])]);
  }

  private takeFiles(picked: File[]) {
    const f = this.form;
    if (!picked.length || !f || this.uploadingFiles()) return;
    let count = f.id ? this.formFiles().length : this.pendingFiles().length;
    const keep: File[] = [];
    for (const file of picked) {
      const err = taskFileError(file, count);
      if (err) { this.toast.error(err); continue; }
      keep.push(file);
      count += 1;
    }
    if (!keep.length) return;
    if (!f.id) { this.pendingFiles.update(l => [...l, ...keep]); return; }
    const workId = f.id;
    this.uploadingFiles.set(true);
    this.api.uploadWorkFiles(workId, keep).subscribe({
      next: () => { this.uploadingFiles.set(false); this.toast.show(keep.length === 1 ? 'Anexo incluído.' : 'Anexos incluídos.'); this.loadFormFiles(workId); },
      error: e => { this.uploadingFiles.set(false); this.toast.error(errorMessage(e)); },
    });
  }
  removePending(i: number) { this.pendingFiles.update(l => l.filter((_, j) => j !== i)); }
  removeWorkFile(workId: number, f: TaskFile) {
    this.api.deleteWorkFile(workId, f.id).subscribe({
      next: () => { this.toast.show('Anexo removido.'); this.loadFormFiles(workId); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }
  downloadWorkFile(workId: number, f: TaskFile) {
    this.api.downloadWorkFile(workId, f.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível baixar o arquivo.')),
    });
  }
  private kanbanEl = viewChild<ElementRef<HTMLElement>>('kanban');
  private api = inject(ApiService);
  private auth = inject(AuthService);
  data = inject(DataService);
  private toast = inject(ToastService);
  private router = inject(Router);

  project = signal<Project | null>(null);
  works = signal<Work[]>([]);
  people = signal<Person[]>([]);
  canCreate = signal(false);
  seesAll = signal(true);
  error = signal('');
  q = signal('');
  queryText = '';
  filter = signal<Filter>('todos');
  saving = signal(false);
  phases = signal<Phase[]>([]);
  private phaseScope = signal<PhaseScope | null>(null);
  phasesEditable = signal(false);
  editCols = computed(() => this.phasesEditable() && !this.presenting());
  presenting = signal(false);
  dragId = signal<number | null>(null);
  dropPhase = signal<number | null>(null);
  cols = new PhaseColumns({
    api: this.api, toast: this.toast, phases: () => this.phases(), scope: () => this.phaseScope(),
    saved: phases => { this.phases.set(phases); this.load(); },
  });
  private phaseOf(w: Work) {
    const phases = this.phases();
    return w.phase_id && phases.some(p => p.id === w.phase_id) ? w.phase_id : phases[0]?.id;
  }
  private boardOrder = (a: Work, b: Work) => (a.board_position ?? 0) - (b.board_position ?? 0) || a.position - b.position || a.id - b.id;
  private sortBy(s: Sort) {
    return (a: Work, b: Work) => s === 'nome' ? a.name.localeCompare(b.name, 'pt-BR')
      : s === 'progresso' ? this.pct(b) - this.pct(a)
      : (a.due_date || '9999').localeCompare(b.due_date || '9999');
  }
  columns = computed(() => {
    const s = this.kanbanSort();
    const order = s === 'manual' ? this.boardOrder : this.sortBy(s);
    return this.phases().map(phase => ({
      phase,
      works: this.visible().filter(w => this.phaseOf(w) === phase.id).sort(order),
    }));
  });
  form: { id?: number; name: string; description: string; start_date: string | null; due_date: string | null; color: string; phase_id?: number | null; department: string } | null = null;
  departmentOptions = signal<string[]>([]);
  impact = signal<SchedulePreview | null>(null);
  private autoDue = false;
  formPhase() { return this.phases().find(p => p.id === this.form?.phase_id) || null; }
  spanError() { return !!(this.form?.start_date && this.form.due_date && this.form.due_date < this.form.start_date); }
  /** Datas salvas ao abrir a edição: mudar exige motivo, que vai para o histórico. */
  private savedDates: { start: string | null; due: string | null } | null = null;
  dateReason = '';
  needsReason() {
    const f = this.form; const s = this.savedDates;
    if (!f?.id || !s || (!s.start && !s.due)) return false;
    return (f.start_date || null) !== s.start || (f.due_date || null) !== s.due;
  }
  reasonMissing() { return this.needsReason() && this.dateReason.trim().length < 10; }
  span() { return this.form?.start_date && this.form.due_date ? businessSpan(this.form.start_date, this.form.due_date) : 0; }
  phaseDays() { return sumPhaseDays(this.phases()); }
  fmtYear(iso: string) {
    const d = parseIso(iso.slice(0, 10));
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  onStart(v: string) {
    if (!this.form) return;
    this.form.start_date = v || null;
    const days = this.phaseDays() || DEFAULT_DURATION;
    if (this.form.start_date && (this.autoDue || !this.form.due_date)) {
      this.form.due_date = endAfter(this.form.start_date, days);
      this.autoDue = true;
    }
    this.checkImpact();
  }
  onDue(v: string) {
    if (!this.form) return;
    this.form.due_date = v || null;
    this.autoDue = false;
    this.checkImpact();
  }
  applySuggested() {
    const s = this.impact()?.suggestion; if (!this.form || !s) return;
    this.form.start_date = s.start;
    this.form.due_date = s.due;
    this.autoDue = false;
    this.checkImpact();
  }
  private impactTimer: ReturnType<typeof setTimeout> | null = null;
  private impactReq = 0;
  /** Projetos implicados que não aceitam reajuste (ficam junto com este). */
  private skipIds = signal<number[]>([]);
  noneAccepted = noneAccepted;
  toggleAdjust(id: number) {
    this.skipIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
    this.checkImpact(0);
  }
  private checkImpact(wait = 400) {
    if (this.impactTimer) clearTimeout(this.impactTimer);
    this.impactReq++;
    const f = this.form;
    if (!f?.start_date || !f.due_date || !this.ownerIds().length || this.spanError()) {
      this.impact.set(null);
      return;
    }
    const req = this.impactReq;
    const start = f.start_date;
    const due = f.due_date;
    const owners = this.ownerIds();
    const exclude = f.id;
    this.impactTimer = setTimeout(() => {
      if (req !== this.impactReq) return;
      this.api.schedulePreview(this.pid(), { start_date: start, due_date: due, owner_ids: owners, skip_ids: this.skipIds(), ...(exclude ? { exclude_id: exclude } : {}) }).subscribe({
        next: preview => {
          if (req !== this.impactReq) return;
          this.impact.set(preview.conflicts?.length ? preview : null);
        },
        error: () => {},
      });
    }, wait);
  }
  private memberIds = signal<number[]>([]);
  ownerIds = signal<number[]>([]);
  private continuesIds = signal<number[]>([]);
  private blankColor = COLORS[0];
  colors = COLORS;
  healthLabel = { no_prazo: 'No prazo', em_risco: 'Em risco', atrasado: 'Atrasado' } as const;
  filters = computed<{ key: Filter; label: string }[]>(() => [
    { key: 'todos', label: 'Todos' }, { key: 'responsavel', label: 'Sou responsável' },
    { key: 'participo', label: 'Sou solicitante' }, { key: 'atraso', label: 'Com atraso' },
  ]);

  private me = computed(() => this.auth.user()?.id);
  private matches = (w: Work, f: Filter) =>
    f === 'todos' || (f === 'responsavel' && (w.owners?.some(o => o.id === this.me()) || w.owner_id === this.me())) || (f === 'participo' && w.members.some(m => m.id === this.me()))
    || (f === 'atraso' && w.tasks_overdue > 0 && !w.completed_at);
  // Busca pelo identificador: "#12" ou só "12".
  private idMatch(w: Work, q: string) { const m = /^#?(\d+)$/.exec(q); return !!m && w.id === Number(m[1]); }
  private visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    const ph = this.phaseFilter();
    const list = this.works().filter(w => this.matches(w, this.filter()) && (ph === null || this.phaseOf(w) === ph)
      && (!q || this.idMatch(w, q) || w.name.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q)));
    return list;
  });
  totals = computed(() => this.works().reduce((t, w) => ({ total: t.total + w.tasks_total, done: t.done + w.tasks_done, overdue: t.overdue + w.tasks_overdue }), { total: 0, done: 0, overdue: 0 }));
  chosen = computed(() => this.memberIds().map(id => this.allPeople().find(p => p.id === id)!).filter(Boolean));
  // No quadro da equipe, quem é da equipe já participa; a lista é só de gente de fora.
  candidates = computed(() => this.allPeople().filter(p => !this.memberIds().includes(p.id) && !this.ownerIds().includes(p.id) && !(this.isBoard() && p.in_team)));
  owners = computed(() => this.isBoard() ? this.people().filter(p => p.can_own ?? p.in_team) : this.people());
  chosenOwners = computed(() => this.ownerIds().map(id => this.allPeople().find(p => p.id === id)!).filter(Boolean));
  ownerCandidates = computed(() => this.owners().filter(p => !this.ownerIds().includes(p.id)));
  ownerNames(w: Work) { return (w.owners || []).map(o => o.name).join(', '); }
  namesOf(items?: { name: string }[]) { return (items || []).map(i => i.name).join(', '); }
  toggleLink(id: number) { if (id) this.continuesIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id])); }
  chosenLinks() { return this.continuesIds().map(id => this.works().find(w => w.id === id)).filter((w): w is Work => !!w); }
  linkCandidates() {
    const self = this.form?.id;
    const picked = new Set(this.continuesIds());
    return this.works().filter(w => w.id !== self && !picked.has(w.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  private allPeople = computed(() => this.people().length ? this.people() : this.data.people());

  ngOnChanges(changes: SimpleChanges) {
    if (this.personal()) {
      this.phaseFilter.set(null); this.detail.set(null);
      if (this.pid()) { this.load(); return; }
      if (this.boardLoading) return;
      this.boardLoading = true;
      this.project.set(null); this.works.set([]); this.team.set(null); this.error.set('');
      this.api.personalBoard().subscribe({
        next: r => {
          this.boardLoading = false;
          this.pid.set(r.project_id);
          this.data.personalBoardId.set(r.project_id);
          this.load();
        },
        error: () => { this.boardLoading = false; this.error.set('Não foi possível abrir o quadro individual.'); },
      });
      return;
    }
    if (!changes['id'] && !changes['teamId']) { this.load(); return; }
    const teamId = Number(this.teamId());
    this.project.set(null); this.works.set([]); this.team.set(null); this.error.set('');
    this.phaseFilter.set(null); this.detail.set(null);
    if (!teamId) {
      this.pid.set(Number(this.id()));
      this.load();
      return;
    }
    if (this.teamMode()) saveKanbanTeam(teamId);
    this.api.teamBoard(teamId).subscribe({
      next: r => {
        this.pid.set(r.project_id); this.load();
        if (!this.data.teams().find(x => x.id === teamId)?.board_id) this.data.reloadTeams();
      },
      error: () => this.error.set('Equipe não encontrada ou sem acesso.'),
    });
    this.api.team(teamId).subscribe({ next: tm => this.team.set(tm), error: () => {} });
  }

  workLink(w: Work) {
    if (this.personal()) return ['/ti/taskhub/individual/projeto', w.id];
    const p = this.project();
    return p?.is_board && p.team_id ? ['/ti/taskhub/equipes', p.team_id, 'projetos', w.id] : ['/ti/taskhub/projetos', w.project_id, 'trabalhos', w.id];
  }

  load() {
    const pid = this.pid();
    if (!pid) return;
    this.error.set('');
    this.api.project(pid).subscribe({
      next: p => {
        // O quadro da equipe abre pelo endereço da equipe.
        if (p.is_board && p.team_id && !this.teamId()) {
          this.router.navigate(['/ti/taskhub/kanban/equipes', p.team_id], { replaceUrl: true, queryParamsHandling: 'preserve' });
          return;
        }
        if ((p.space === 'pessoal' || p.is_personal_board) && !this.personal()) {
          this.router.navigate(['/ti/taskhub/individual/kanban'], { replaceUrl: true });
          return;
        }
        this.project.set(p);
      },
      error: () => this.error.set('Projeto não encontrado ou sem acesso.'),
    });
    this.api.works(pid).subscribe({
      next: r => {
        this.works.set(r.works); this.canCreate.set(r.can_create); this.seesAll.set(r.sees_all !== false); this.phases.set(r.phases || []);
        this.phaseScope.set(r.phases_scope === 'team' ? (r.team_id ? { kind: 'team', id: r.team_id } : null) : { kind: 'project', id: pid });
        this.phasesEditable.set(!!r.phases_editable);
      },
      error: e => this.toast.error(errorMessage(e, `Não foi possível carregar os ${this.t().many}.`)),
    });
    this.api.projectPeople(pid).subscribe({ next: p => this.people.set(p), error: () => {} });
  }

  canMove(w: Work) { return w.my_role === 'manage'; }
  dragStart(ev: DragEvent, w: Work) {
    if (!this.canMove(w) || this.presenting()) { ev.preventDefault(); return; }
    this.dragId.set(w.id);
    ev.dataTransfer?.setData('text/plain', String(w.id));
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }
  dragOver(ev: DragEvent, phaseId: number) {
    if (this.dragId() === null) return;
    ev.preventDefault();
    this.dropPhase.set(phaseId);
  }
  // Soltar sobre um card coloca antes dele; no vazio da coluna, no fim.
  dropOn(ev: DragEvent, phase: Phase, before: Work | null) {
    ev.preventDefault();
    const id = this.dragId();
    this.dragId.set(null); this.dropPhase.set(null);
    const w = this.works().find(x => x.id === id);
    if (!w || before?.id === w.id) return;
    const moved = this.phaseOf(w) !== phase.id;
    // Fora da ordem manual, arrastar só troca a fase; a posição na coluna segue a ordenação escolhida.
    if (this.kanbanSort() !== 'manual') {
      if (!moved) return;
      before = null;
    }
    const current = this.columns().find(c => c.phase.id === phase.id)?.works || [];
    const col = current.filter(x => x.id !== w.id);
    const found = before ? col.findIndex(x => x.id === before.id) : -1;
    const at = found < 0 ? col.length : found;
    const order = [...col.slice(0, at), w, ...col.slice(at)];
    if (!moved && order.every((x, i) => current[i]?.id === x.id)) return;
    const pos = new Map(order.map((x, i) => [x.id, (i + 1) * 1000]));
    this.works.update(list => list.map(x => x.id === w.id
      ? { ...x, phase_id: phase.id, phase_name: phase.name, phase_color: phase.color, board_position: pos.get(x.id)! }
      : pos.has(x.id) ? { ...x, board_position: pos.get(x.id)! } : x));
    this.api.setWorkPhase(w.id, phase.id, before?.id ?? null).subscribe({
      next: () => { if (moved) this.toast.show(`${w.name} passou para ${phase.name}.`); },
      error: e => { this.load(); this.toast.error(errorMessage(e, `Não foi possível mover o ${this.t().one}.`)); },
    });
  }
  openWork(ev: MouseEvent, w: Work) {
    if ((ev.target as HTMLElement).closest('a, button')) return;
    this.router.navigate(this.workLink(w));
  }

  present() {
    const el = this.kanbanEl()?.nativeElement;
    this.presenting.set(true);
    el?.requestFullscreen?.().catch(() => {});
  }
  stopPresent() {
    this.presenting.set(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  @HostListener('document:fullscreenchange')
  onFullscreen() { if (!document.fullscreenElement) this.presenting.set(false); }
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.detail()) { this.closeDetail(); return; }
    if (this.filtersOpen()) { this.filtersOpen.set(false); return; }
    if (this.presenting()) this.stopPresent();
  }

  setView(v: 'linha' | 'cards' | null) {
    this.router.navigate([], { queryParams: { vista: v }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  countOf(f: Filter) { return this.works().filter(w => this.matches(w, f)).length; }
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  search(v: string) { this.queryText = v; if (this.searchTimer) clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.q.set(v), 500); }

  pct(w: Work) { return w.tasks_total ? Math.round((w.tasks_done / w.tasks_total) * 100) : 0; }
  initials(name: string) {
    const parts = name.replace(/^(customização|customizacao|trabalho)\s+/i, '').split(/\s+/).filter(w => w.length > 2 || w === w.toUpperCase());
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    const w = parts[0] || name || '?';
    if (w.length <= 3) return w.toUpperCase();
    const c = w.slice(1).match(/[bcdfghjklmnpqrstvwxz]/i);
    return (w[0] + (c ? c[0] : w[1])).toUpperCase();
  }
  due(iso: string) { return iso === todayIso() ? 'hoje' : dueLabel(iso).toLowerCase(); }

  openNew(phaseId: number | null = null) {
    const me = this.me();
    this.clearDraft();
    this.blankColor = COLORS[this.works().length % COLORS.length];
    this.memberIds.set([]);
    this.ownerIds.set(me ? [me] : []);
    this.continuesIds.set([]);
    this.form = {
      name: '', description: '', start_date: null, due_date: null,
      color: this.blankColor, phase_id: phaseId ?? this.phases()[0]?.id ?? null, department: '',
    };
    this.deptAuto = true;
    this.pendingFiles.set([]);
    this.loadDepartments();
    this.impact.set(null); this.skipIds.set([]);
    this.autoDue = true;
    this.checkImpact();
  }
  cancelForm() { this.dismissForm(); }
  dismissForm() {
    if (this.form && !this.form.id) this.clearDraft();
    this.form = null;
    this.impact.set(null); this.skipIds.set([]);
    this.impactReq++;
    if (this.impactTimer) { clearTimeout(this.impactTimer); this.impactTimer = null; }
  }
  private draftKey() { return `taskhub_work_draft_${this.pid()}`; }
  private clearDraft() {
    try { localStorage.removeItem(this.draftKey()); } catch { /* ignore */ }
  }
  openEdit(w: Work) {
    this.memberIds.set(w.members.map(m => m.id));
    this.ownerIds.set(w.owners?.length ? w.owners.map(o => o.id) : w.owner_id ? [w.owner_id] : []);
    this.continuesIds.set((w.continues || []).map(c => c.id));
    this.form = { id: w.id, name: w.name, description: w.description, start_date: w.start_date ?? null, due_date: w.due_date, color: w.color,
      department: w.department || '' };
    this.savedDates = { start: w.start_date ?? null, due: w.due_date ?? null };
    this.dateReason = '';
    const firstDept = (w.members.map(m => (m.department || '').trim()).find(Boolean)) || '';
    this.deptAuto = !this.form.department || this.form.department === firstDept;
    this.formFiles.set([]);
    this.loadFormFiles(w.id);
    this.loadDepartments();
    this.impact.set(null); this.skipIds.set([]);
    this.autoDue = false;
    this.checkImpact();
  }
  private loadDepartments() {
    if (this.departmentOptions().length) return;
    this.api.departments().subscribe({ next: d => this.departmentOptions.set(d), error: () => {} });
  }
  toggleMember(id: number) {
    if (!id) return;
    this.memberIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
    const f = this.form;
    if (f && this.deptAuto) f.department = this.firstMemberDept();
  }
  deptAuto = true;
  private firstMemberDept() { return this.chosen().map(p => (p.department || '').trim()).find(Boolean) || ''; }
  toggleOwner(id: number) {
    if (!id) return;
    this.ownerIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
    this.memberIds.update(l => l.filter(x => x !== id));
    this.checkImpact();
  }

  save(push = false) {
    const f = this.form; if (!f?.name?.trim() || !this.ownerIds().length || this.spanError() || this.reasonMissing()) return;
    if (!push && this.impact()?.conflicts?.length) return;
    const body: Record<string, unknown> = { name: f.name.trim(), description: f.description || '', owner_ids: this.ownerIds(), due_date: f.due_date || null, color: f.color, members: this.memberIds(),
      start_date: f.start_date || null, continues_ids: this.continuesIds(), department: f.department.trim() || null, ...(push ? { skip_ids: this.skipIds() } : {}),
      ...(this.needsReason() ? { date_reason: this.dateReason.trim() } : {}) };
    this.commitSave(body, f);
  }
  private commitSave(body: Record<string, unknown>, f: { id?: number; phase_id?: number | null }) {
    this.saving.set(true);
    const req = f.id ? this.api.updateWork(f.id, body) : this.api.createWork(this.pid(), { ...body, ...(f.phase_id ? { phase_id: f.phase_id } : {}) });
    const T = this.t();
    req.subscribe({
      next: w => {
        const files = f.id ? [] : this.pendingFiles();
        const finish = () => {
          this.saving.set(false); this.form = null; this.impact.set(null); this.pendingFiles.set([]);
          this.load(); this.data.reloadProjects(); this.data.reloadTeams();
          if (!f.id) this.clearDraft();
        };
        if (!files.length) { finish(); this.toast.show(f.id ? `${T.One} atualizado.` : `${T.One} criado.`); return; }
        this.api.uploadWorkFiles(w.id, files).subscribe({
          next: () => { finish(); this.toast.show(`${T.One} criado.`); },
          error: err => { finish(); this.toast.error(`O ${T.one} foi criado, mas os anexos não foram enviados. ${errorMessage(err)}`); },
        });
      },
      error: e => {
        this.saving.set(false);
        if (e?.status === 409 && e?.error?.conflicts) { this.impact.set(e.error); return; }
        this.toast.error(errorMessage(e, `Não foi possível salvar o ${T.one}.`));
      },
    });
  }

  toggleDone(w: Work) {
    const T = this.t();
    const closing = !w.completed_at;
    const run = () => this.api.updateWork(w.id, { done: closing }).subscribe({
      next: () => { this.load(); this.toast.show(closing ? `${T.One} concluído.` : `${T.One} reaberto.`); },
      error: e => this.toast.error(errorMessage(e, `Não foi possível atualizar o ${T.one}.`)),
    });
    if (!closing) { run(); return; }
    this.api.tasks({ project_id: w.project_id, section_id: w.id, status: 'open', with_steps: 1 }).subscribe({
      next: list => { if (confirmOpen(`o ${T.one}`, openWorkLines(list))) run(); },
      error: e => this.toast.error(errorMessage(e, `Não foi possível atualizar o ${T.one}.`)),
    });
  }

  // Pausa sem data de retorno: o backend guarda o fim como 9999-12-31.
  openPause(w: Work) { return !!w.pause_end && w.pause_end.startsWith('9999'); }
  pauseTitle(w: Work) {
    return this.openPause(w) ? `Em pausa desde ${this.fmtYear(w.pause_start!)}, sem data de retorno`
      : `Pausa de ${this.fmtYear(w.pause_start!)} a ${this.fmtYear(w.pause_end!)}`;
  }
  startPause(w: Work) {
    this.pauseForm = { start: this.today, end: '', reason: '', push_due: true };
    this.pausing.set(w);
  }
  pauseDays() {
    const { start, end } = this.pauseForm;
    if (!start || !end || end < start) return 0;
    let n = 0;
    for (let d = new Date(start + 'T12:00:00'); d <= new Date(end + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) n++;
    }
    return n;
  }
  pauseInvalid() {
    const { start, end, reason } = this.pauseForm;
    return !start || (!!end && (end < start || end < this.today)) || reason.trim().length < 10;
  }
  savePause(w: Work) {
    const T = this.t();
    this.saving.set(true);
    this.api.pauseWork(w.id, { ...this.pauseForm, end: this.pauseForm.end || null, reason: this.pauseForm.reason.trim(), push_due: this.pauseForm.push_due && !!w.due_date && !!this.pauseForm.end }).subscribe({
      next: () => { this.saving.set(false); this.pausing.set(null); this.load(); this.toast.show(`${T.One} pausado.`); },
      error: e => { this.saving.set(false); this.toast.error(errorMessage(e, `Não foi possível pausar o ${T.one}.`)); },
    });
  }
  resume(w: Work) {
    const T = this.t();
    let push = false;
    const started = !!w.pause_start && w.pause_start.slice(0, 10) < this.today;
    if (this.openPause(w) && started && w.due_date) {
      if (!confirm(`Retomar ${w.name}?\nA pausa termina agora.`)) return;
      push = confirm(`Adiar a previsão de entrega (${this.fmtYear(w.due_date)}) pelos dias úteis em que ${w.name} ficou pausado?\nOK adia; Cancelar mantém a data.`);
    } else if (!confirm(`Retomar ${w.name}?\nA pausa termina agora. A previsão de entrega continua como está.`)) return;
    this.api.resumeWork(w.id, push).subscribe({
      next: () => { this.load(); this.toast.show(`${T.One} retomado.`); },
      error: e => this.toast.error(errorMessage(e, `Não foi possível retomar o ${T.one}.`)),
    });
  }

  deleteMessage(w: Work) {
    const tasks = w.tasks_total === 1 ? 'A única tarefa dele' : `As ${w.tasks_total} tarefas dele`;
    return w.tasks_total
      ? `${tasks}, com etapas, comentários e anexos, também serão apagadas.`
      : `O ${this.t().one} ${w.name} não tem tarefas.`;
  }

  remove(w: Work) {
    const T = this.t();
    this.removing.set(true);
    this.api.deleteWork(w.id).subscribe({
      next: () => {
        this.removing.set(false); this.deleting.set(null);
        this.load(); this.data.reloadProjects(); this.data.reloadTeams(); this.toast.show(`${T.One} excluído.`);
      },
      error: e => { this.removing.set(false); this.toast.error(errorMessage(e, `Não foi possível excluir o ${T.one}.`)); },
    });
  }
}
