import { Component, ElementRef, HostListener, OnChanges, SimpleChanges, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { Person, Phase, Project, SchedulePreview, Team, Work } from '../core/models';
import { dueLabel, relativeTime, termsFor, todayIso } from '../core/format';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';
import { ProjectTimelineComponent } from './project-timeline.component';
import { businessSpan, DEFAULT_DURATION, endAfter, parseIso, sumPhaseDays } from '../core/timeline';
import { PhaseColumns } from '../shared/phase-columns';
import { ConfirmDeleteComponent } from '../shared/confirm-delete.component';

const COLORS = ['#4c8dff', '#2fbf71', '#e11d48', '#f97316', '#a78bfa', '#14b8a6', '#c9a84c', '#ec4899'];
type Filter = 'todos' | 'responsavel' | 'participo' | 'atraso';
type Sort = 'prazo' | 'nome' | 'progresso';

// Projeto → Trabalhos → Tarefas. Ao abrir o projeto aparecem os trabalhos em cartões.
@Component({
  selector: 'app-project-works',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, RouterLink, AutofocusDirective, AvatarComponent, IconComponent, ProjectTimelineComponent, ConfirmDeleteComponent],
  template: `
    <div class="page works-page">
      @if (project(); as p) {
        <div class="crumb">
          @if (p.sector_name) { <span>{{ p.sector_name }}</span> › } @if (isBoard()) { Equipe › } {{ p.name }}
        </div>
        <div class="page-head">
          <div class="grow">
            <div class="row" style="gap: 10px">
              <span class="wk-dot" [style.background]="p.color"></span>
              <h1>{{ p.name }}</h1>
              @if (!isBoard()) { <span class="health" [class]="'health ' + p.health"><i></i>{{ healthLabel[p.health] }}</span> }
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
              @if (p.end_date && !isBoard()) { · Entrega {{ due(p.end_date) }} }
            </div>
          </div>
          <div class="actions">
            @if (view() === 'kanban') {
              <button type="button" class="btn btn-sm" (click)="present()" title="Mostrar o Kanban em tela cheia"><app-icon name="board" [size]="14" />Apresentar</button>
            }
            @if (team(); as tm) {
              @if (tm.can_dashboard) { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/equipes', tm.id, 'painel']"><app-icon name="chart" [size]="14" />Painel</a> }
              <a class="btn btn-sm" routerLink="/ti/taskhub/equipes" [queryParams]="{ equipe: tm.id }">Configurações da equipe</a>
            } @else if (p.my_role === 'manage') { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/projetos', p.id, 'configuracoes']">Configurações</a> }
            @if (canCreate()) { <button class="btn btn-primary btn-sm" (click)="openNew()"><app-icon name="plus" [size]="14" />{{ t().novo }}</button> }
          </div>
        </div>
        @if (p.description && !isBoard()) { <p class="muted" style="max-width: 760px; margin: -6px 0 14px; white-space: pre-wrap">{{ p.description }}</p> }

        <div class="tl-tabs" role="tablist" aria-label="Visão do projeto">
          <button type="button" role="tab" [class.on]="view() === 'kanban'" [attr.aria-selected]="view() === 'kanban'" (click)="setView(null)"><app-icon name="board" [size]="14" />Kanban</button>
          <button type="button" role="tab" [class.on]="view() === 'cards'" [attr.aria-selected]="view() === 'cards'" (click)="setView('cards')"><app-icon name="folder" [size]="14" />{{ t().Many }}</button>
          <button type="button" role="tab" [class.on]="view() === 'linha'" [attr.aria-selected]="view() === 'linha'" (click)="setView('linha')"><app-icon name="calendar" [size]="14" />Linha do tempo</button>
        </div>

        @if (view() === 'linha') {
          <app-project-timeline [projectId]="p.id" [board]="isBoard()" (changed)="load(); data.reloadProjects()" />
        } @else {
        <div class="wk-toolbar">
          <input class="input" style="width: 240px; height: 36px" [placeholder]="'Buscar ' + t().one" [ngModel]="queryText" (ngModelChange)="search($event)" [attr.aria-label]="'Buscar ' + t().one" />
          <div class="wk-chips" role="group" [attr.aria-label]="'Filtrar ' + t().many">
            @for (f of filters; track f.key) {
              <button type="button" [class.on]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }} {{ countOf(f.key) }}</button>
            }
          </div>
          <span class="grow"></span>
          @if (view() === 'cards') {
            <label class="muted small" for="wk-sort">Ordenar</label>
            <select id="wk-sort" class="select" style="width: 140px; height: 36px" [ngModel]="sort()" (ngModelChange)="sort.set($event)">
              <option value="prazo">Prazo</option><option value="nome">Nome</option><option value="progresso">Progresso</option>
            </select>
          }
        </div>

        @if (view() === 'kanban') {
          <div #kanban class="wk-kanban" [class.wk-kanban--present]="presenting()">
            @if (presenting()) {
              <div class="wk-present-head">
                <span class="wk-dot" [style.background]="p.color"></span>
                <h2>{{ p.name }}</h2>
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
                          <div class="wk-col__hint">Vale para todos os projetos da equipe.</div>
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

        @if (recent().length) {
          <section class="wk-group">
            <h2 class="wk-group__title">Recentes <span>abertos por você nos últimos dias</span></h2>
            <div class="wk-grid">@for (w of recent(); track w.id) { <ng-container *ngTemplateOutlet="card; context: { $implicit: w, isRecent: true }" /> }</div>
          </section>
        }

        <section class="wk-group">
          <h2 class="wk-group__title">Em andamento <span>{{ active().length }}</span></h2>
          <div class="wk-grid">
            @for (w of active(); track w.id) { <ng-container *ngTemplateOutlet="card; context: { $implicit: w }" /> }
            @if (canCreate()) { <button type="button" class="wk-new" (click)="openNew()">+ {{ t().novo }}</button> }
            @if (!active().length && !canCreate()) { <div class="muted small">Nenhum {{ t().one }} em andamento.</div> }
          </div>
        </section>

        @if (doneWorks().length) {
          <section class="wk-group">
            <button type="button" class="wk-group__title wk-group__toggle" (click)="showDone.set(!showDone())" [attr.aria-expanded]="showDone()">{{ showDone() ? '▾' : '▸' }} Concluídos <span>{{ doneWorks().length }}</span></button>
            @if (showDone()) {
              <div class="wk-grid">@for (w of doneWorks(); track w.id) { <ng-container *ngTemplateOutlet="card; context: { $implicit: w }" /> }</div>
            }
          </section>
        }
        }
        }
      } @else if (error()) {
        <div class="muted" style="padding: 40px 0">{{ error() }}</div>
      } @else {
        <div class="muted" style="padding: 40px 0">Carregando…</div>
      }
    </div>

    <ng-template #card let-w let-isRecent="isRecent">
      <div class="wk-card" [class.wk-card--done]="!!w.completed_at" [class.wk-card--recent]="isRecent && recent().length > 0 && w.id === recent()[0].id">
        <div class="row" style="gap: 10px">
          <span class="wk-ic" [style.background]="w.completed_at ? 'var(--text-subtle)' : w.color">{{ initials(w.name) }}</span>
          <div style="min-width: 0; flex: 1">
            <a class="wk-name" [routerLink]="workLink(w)">{{ w.name }}</a>
            <div class="wk-meta">{{ isRecent ? 'aberto ' + rel(w.last_visit) : (w.description || 'Sem descrição') }}</div>
            @if (w.continues?.length || w.continued_by?.length) {
              <div class="wk-meta">@if (w.continues?.length) { Continua de {{ namesOf(w.continues) }} }@if (w.continues?.length && w.continued_by?.length) { · }@if (w.continued_by?.length) { Nova versão: {{ namesOf(w.continued_by) }} }</div>
            }
          </div>
          @if (w.my_role === 'manage') {
            <div class="wk-actions">
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="openEdit(w)" [attr.aria-label]="'Editar ' + t().one" [title]="'Editar ' + t().one"><app-icon name="gear" [size]="14" /></button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="toggleDone(w)" [attr.aria-label]="w.completed_at ? 'Reabrir ' + t().one : 'Marcar como concluído'" [title]="w.completed_at ? 'Reabrir ' + t().one : 'Marcar como concluído'"><app-icon name="check" [size]="14" /></button>
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
            @else if (w.due_date) { <span class="muted">prazo {{ due(w.due_date) }}</span> }
          </div>
          <div class="wk-bar"><span [style.width.%]="pct(w)" [class.wk-bar--late]="w.tasks_overdue && !w.completed_at" [class.wk-bar--done]="!!w.completed_at"></span></div>
        </div>
        } @else {
          <div class="row wk-progress-head"><span class="muted">Você acompanha como solicitante</span>
            @if (w.completed_at) { <span class="wk-ok">concluído {{ due(w.completed_at.slice(0, 10)) }}</span> }
            @else if (w.due_date) { <span class="muted">prazo {{ due(w.due_date) }}</span> }
          </div>
        }
        <div class="row wk-foot">
          @if (view() !== 'kanban' && w.phase_name) {
            <span class="phase-chip" [style.--phase]="w.phase_color">{{ w.phase_name }}</span>
          }
          @if (w.owners?.length) {
            <span class="row" style="gap: 6px" [title]="'Responsáveis: ' + ownerNames(w)"><span class="wk-avatars">@for (o of w.owners.slice(0, 3); track o.id) { <app-avatar [person]="o" /> }</span>{{ w.owners[0].name.split(' ')[0] }}@if (w.owners.length > 1) { <span class="muted"> +{{ w.owners.length - 1 }}</span> }@if (w.due_date && (w.tasks_overdue || w.tasks_blocked)) { <span class="muted"> · prazo {{ due(w.due_date) }}</span> }</span>
          } @else if (w.owner_name) {
            <span class="row" style="gap: 6px"><app-avatar [person]="{ name: w.owner_name, initials: w.owner_initials || '', color: w.owner_color || '' }" />{{ w.owner_name.split(' ')[0] }}@if (w.due_date && (w.tasks_overdue || w.tasks_blocked)) { <span class="muted"> · prazo {{ due(w.due_date) }}</span> }</span>
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
              <label>Responsáveis</label>
              <div class="row" style="flex-wrap: wrap; gap: 6px">
                @for (m of chosenOwners(); track m.id) {
                  <span class="pill"><app-avatar [person]="m" />{{ m.name }}<button type="button" (click)="toggleOwner(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button></span>
                }
              </div>
              <select #ok class="select" (change)="toggleOwner(+ok.value); ok.value = ''" aria-label="Adicionar responsável">
                <option value="">Adicionar responsável…</option>
                @for (u of ownerCandidates(); track u.id) { <option [value]="u.id">{{ u.name }}{{ !isBoard() && u.team_name ? ' · ' + u.team_name : '' }}</option> }
              </select>
              @if (!ownerIds().length) { <span class="hint" style="color: var(--danger)">Escolha pelo menos um responsável.</span> }
              @else { <span class="hint">Quem toca o {{ t().one }}. Todos os responsáveis podem editar e mover o {{ t().one }}.</span> }
            </div>
            <div class="fields">
              <div class="field"><label for="wk-s">Data inicial</label><input id="wk-s" type="date" class="input" [ngModel]="form.start_date" (ngModelChange)="onStart($event)" /></div>
              <div class="field"><label for="wk-p">Data final</label><input id="wk-p" type="date" class="input" [min]="form.start_date || ''" [ngModel]="form.due_date" (ngModelChange)="onDue($event)" /></div>
            </div>
            @if (spanError()) { <span class="hint" style="margin-top: -6px; color: var(--danger)">A data final deve ser igual ou depois da inicial.</span> }
            @else if (form.start_date && form.due_date) { <span class="hint" style="margin-top: -6px">{{ span() }} {{ span() === 1 ? 'dia útil' : 'dias úteis' }} na linha do tempo. Pessoas diferentes andam em paralelo; o mesmo responsável empurra a fila.</span> }
            @else if (form.start_date && phaseDays()) { <span class="hint" style="margin-top: -6px">Roteiro da equipe: {{ phaseDays() }} {{ phaseDays() === 1 ? 'dia útil' : 'dias úteis' }}. O prazo é preenchido sozinho.</span> }
            @if (impact(); as imp) {
              @if (imp.conflicts.length) {
                <div class="wk-impact">
                  <p>Estas datas coincidem com outros {{ t().many }} do mesmo responsável. Se continuar, a fila dele é empurrada.</p>
                  <ul>
                    @for (c of imp.conflicts; track c.work_id) {
                      <li>
                        <span><b>{{ c.name }}</b>@if (c.owner_names.length) { <span class="muted"> · {{ c.owner_names.join(', ') }}</span> }</span>
                        <span>{{ fmtYear(c.start) }} – {{ fmtYear(c.end) }}
                          @if (c.in_progress) { <span class="muted"> · já começou — o início fica</span> }
                          @else if (c.new_start !== c.start) { <span> · passa para {{ fmtYear(c.new_start) }} – {{ fmtYear(c.new_end) }}</span> }
                        </span>
                      </li>
                    }
                  </ul>
                  @if (imp.suggestion) {
                    <p class="muted small">Para não empurrar ninguém: {{ fmtYear(imp.suggestion.start) }} a {{ fmtYear(imp.suggestion.due) }}.</p>
                  }
                </div>
              }
            }
            <div class="field">
              <label>{{ isBoard() ? 'Solicitantes' : 'Participantes do trabalho' }}</label>
              <div class="row" style="flex-wrap: wrap; gap: 6px">
                @for (m of chosen(); track m.id) {
                  <span class="pill"><app-avatar [person]="m" />{{ m.name }}<button type="button" (click)="toggleMember(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button></span>
                }
              </div>
              <select #mk class="select" (change)="toggleMember(+mk.value); mk.value = ''" [attr.aria-label]="isBoard() ? 'Adicionar solicitante' : 'Adicionar participante'">
                <option value="">Adicionar pessoa…</option>
                @for (u of candidates(); track u.id) { <option [value]="u.id">{{ u.name }}{{ u.team_name ? ' · ' + u.team_name : '' }}</option> }
              </select>
              <span class="hint">{{ isBoard()
                ? 'Quem pediu o projeto, de qualquer área. Só acompanha: vê a fase e o histórico e é avisado a cada mudança de fase, sem ver as tarefas.'
                : 'Participantes do trabalho veem este trabalho e as tarefas dele. Quem participa do projeto inteiro vê todos os trabalhos.' }}</span>
            </div>
            @if (isBoard()) {
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
                <span class="hint">Se for uma nova versão de um projeto da equipe, escolha qual. Pode marcar mais de um.</span>
              </div>
            }
            <div class="field"><label>Cor</label>
              <div class="row">@for (c of colors; track c) {
                <button type="button" class="wk-color" [style.background]="c" [class.on]="form.color === c" (click)="form.color = c" [attr.aria-label]="'Cor ' + c"></button>
              }</div></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="cancelForm()">Cancelar</button>
            @if (impact()?.conflicts?.length) {
              <button class="btn btn-sm" [disabled]="saving()" (click)="applySuggested()">Usar data sugerida</button>
              <button class="btn btn-primary" [disabled]="!form.name.trim() || !ownerIds().length || saving() || spanError()" (click)="save(true)">Salvar e empurrar</button>
            } @else {
              <button class="btn btn-primary" [disabled]="!form.name.trim() || !ownerIds().length || saving() || spanError()" (click)="save()">{{ form.id ? 'Salvar' : 'Criar ' + t().one }}</button>
            }
          </div>
        </div>
      </div>
    }

    @if (deleting(); as w) {
      <app-confirm-delete [title]="'Excluir ' + t().one" [name]="w.name" [busy]="removing()" [message]="deleteMessage(w)"
                          (cancel)="deleting.set(null)" (confirm)="remove(w)" />
    }

  `,
})
export class ProjectWorksPage implements OnChanges {
  id = input<string>();
  teamId = input<string>();
  vista = input<string | undefined>();
  private pid = signal(0);
  team = signal<Team | null>(null);
  isBoard = computed(() => !!this.project()?.is_board);
  t = computed(() => termsFor(this.isBoard()));
  memberNames = computed(() => (this.team()?.members || []).map(m => m.name).join(', '));
  deleting = signal<Work | null>(null);
  removing = signal(false);
  view = computed<'kanban' | 'cards' | 'linha'>(() => (this.vista() === 'linha' ? 'linha' : this.vista() === 'cards' ? 'cards' : 'kanban'));
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
  error = signal('');
  q = signal('');
  queryText = '';
  filter = signal<Filter>('todos');
  sort = signal<Sort>('prazo');
  showDone = signal(false);
  saving = signal(false);
  phases = signal<Phase[]>([]);
  private teamOfBoard = signal<number | null>(null);
  phasesEditable = signal(false);
  editCols = computed(() => this.phasesEditable() && !this.presenting());
  presenting = signal(false);
  dragId = signal<number | null>(null);
  dropPhase = signal<number | null>(null);
  cols = new PhaseColumns({
    api: this.api, toast: this.toast, phases: () => this.phases(), teamId: () => this.teamOfBoard(),
    saved: phases => { this.phases.set(phases); this.load(); },
  });
  private phaseOf(w: Work) {
    const phases = this.phases();
    return w.phase_id && phases.some(p => p.id === w.phase_id) ? w.phase_id : phases[0]?.id;
  }
  private boardOrder = (a: Work, b: Work) => (a.board_position ?? 0) - (b.board_position ?? 0) || a.position - b.position || a.id - b.id;
  columns = computed(() => this.phases().map(phase => ({
    phase,
    works: this.visible().filter(w => this.phaseOf(w) === phase.id).sort(this.boardOrder),
  })));
  form: { id?: number; name: string; description: string; start_date: string | null; due_date: string | null; color: string; phase_id?: number | null } | null = null;
  impact = signal<SchedulePreview | null>(null);
  private autoDue = false;
  formPhase() { return this.phases().find(p => p.id === this.form?.phase_id) || null; }
  spanError() { return !!(this.form?.start_date && this.form.due_date && this.form.due_date < this.form.start_date); }
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
  private checkImpact() {
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
      this.api.schedulePreview(this.pid(), { start_date: start, due_date: due, owner_ids: owners, ...(exclude ? { exclude_id: exclude } : {}) }).subscribe({
        next: preview => {
          if (req !== this.impactReq) return;
          this.impact.set(preview.conflicts?.length ? preview : null);
        },
        error: () => {},
      });
    }, 400);
  }
  private memberIds = signal<number[]>([]);
  ownerIds = signal<number[]>([]);
  private continuesIds = signal<number[]>([]);
  private blankColor = COLORS[0];
  colors = COLORS;
  healthLabel = { no_prazo: 'No prazo', em_risco: 'Em risco', atrasado: 'Atrasado' } as const;
  filters: { key: Filter; label: string }[] = [
    { key: 'todos', label: 'Todos' }, { key: 'responsavel', label: 'Sou responsável' },
    { key: 'participo', label: 'Participo' }, { key: 'atraso', label: 'Com atraso' },
  ];

  private me = computed(() => this.auth.user()?.id);
  private matches = (w: Work, f: Filter) =>
    f === 'todos' || (f === 'responsavel' && (w.owners?.some(o => o.id === this.me()) || w.owner_id === this.me())) || (f === 'participo' && w.members.some(m => m.id === this.me()))
    || (f === 'atraso' && w.tasks_overdue > 0 && !w.completed_at);
  private visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = this.works().filter(w => this.matches(w, this.filter()) && (!q || w.name.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q)));
    const s = this.sort();
    return [...list].sort((a, b) => s === 'nome' ? a.name.localeCompare(b.name, 'pt-BR')
      : s === 'progresso' ? this.pct(b) - this.pct(a)
      : (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  });
  recent = computed(() => {
    const limit = Date.now() - 7 * 864e5;
    return this.visible().filter(w => !w.completed_at && w.last_visit && Date.parse(w.last_visit) > limit)
      .sort((a, b) => b.last_visit!.localeCompare(a.last_visit!)).slice(0, 3);
  });
  active = computed(() => { const r = new Set(this.recent().map(w => w.id)); return this.visible().filter(w => !w.completed_at && !r.has(w.id)); });
  doneWorks = computed(() => this.visible().filter(w => !!w.completed_at));
  totals = computed(() => this.works().reduce((t, w) => ({ total: t.total + w.tasks_total, done: t.done + w.tasks_done, overdue: t.overdue + w.tasks_overdue }), { total: 0, done: 0, overdue: 0 }));
  chosen = computed(() => this.memberIds().map(id => this.allPeople().find(p => p.id === id)!).filter(Boolean));
  // No quadro da equipe, quem é da equipe já participa; a lista é só de gente de fora.
  candidates = computed(() => this.allPeople().filter(p => !this.memberIds().includes(p.id) && !this.ownerIds().includes(p.id) && !(this.isBoard() && p.in_team)));
  owners = computed(() => this.isBoard() ? this.people().filter(p => p.in_team) : this.people());
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
    if (!changes['id'] && !changes['teamId']) { this.load(); return; }
    const teamId = Number(this.teamId());
    this.project.set(null); this.works.set([]); this.team.set(null); this.error.set('');
    if (!teamId) { this.pid.set(Number(this.id())); this.load(); return; }
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
          this.router.navigate(['/ti/taskhub/equipes', p.team_id], { replaceUrl: true, queryParamsHandling: 'preserve' });
          return;
        }
        this.project.set(p);
      },
      error: () => this.error.set('Projeto não encontrado ou sem acesso.'),
    });
    this.api.works(pid).subscribe({
      next: r => {
        this.works.set(r.works); this.canCreate.set(r.can_create); this.phases.set(r.phases || []);
        this.teamOfBoard.set(r.team_id);
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
  onEscape() { if (this.presenting()) this.stopPresent(); }

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
  rel(iso: string | null) { return iso ? relativeTime(iso) : ''; }

  openNew(phaseId: number | null = null) {
    const draft = this.readDraft();
    const me = this.me();
    this.blankColor = COLORS[this.works().length % COLORS.length];
    this.memberIds.set(draft?.member_ids || []);
    this.ownerIds.set(draft?.owner_ids?.length ? draft.owner_ids : (me ? [me] : []));
    this.continuesIds.set(draft?.continues_ids || []);
    this.form = {
      name: draft?.name || '', description: draft?.description || '',
      start_date: draft?.start_date || null, due_date: draft?.due_date || null,
      color: draft?.color || this.blankColor, phase_id: phaseId,
    };
    this.impact.set(null);
    this.autoDue = !this.form.due_date;
    this.checkImpact();
  }
  cancelForm() {
    if (this.form && !this.form.id) this.clearDraft();
    this.form = null;
    this.impact.set(null);
    this.impactReq++;
    if (this.impactTimer) { clearTimeout(this.impactTimer); this.impactTimer = null; }
  }
  dismissForm() {
    const f = this.form;
    if (!f) return;
    if (!f.id) {
      if (this.formIsBlank()) this.clearDraft();
      else { this.writeDraft(); this.toast.show('Rascunho salvo.'); }
    }
    this.form = null;
    this.impact.set(null);
    this.impactReq++;
    if (this.impactTimer) { clearTimeout(this.impactTimer); this.impactTimer = null; }
  }
  private draftKey() { return `taskhub_work_draft_${this.pid()}`; }
  private readDraft(): { name: string; description: string; start_date: string | null; due_date: string | null; color: string; owner_ids: number[]; member_ids: number[]; continues_ids: number[] } | null {
    try {
      const raw = localStorage.getItem(this.draftKey());
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d.name !== 'string' || typeof d.color !== 'string') return null;
      const ids = (v: unknown) => Array.isArray(v) ? v.filter(n => typeof n === 'number') : [];
      return {
        name: d.name, description: typeof d.description === 'string' ? d.description : '',
        start_date: typeof d.start_date === 'string' ? d.start_date : null,
        due_date: typeof d.due_date === 'string' ? d.due_date : null,
        color: d.color, owner_ids: ids(d.owner_ids), member_ids: ids(d.member_ids), continues_ids: ids(d.continues_ids),
      };
    } catch { return null; }
  }
  private writeDraft() {
    const f = this.form; if (!f) return;
    try {
      localStorage.setItem(this.draftKey(), JSON.stringify({
        name: f.name, description: f.description || '', start_date: f.start_date, due_date: f.due_date, color: f.color,
        owner_ids: this.ownerIds(), member_ids: this.memberIds(), continues_ids: this.continuesIds(),
      }));
    } catch { /* armazenamento cheio: o formulário fecha mesmo assim */ }
  }
  private clearDraft() { try { localStorage.removeItem(this.draftKey()); } catch { /* ignore */ } }
  private formIsBlank() {
    const f = this.form; if (!f) return true;
    const me = this.me();
    const owners = this.ownerIds();
    const onlyMe = owners.length === (me ? 1 : 0) && (!me || owners[0] === me);
    return !f.name.trim() && !(f.description || '').trim() && !f.start_date && !f.due_date
      && !this.memberIds().length && !this.continuesIds().length && onlyMe && f.color === this.blankColor;
  }
  openEdit(w: Work) {
    this.memberIds.set(w.members.map(m => m.id));
    this.ownerIds.set(w.owners?.length ? w.owners.map(o => o.id) : w.owner_id ? [w.owner_id] : []);
    this.continuesIds.set((w.continues || []).map(c => c.id));
    this.form = { id: w.id, name: w.name, description: w.description, start_date: w.start_date ?? null, due_date: w.due_date, color: w.color };
    this.impact.set(null);
    this.autoDue = false;
    this.checkImpact();
  }
  toggleMember(id: number) { if (id) this.memberIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id])); }
  toggleOwner(id: number) {
    if (!id) return;
    this.ownerIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
    this.memberIds.update(l => l.filter(x => x !== id));
    this.checkImpact();
  }

  save(push = false) {
    const f = this.form; if (!f?.name?.trim() || !this.ownerIds().length || this.spanError()) return;
    if (!push && this.impact()?.conflicts?.length) return;
    const body: Record<string, unknown> = { name: f.name.trim(), description: f.description || '', owner_ids: this.ownerIds(), due_date: f.due_date || null, color: f.color, members: this.memberIds(),
      start_date: f.start_date || null, ...(this.isBoard() ? { continues_ids: this.continuesIds() } : {}), ...(push ? { push: true } : {}) };
    this.commitSave(body, f);
  }
  private commitSave(body: Record<string, unknown>, f: { id?: number; phase_id?: number | null }) {
    this.saving.set(true);
    const req = f.id ? this.api.updateWork(f.id, body) : this.api.createWork(this.pid(), { ...body, ...(f.phase_id ? { phase_id: f.phase_id } : {}) });
    const T = this.t();
    req.subscribe({
      next: w => {
        this.saving.set(false); this.form = null; this.impact.set(null); this.load(); this.data.reloadProjects(); this.data.reloadTeams();
        if (!f.id) this.clearDraft();
        this.toast.show(f.id ? `${T.One} atualizado.` : `${T.One} criado.`);
        if (!f.id) this.router.navigate(this.workLink(w));
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
    this.api.updateWork(w.id, { done: !w.completed_at }).subscribe({
      next: () => { this.load(); this.toast.show(w.completed_at ? `${T.One} reaberto.` : `${T.One} concluído.`); },
      error: e => this.toast.error(errorMessage(e, `Não foi possível atualizar o ${T.one}.`)),
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
