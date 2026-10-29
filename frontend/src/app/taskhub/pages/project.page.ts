import { Component, OnChanges, OnDestroy, OnInit, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { DataService } from '../core/data.service';
import { Person, Phase, Project, SchedulePreview, Status, StatusCategory, Task, WorkDetail, WorkPhaseLog } from '../core/models';
import { CATEGORY_LABEL, dueLabel, dueTone, todayIso } from '../core/format';
import { businessSpan, DEFAULT_DURATION, endAfter, sumPhaseDays } from '../core/timeline';
import { GroupBy, SortBy, TaskListComponent } from '../shared/task-list';
import { AvatarComponent, IconComponent, PrioComponent, AutofocusDirective } from '../shared/ui';
import { WorkDashboardComponent } from '../presentation/work-dashboard.component';
import { PhaseColumns } from '../shared/phase-columns';
import { ConfirmDeleteComponent } from '../shared/confirm-delete.component';
import { termsFor } from '../core/format';

type Tab = 'kanban' | 'lista' | 'dashboard' | 'config';
const VIEW_KEY = 'taskhub_project_view';

// Kanban é a visão padrão; se a pessoa preferir a lista, o sistema lembra a escolha.
function savedView(): Tab {
  try { return localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'kanban'; } catch { return 'kanban'; }
}

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [RouterLink, WorkDashboardComponent, AutofocusDirective, FormsModule, TaskListComponent, AvatarComponent, IconComponent, PrioComponent, ConfirmDeleteComponent],
  template: `
    <div class="page">
      @if (project(); as p) {
        @if (work(); as w) {
          <div class="crumb"><a [routerLink]="backLink()">‹ {{ p.name }}</a> · todos os {{ t().many }}</div>
          <div class="page-head" style="margin-bottom:12px">
            <div class="grow">
              <div class="row" style="gap:10px">
                <span style="width:12px;height:12px;border-radius:4px" [style.background]="w.color"></span>
                <h1>{{ w.name }}</h1>
                <span class="health" [class]="'health ' + workHealth()"><i></i>{{ w.completed_at ? 'Concluído' : healthLabel[workHealth()] }}</span>
              </div>
              <div class="sub">
                {{ p.name }}
                @if (w.owners.length) { · {{ w.owners.length === 1 ? 'Responsável' : 'Responsáveis' }}: {{ ownerNames(w) }} }
                @else if (w.owner_name) { · Responsável: {{ w.owner_name }} }
                @if (p.is_board) {
                  @if (w.members.length) { · {{ w.members.length }} {{ w.members.length === 1 ? 'solicitante' : 'solicitantes' }} }
                } @else {
                  · {{ w.members.length }} {{ w.members.length === 1 ? 'participante' : 'participantes' }}
                }
                @if (w.start_date && w.due_date) { · {{ shortDate(w.start_date) }} a {{ shortDate(w.due_date) }} }
                @else if (w.due_date) { · Até {{ shortDate(w.due_date) }} }
                @else if (w.start_date) { · Início {{ shortDate(w.start_date) }} }
                @if (w.continues?.length) { · Continua de {{ relNames(w.continues) }} }
                @if (w.continued_by?.length) { · Nova versão: {{ relNames(w.continued_by) }} }
                @if (!following()) { · {{ progress() }}% concluído }
                @if (w.my_role === 'view') { · Você acompanha este {{ t().one }} }
              </div>
            </div>
            <div class="actions">
              @if (canCreate()) {
                <button type="button" class="btn-action-secondary btn-sm" (click)="toggleWorkDone()">{{ w.completed_at ? 'Reabrir' : 'Concluir' }}</button>
                @if (otherWorkPhases().length) {
                  <div class="act-phase">
                    <button type="button" class="btn-action-secondary btn-sm" (click)="phaseMenu.set(!phaseMenu())">Jogar para outra fase</button>
                    @if (phaseMenu()) {
                      <div class="act-phase-menu">
                        @for (f of otherWorkPhases(); track f.id) {
                          <button type="button" (click)="sendWorkPhase(f)"><i [style.background]="f.color"></i>{{ f.name }}</button>
                        }
                      </div>
                    }
                  </div>
                }
                <button class="btn btn-primary btn-sm" (click)="ui.openQuickAdd({ project_id: p.id, section_id: w.id })"><app-icon name="plus" [size]="14" />Nova tarefa</button>
              }
            </div>
          </div>
          @if (w.description) { <p class="muted" style="max-width:760px;margin-bottom:14px;white-space:pre-wrap">{{ w.description }}</p> }
        } @else {
          <div class="crumb"><a [routerLink]="backLink()">‹ {{ p.name }}</a> · {{ t().many }}</div>
          <div class="page-head" style="margin-bottom:12px">
            <div class="grow">
              <div class="row" style="gap:10px">
                <span style="width:12px;height:12px;border-radius:4px" [style.background]="p.color"></span>
                <h1>{{ p.is_board ? 'Status das tarefas da equipe' : 'Configurações do projeto' }}</h1>
              </div>
              <div class="sub">{{ p.name }} · {{ p.is_board ? 'os status valem para as tarefas de todos os projetos da equipe' : 'status do Kanban, participantes e detalhes valem para todos os trabalhos' }}</div>
            </div>
          </div>
        }

        @if (following() && work(); as w) {
          <div class="follow-panel">
            <div class="hint" style="margin-bottom: 12px">Você acompanha este projeto como solicitante. Avisamos você a cada mudança de fase e quando ele for concluído.</div>
            <div class="settings-section">
              <div><h2>Fase atual</h2><p class="desc">Onde o projeto está agora.</p></div>
              <div class="stack">
                @if (w.completed_at) { <span class="wk-ok">Concluído em {{ shortDate(w.completed_at) }}</span> }
                <div class="row" style="flex-wrap: wrap; gap: 6px">
                  @for (ph of w.phases; track ph.id; let i = $index) {
                    <span class="phase-chip" [style.opacity]="phaseState(i) === 'future' ? 0.5 : 1" [style.--phase]="ph.color"
                          [style.fontWeight]="phaseState(i) === 'current' ? 700 : 400">{{ ph.name }}@if (phaseState(i) === 'current') { · atual }</span>
                  }
                </div>
                @if (w.phase_changed_at) { <span class="hint">Desde {{ shortDate(w.phase_changed_at) }}.</span> }
              </div>
            </div>
            <div class="settings-section">
              <div><h2>Responsáveis</h2><p class="desc">Quem está tocando o projeto.</p></div>
              <div>
                @for (o of w.owners; track o.id) { <div class="status-row"><app-avatar [person]="o" /><span class="grow">{{ o.name }}</span></div> }
              </div>
            </div>
            <div class="settings-section">
              <div><h2>Histórico de fases</h2><p class="desc">Cada mudança de fase, da mais recente para a mais antiga.</p></div>
              <div>
                @for (l of phasesLog(); track l.id) {
                  <div class="status-row"><span class="phase-chip" [style.--phase]="l.phase_color">{{ l.phase_name }}</span>
                    <span class="grow muted small">{{ fullDate(l.changed_at) }}@if (l.changed_by_name) { · por {{ l.changed_by_name }} }</span></div>
                } @empty { <div class="muted small">Ainda sem mudanças de fase.</div> }
              </div>
            </div>
          </div>
        }

        @if (work() && !following()) {
          <nav class="tabs">
            <button [class.active]="tab() === 'kanban'" (click)="setView('kanban')">Kanban</button>
            <button [class.active]="tab() === 'lista'" (click)="setView('lista')">Lista</button>
            <button [class.active]="tab() === 'dashboard'" (click)="tab.set('dashboard')">Dashboard</button>
            <button [class.active]="tab() === 'config'" (click)="tab.set('config')">Configurações</button>
          </nav>
        }

        @if (tab() === 'dashboard' && !following() && work(); as w) { <app-work-dashboard [workId]="w.id" /> }

        @if (work() && !following() && (tab() === 'kanban' || tab() === 'lista')) {
          <div class="toolbar">
            <input class="input" style="width:220px;height:30px" placeholder="Filtrar por título" [ngModel]="text()" (ngModelChange)="text.set($event)" aria-label="Filtrar" />
            <select class="select" style="width:210px;height:30px" [ngModel]="who()" (ngModelChange)="who.set($event)" aria-label="Responsável">
              <option [ngValue]="0">Todos os responsáveis</option>
              <option [ngValue]="-1">Sem responsável</option>
              @for (m of people(); track m.id) { <option [ngValue]="m.id">{{ m.name }}</option> }
            </select>
            @if (tab() === 'lista') {
              <select class="select" style="width:150px;height:30px" [ngModel]="groupBy()" (ngModelChange)="groupBy.set($event)" aria-label="Agrupar">
                @if (work()?.phases?.length) { <option value="phase">Por fase</option> }
                <option value="status">Por status</option>
                <option value="due">Por prazo</option><option value="assignee">Por responsável</option><option value="none">Sem grupo</option>
              </select>
              <select class="select" style="width:140px;height:30px" [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)" aria-label="Ordenar">
                <option value="manual">Ordem manual</option><option value="due">Por prazo</option><option value="priority">Por prioridade</option>
              </select>
            }
            <label class="check-label" style="margin-left:auto"><input type="checkbox" class="switch" role="switch" [ngModel]="showClosed()" (ngModelChange)="showClosed.set($event); load()" /> Mostrar concluídas</label>
          </div>
        }

        @if (work() && !following() && tab() === 'lista') {
          <app-task-list [tasks]="filtered()" [groupBy]="groupBy()" [sortBy]="sortBy()" [statuses]="listStatuses()" [sections]="[]"
                         [phases]="work()?.phases || []" [currentPhaseId]="work()?.phase_id ?? null"
                         [showProject]="false" [canAdd]="canCreate()" (toggle)="toggle($event)" (add)="addInline($event)"
                         emptyTitle="Nenhuma tarefa" [emptyText]="canCreate() ? 'Crie a primeira com Q ou pelo botão Nova tarefa.' : ''" />
        }

        @if (work() && !following() && tab() === 'kanban') {
          <div class="board">
            @for (col of phaseColumns(); track col.key) {
              <section [class]="'bcol phase-col phase-col--' + col.state" [style.--phase]="col.phase?.color || '#8b93a1'" [attr.aria-label]="col.phase?.name || 'Sem fase'">
                <div class="bcol-head" [class.open]="!!col.phase && cols.colMenu() === col.phase.id">
                  <span class="bcol-dot" [style.background]="col.phase?.color || '#8b93a1'"></span>
                  @if (!col.phase) {
                    <span class="ellipsis">Sem fase</span>
                  } @else if (cols.renaming() === col.phase.id) {
                    <input class="inline grow" appAutofocus maxlength="60" [ngModel]="col.phase.name" aria-label="Nome da fase"
                           (blur)="cols.finishRename(col.phase, $any($event.target).value)" (keydown.enter)="$any($event.target).blur()"
                           (keydown.escape)="cols.renaming.set(null)" />
                  } @else if (editPhases()) {
                    <button type="button" class="bcol-name ellipsis" (click)="cols.startRename(col.phase)" title="Renomear fase">{{ col.phase.name }}</button>
                  } @else {
                    <span class="ellipsis">{{ col.phase.name }}</span>
                  }
                  @if (col.phase) { <span class="wk-col__dur" [title]="'Previsto: ' + (col.phase.duration_days ?? 0) + ' dias úteis'">{{ col.phase.duration_days ?? 0 }} d</span> }
                  @if (col.state === 'current') { <span class="phase-col__tag">Fase atual</span> }
                  <span class="n">{{ col.tasks.length }}</span>
                  @if (col.phase && editPhases()) {
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
                        <button type="button" [disabled]="phaseIndex(col.phase) === 0" (click)="cols.move(col.phase, -1)"><app-icon name="back" [size]="14" /> Mover para a esquerda</button>
                        <button type="button" [disabled]="phaseIndex(col.phase) === (work()?.phases?.length || 0) - 1" (click)="cols.move(col.phase, 1)"><app-icon name="arrow" [size]="14" /> Mover para a direita</button>
                        <button type="button" class="danger" [disabled]="(work()?.phases?.length || 0) === 1" (click)="cols.remove(col.phase)"><app-icon name="trash" [size]="14" /> Excluir fase</button>
                        <div class="wk-col__hint">Vale para todos os projetos da equipe.</div>
                      </div>
                    }
                  }
                </div>
                <div class="bcol-body" [class.drop]="dropCol() === col.key"
                     (dragover)="$event.preventDefault(); dropCol.set(col.key)" (dragleave)="dropCol.set(null)" (drop)="dropTask($event, col.phase, null)">
                  @for (t of col.tasks; track t.id) {
                    <article class="bcard" draggable="true" [class.dragging]="dragId() === t.id" [class.bcard--closed]="t.status.category === 'done' || t.status.category === 'canceled'"
                             (dragstart)="dragStart($event, t)" (dragend)="dragId.set(null); dropCol.set(null)"
                             (dragover)="$event.preventDefault()" (drop)="dropTask($event, col.phase, t); $event.stopPropagation()"
                             (click)="ui.openTask(t.id)" tabindex="0" (keydown.enter)="ui.openTask(t.id)">
                      <div class="t">{{ t.title }}</div>
                      @if (t.status.category === 'blocked' && t.blocked_reason) { <div class="blocked">{{ t.blocked_reason }}</div> }
                      <div class="foot">
                        <span class="status-chip" [style.--st]="t.status.color" [title]="'Status: ' + t.status.name">{{ t.status.name }}</span>
                        <app-prio [p]="t.priority" />
                        @if (t.due_date) { <span class="due" [class]="'due ' + tone(t)">{{ due(t.due_date) }}</span> }
                        @if (t.subtasks_total) { <span class="chip"><app-icon name="subtasks" [size]="13" />{{ t.subtasks_done }}/{{ t.subtasks_total }}</span> }
                        @if (t.is_private) { <app-icon name="lock" [size]="13" class="lock" /> }
                        <app-avatar [person]="t.assignee" />
                      </div>
                    </article>
                  }
                  @if (canCreate() && col.phase) {
                    <button class="add" (click)="ui.openQuickAdd({ project_id: p.id, section_id: work()?.id, phase_id: col.phase.id })">+ Adicionar</button>
                  }
                </div>
              </section>
            }
            @if (editPhases()) {
              <button type="button" class="bcol-new" (click)="cols.add()">+ Nova coluna</button>
            }
          </div>
          @if (cols.colMenu() !== null) { <div class="bcol-menu-scrim" (click)="cols.closeMenu()"></div> }
        }

        @if (tab() === 'config' && !following() && work(); as w) {
          <div class="settings-section">
            <div><h2>{{ t().One }}</h2><p class="desc">Nome, escopo, responsáveis e período deste {{ t().one }}. As datas montam a linha do tempo {{ p.is_board ? 'da equipe' : 'do projeto' }}.</p></div>
            <div class="stack">
              <div class="fields">
                <div class="field"><label for="wn">Nome</label><input id="wn" class="input" [disabled]="w.my_role !== 'manage'" [(ngModel)]="wform.name" /></div>
                <div class="field"><label for="ws">Data inicial</label><input id="ws" type="date" class="input" [disabled]="w.my_role !== 'manage'" [ngModel]="wform.start_date" (ngModelChange)="onWStart($event)" /></div>
                <div class="field"><label for="wp">Data final</label><input id="wp" type="date" class="input" [disabled]="w.my_role !== 'manage'" [min]="wform.start_date || ''" [ngModel]="wform.due_date" (ngModelChange)="onWDue($event)" /></div>
              </div>
              @if (wformSpanError()) { <span class="hint" style="color: var(--danger)">A data final deve ser igual ou depois da inicial.</span> }
              @else if (wform.start_date && wform.due_date) { <span class="hint">{{ wformSpan() }} {{ wformSpan() === 1 ? 'dia útil' : 'dias úteis' }} na linha do tempo. Pessoas diferentes andam em paralelo; o mesmo responsável empurra a fila.</span> }
              @if (wImpact(); as imp) {
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
              <div class="field"><label for="wd">Descrição/Escopo</label><textarea id="wd" class="textarea" [disabled]="w.my_role !== 'manage'" [(ngModel)]="wform.description"></textarea></div>
              <div class="field">
                <label>Responsáveis</label>
                <div class="row" style="flex-wrap: wrap; gap: 6px">
                  @for (m of chosenWorkOwners(); track m.id) {
                    <span class="pill"><app-avatar [person]="m" />{{ m.name }}@if (w.my_role === 'manage') {<button type="button" (click)="toggleWorkOwner(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button>}</span>
                  }
                </div>
                @if (w.my_role === 'manage') {
                  <select #wo class="select" (change)="toggleWorkOwner(+wo.value); wo.value = ''" aria-label="Adicionar responsável">
                    <option value="">Adicionar responsável…</option>
                    @for (u of workOwnerCandidates(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }
                  </select>
                }
                @if (!wOwnerIds().length) { <span class="hint" style="color: var(--danger)">Escolha pelo menos um responsável.</span> }
              </div>
              @if (w.my_role === 'manage') {
                <div class="row">
                  @if (wImpact()?.conflicts?.length) {
                    <button class="btn btn-sm" (click)="applyWSuggested()">Usar data sugerida</button>
                    <button class="btn btn-primary btn-sm" [disabled]="wformSpanError() || !wOwnerIds().length" (click)="saveWork(true)">Salvar e empurrar</button>
                  } @else {
                    <button class="btn btn-primary btn-sm" [disabled]="wformSpanError() || !wOwnerIds().length" (click)="saveWork()">Salvar</button>
                  }
                  <button class="btn btn-sm" (click)="toggleWorkDone()">{{ w.completed_at ? 'Reabrir ' + t().one : 'Marcar como concluído' }}</button>
                </div>
              }
            </div>
          </div>
          <div class="settings-section">
            @if (p.is_board) {
              <div><h2>Solicitantes</h2><p class="desc">Quem pediu o projeto, de qualquer área. Só acompanha: vê a fase e o histórico e é avisado a cada mudança de fase, sem ver as tarefas.</p></div>
            } @else {
              <div><h2>Participantes do trabalho</h2><p class="desc">Veem este trabalho e as tarefas dele. Quem participa do projeto inteiro vê todos os trabalhos.</p></div>
            }
            <div>
              @for (m of w.members; track m.id) {
                <div class="status-row"><app-avatar [person]="m" /><span class="grow">{{ m.name }}</span>
                  @if (w.my_role === 'manage') { <button class="btn btn-ghost btn-sm btn-icon" (click)="removeWorkMember(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="14" /></button> }</div>
              } @empty { <div class="muted small">{{ p.is_board ? 'Nenhum solicitante.' : 'Ninguém além dos participantes do projeto.' }}</div> }
              @if (w.my_role === 'manage') {
                <div class="mini-form"><select #wm class="select" (change)="addWorkMember(+wm.value); wm.value = ''" [attr.aria-label]="p.is_board ? 'Adicionar solicitante' : 'Adicionar participante'">
                  <option value="">Adicionar pessoa…</option>
                  @for (u of workCandidates(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }
                </select></div>
              }
            </div>
          </div>
          @if (p.is_board && w.my_role === 'manage') {
            <div class="settings-section">
              <div><h2>Excluir projeto</h2><p class="desc">Qualquer pessoa da equipe pode excluir. As tarefas do projeto vão junto.</p></div>
              <div class="row">
                @if (canManage()) { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/projetos', p.id, 'configuracoes']">Status das tarefas da equipe</a> }
                <button class="btn btn-sm btn-danger" (click)="deleting.set('work')">Excluir projeto</button>
              </div>
            </div>
          } @else if (canManage()) {
            <div class="settings-section">
              <div><h2>Projeto</h2><p class="desc">Status do Kanban, participantes e detalhes valem para todos os trabalhos.</p></div>
              <div class="row"><a class="btn btn-sm" [routerLink]="['/ti/taskhub/projetos', p.id, 'configuracoes']">Abrir configurações do projeto</a>
                <button class="btn btn-sm btn-danger" (click)="deleting.set('work')">Excluir trabalho</button></div>
            </div>
          }
        }

        @if (tab() === 'config' && !work()) {
          @if (!p.is_board) {
          <div class="settings-section">
            <div><h2>Detalhes</h2><p class="desc">Nome, responsável, datas e objetivo.</p></div>
            <div class="stack">
              <div class="fields">
                <div class="field"><label for="pn">Nome</label><input id="pn" class="input" [disabled]="!canManage()" [(ngModel)]="form.name" /></div>
                <div class="field"><label for="ph">Saúde</label>
                  <select id="ph" class="select" [disabled]="!canManage()" [(ngModel)]="form.health">
                    <option value="no_prazo">No prazo</option><option value="em_risco">Em risco</option><option value="atrasado">Atrasado</option>
                  </select></div>
                @if (p.space === 'profissional') {
                <div class="field"><label for="po">Gestor responsável</label>
                  <select id="po" class="select" [disabled]="!canManage()" [(ngModel)]="form.owner_id">
                    @for (m of ownerOptions(p); track m.id) { <option [ngValue]="m.id">{{ m.name }}</option> }
                  </select></div>
                <div class="field"><label for="psec">Setor</label>
                  <select id="psec" class="select" [disabled]="!canManage()" [ngModel]="form.sector_id" (ngModelChange)="setSector($event)">
                    @for (s of sectorOptions(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                  </select></div>
                @if (settingsTeams().length > 1) {
                  <div class="field"><label for="pte">Equipe</label>
                    <select id="pte" class="select" [disabled]="!canManage()" [(ngModel)]="form.team_id">
                      @for (t of settingsTeams(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
                    </select></div>
                }
                }
                <div class="field"><label for="ps">Início</label><input id="ps" type="date" class="input" [disabled]="!canManage()" [(ngModel)]="form.start_date" /></div>
                <div class="field"><label for="pe">Entrega</label><input id="pe" type="date" class="input" [disabled]="!canManage()" [(ngModel)]="form.end_date" /></div>
              </div>
              @if (p.space === 'profissional' && form.sector_id && !settingsTeams().length) {
                <div class="note-info" style="margin-top:0">Este setor ainda não tem equipe.</div>
              }
              <div class="field"><label for="pd">Objetivo</label><textarea id="pd" class="textarea" [disabled]="!canManage()" [(ngModel)]="form.description"></textarea></div>
              @if (canManage()) { <div><button class="btn btn-primary btn-sm" (click)="saveDetails()">Salvar detalhes</button></div> }
            </div>
          </div>
          }

          <div class="settings-section">
            <div><h2>Fluxo de status</h2><p class="desc">Cada status pertence a uma categoria. É a categoria que alimenta Meu Dia e painéis.</p></div>
            <div>
              @for (s of p.statuses || []; track s.id; let i = $index; let last = $last) {
                <div class="status-row">
                  <input type="color" [disabled]="!canManage()" [ngModel]="s.color" (change)="updateStatus(s, { color: $any($event.target).value })" aria-label="Cor" />
                  <input class="inline grow" [disabled]="!canManage()" [ngModel]="s.name" (blur)="rename(s, $any($event.target).value)" (keydown.enter)="$any($event.target).blur()" aria-label="Nome do status" />
                  <select class="inline" [disabled]="!canManage()" [ngModel]="s.category" (ngModelChange)="updateStatus(s, { category: $event })" aria-label="Categoria">
                    @for (c of categories; track c) { <option [ngValue]="c">{{ categoryLabel[c] }}</option> }
                  </select>
                  <input class="inline" style="width:80px" type="number" min="1" placeholder="limite" [disabled]="!canManage()" [ngModel]="s.wip_limit"
                         (change)="updateStatus(s, { wip_limit: $any($event.target).value ? +$any($event.target).value : null })" aria-label="Limite" title="Limite de tarefas na coluna" />
                  @if (canManage()) {
                    <button class="btn btn-ghost btn-sm btn-icon" [disabled]="i === 0" (click)="moveStatus(i, -1)" aria-label="Subir">↑</button>
                    <button class="btn btn-ghost btn-sm btn-icon" [disabled]="last" (click)="moveStatus(i, 1)" aria-label="Descer">↓</button>
                    <button class="btn btn-ghost btn-sm btn-icon" (click)="deleteStatus(s)" aria-label="Excluir status"><app-icon name="trash" [size]="14" /></button>
                  }
                </div>
              }
              @if (canManage()) {
                <div class="mini-form">
                  <input class="input" [(ngModel)]="newStatus" placeholder="Novo status, ex.: Homologação" (keydown.enter)="addStatus()" />
                  <select class="select" style="width:160px" [(ngModel)]="newStatusCat">
                    @for (c of categories; track c) { <option [ngValue]="c">{{ categoryLabel[c] }}</option> }
                  </select>
                  <button class="btn btn-sm" (click)="addStatus()">Adicionar</button>
                </div>
              }
            </div>
          </div>

          @if (p.space === 'profissional' && !p.is_board) {
          <div class="settings-section">
            <div><h2>Participantes</h2><p class="desc"><b>Colaborador</b>: vê o projeto e atualiza as tarefas que estão com ele. <b>Coordena</b>: cria, edita, distribui e exclui tarefas deste projeto. O responsável de um trabalho também cria tarefas naquele trabalho.</p></div>
            <div>
              @for (m of p.members || []; track m.id) {
                <div class="status-row">
                  <app-avatar [person]="m" /><span class="grow">{{ m.name }} @if (m.team_name) { <span class="muted small">· {{ m.team_name }}</span> } @if (m.id === p.owner_id) { <span class="muted small">· dono</span> }</span>
                  @if (m.can_coordinate) {
                    <select class="inline" [disabled]="!canManage()" [ngModel]="m.role" (ngModelChange)="setMember(m.id, $event)" aria-label="Papel">
                      <option value="leitor">Colaborador</option><option value="editor">Coordena</option>
                    </select>
                  } @else {
                    <span class="muted small">Colaborador</span>
                  }
                  @if (canManage() && m.id !== p.owner_id) { <button class="btn btn-ghost btn-sm btn-icon" (click)="removeMember(m.id)" aria-label="Remover"><app-icon name="x" [size]="14" /></button> }
                </div>
              }
              @if (canManage()) {
                <div class="mini-form">
                  <select class="select" [(ngModel)]="newMember">
                    <option [ngValue]="null">Escolha uma pessoa</option>
                    @for (u of nonMembers(); track u.id) { <option [ngValue]="u.id">{{ u.name }}{{ u.team_name ? ' · ' + u.team_name : '' }}</option> }
                  </select>
                  <button class="btn btn-sm" [disabled]="!newMember" (click)="setMember(newMember!, 'leitor'); newMember = null">Adicionar</button>
                </div>
              }
            </div>
          </div>
          }

          @if (canManage() && !p.is_board) {
            <div class="settings-section">
              <div><h2>Arquivar ou excluir</h2><p class="desc">Arquivar tira o projeto do menu e mantém o histórico.</p></div>
              <div class="row">
                <button class="btn btn-sm" (click)="archive()">{{ p.archived ? 'Desarquivar' : 'Arquivar projeto' }}</button>
                <button class="btn btn-sm btn-danger" (click)="deleting.set('project')">Excluir projeto</button>
              </div>
            </div>
          }
        }

        @if (deleting() === 'work' && work(); as w) {
          <app-confirm-delete [title]="'Excluir ' + t().one" [name]="w.name" [busy]="removing()" [message]="workDeleteMessage(w)"
                              (cancel)="deleting.set(null)" (confirm)="deleteWork()" />
        }
        @if (deleting() === 'project') {
          <app-confirm-delete title="Excluir projeto" [name]="p.name" [busy]="removing()"
                              [message]="'O projeto ' + p.name + ' e todos os trabalhos e tarefas dele serão apagados.'"
                              (cancel)="deleting.set(null)" (confirm)="remove()" />
        }
      } @else if (error()) {
        <div class="error-text">{{ error() }}</div>
      } @else { <div class="muted">Carregando…</div> }
    </div>

  `,
})
export class ProjectPage implements OnInit, OnChanges, OnDestroy {
  id = input<string>();
  teamId = input<string>();
  workId = input<string>();
  mode = input<string>();
  private resolvedId = signal(0);
  t = computed(() => termsFor(!!this.project()?.is_board));
  deleting = signal<'work' | 'project' | null>(null);
  removing = signal(false);
  backLink = computed(() => {
    const p = this.project();
    return p?.is_board && p.team_id ? ['/ti/taskhub/equipes', p.team_id] : ['/ti/taskhub/projetos', p?.id];
  });
  work = signal<WorkDetail | null>(null);
  wform: { name: string; description: string; start_date: string | null; due_date: string | null } = { name: '', description: '', start_date: null, due_date: null };
  wOwnerIds = signal<number[]>([]);
  wImpact = signal<SchedulePreview | null>(null);
  private wAutoDue = false;
  phasesLog = signal<WorkPhaseLog[]>([]);
  following = computed(() => this.work()?.my_role === 'follow');
  phaseMenu = signal(false);
  otherWorkPhases = computed(() => {
    const w = this.work();
    if (!w?.phases?.length) return [];
    const cur = w.phase_id ?? w.phases[0]?.id;
    return w.phases.filter(p => p.id !== cur);
  });
  ownerNames(w: WorkDetail) { return (w.owners || []).map(o => o.name).join(', '); }
  relNames(items?: { name: string }[]) { return (items || []).map(i => i.name).join(', '); }
  fullDate(iso: string) {
    const d = new Date(iso.replace(' ', 'T'));
    return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  wformSpanError() { return !!(this.wform.start_date && this.wform.due_date && this.wform.due_date < this.wform.start_date); }
  wformSpan() { return this.wform.start_date && this.wform.due_date ? businessSpan(this.wform.start_date, this.wform.due_date) : 0; }
  onWStart(v: string) {
    this.wform.start_date = v || null;
    const days = sumPhaseDays(this.work()?.phases || []) || DEFAULT_DURATION;
    if (this.wform.start_date && (this.wAutoDue || !this.wform.due_date)) {
      this.wform.due_date = endAfter(this.wform.start_date, days);
      this.wAutoDue = true;
    }
    this.checkWImpact();
  }
  onWDue(v: string) {
    this.wform.due_date = v || null;
    this.wAutoDue = false;
    this.checkWImpact();
  }
  applyWSuggested() {
    const s = this.wImpact()?.suggestion; if (!s) return;
    this.wform.start_date = s.start;
    this.wform.due_date = s.due;
    this.wAutoDue = false;
    this.checkWImpact();
  }
  private wImpactTimer: ReturnType<typeof setTimeout> | null = null;
  private wImpactReq = 0;
  private checkWImpact() {
    if (this.wImpactTimer) clearTimeout(this.wImpactTimer);
    this.wImpactReq++;
    const w = this.work();
    if (!w || !this.wform.start_date || !this.wform.due_date || !this.wOwnerIds().length || this.wformSpanError()) {
      this.wImpact.set(null);
      return;
    }
    const req = this.wImpactReq;
    const start = this.wform.start_date;
    const due = this.wform.due_date;
    const owners = this.wOwnerIds();
    this.wImpactTimer = setTimeout(() => {
      if (req !== this.wImpactReq) return;
      this.api.schedulePreview(w.project_id, { start_date: start, due_date: due, owner_ids: owners, exclude_id: w.id }).subscribe({
        next: preview => {
          if (req !== this.wImpactReq) return;
          this.wImpact.set(preview.conflicts?.length ? preview : null);
        },
        error: () => {},
      });
    }, 400);
  }
  shortDate(iso: string) { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; }
  fmtYear(iso: string) { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
  ui = inject(UiService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private data = inject(DataService);
  private router = inject(Router);

  project = signal<Project | null>(null);
  tasks = signal<Task[]>([]);
  people = signal<Person[]>([]);
  error = signal('');
  tab = signal<Tab>(savedView());
  text = signal('');
  who = signal(0);
  groupBy = signal<GroupBy>('phase');
  sortBy = signal<SortBy>('manual');
  showClosed = signal(false);
  dropCol = signal<number | null>(null);
  dragId = signal<number | null>(null);
  cols = new PhaseColumns({
    api: this.api, toast: this.toast, phases: () => this.work()?.phases || [], teamId: () => this.work()?.team_id ?? null,
    saved: phases => { this.work.update(w => (w ? { ...w, phases } : w)); this.reloadWork(); this.loadTasks(); },
  });

  categories: StatusCategory[] = ['todo', 'doing', 'blocked', 'done', 'canceled'];
  categoryLabel = CATEGORY_LABEL;
  healthLabel = { no_prazo: 'No prazo', em_risco: 'Em risco', atrasado: 'Atrasado' } as const;
  form: any = {};
  newStatus = ''; newStatusCat: StatusCategory = 'doing'; newMember: number | null = null;
  private sub?: Subscription;
  private loadedId = '';

  canManage = computed(() => this.project()?.my_role === 'manage');
  canCreate = computed(() => this.work()?.my_role === 'manage');
  workHealth = computed<'no_prazo' | 'em_risco' | 'atrasado'>(() => {
    const w = this.work(); if (!w) return 'no_prazo';
    if (w.due_date && w.due_date < todayIso() && !w.completed_at) return 'atrasado';
    return w.tasks_overdue || w.tasks_blocked ? 'em_risco' : 'no_prazo';
  });
  workCandidates = computed(() => {
    const ids = new Set([...(this.work()?.members || []).map(m => m.id), ...this.wOwnerIds()]);
    const team = this.project()?.is_board ? new Set(this.people().filter(p => p.in_team).map(p => p.id)) : new Set<number>();
    return this.data.people().filter(p => !ids.has(p.id) && !team.has(p.id));
  });
  workOwners = computed(() => this.project()?.is_board ? this.people().filter(p => p.in_team) : this.people());
  chosenWorkOwners = computed(() => {
    const known = [...this.people(), ...(this.work()?.owners || [])];
    return this.wOwnerIds().map(id => known.find(p => p.id === id)!).filter(Boolean);
  });
  workOwnerCandidates = computed(() => this.workOwners().filter(p => !this.wOwnerIds().includes(p.id)));
  toggleWorkOwner(id: number) {
    if (id) this.wOwnerIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
    this.checkWImpact();
  }
  ownerOptions(p: Project) {
    return (p.members || []).filter(m => m.can_coordinate || m.id === p.owner_id);
  }
  sectorOptions() {
    const current = this.project();
    const list = this.data.sectors().filter(s => s.can_dashboard);
    if (current?.sector_id && !list.some(s => s.id === current.sector_id)) {
      return [{ id: current.sector_id, name: current.sector_name || 'Setor atual' }, ...list];
    }
    return list;
  }
  settingsTeams() {
    const id = this.form?.sector_id;
    return id ? this.data.teams().filter(t => t.sector_id === id) : [];
  }
  setSector(id: number) {
    this.form.sector_id = id;
    const teams = this.data.teams().filter(t => t.sector_id === id);
    if (!teams.some(t => t.id === this.form.team_id)) this.form.team_id = teams[0]?.id ?? null;
  }
  progress = computed(() => {
    const w = this.work();
    if (w) return w.tasks_total ? Math.round((w.tasks_done / w.tasks_total) * 100) : 0;
    const p = this.project();
    return p?.total_count ? Math.round(((p.done_count || 0) / p.total_count) * 100) : 0;
  });
  filtered = computed(() => {
    const q = this.text().trim().toLowerCase(); const w = this.who(); const hidden = this.ui.hidden();
    return this.tasks().filter(t => !hidden.has(t.id) && (!q || t.title.toLowerCase().includes(q))
      && (w === 0 || (w === -1 ? !t.assignee : t.assignee?.id === w)));
  });
  listStatuses = computed(() => (this.project()?.statuses || []).filter(s => this.showClosed() || !['done', 'canceled'].includes(s.category) || this.tasks().some(t => t.status.id === s.id)));
  editPhases = computed(() => !!this.work()?.phases_editable);
  // Colunas do Kanban = fases do setor (as mesmas do Kanban de trabalhos). "Sem fase" só aparece se tiver tarefa.
  phaseColumns = computed(() => {
    const phases = this.work()?.phases || [];
    const ids = new Set(phases.map(p => p.id));
    const byPos = (l: Task[]) => [...l].sort((a, b) => a.position - b.position);
    const tasks = this.filtered();
    const cols = phases.map((phase, i) => ({
      key: phase.id, phase: phase as Phase | null, state: this.phaseState(i) as string,
      tasks: byPos(tasks.filter(t => t.phase?.id === phase.id)),
    }));
    const loose = tasks.filter(t => !t.phase || !ids.has(t.phase.id));
    return loose.length ? [{ key: 0, phase: null, state: 'none', tasks: byPos(loose) }, ...cols] : cols;
  });
  phaseIndex(ph: Phase) { return (this.work()?.phases || []).findIndex(p => p.id === ph.id); }
  nonMembers = computed(() => {
    const ids = new Set((this.project()?.members || []).map(m => m.id));
    return this.data.people().filter(p => !ids.has(p.id));
  });

  ngOnInit() { this.sub = this.ui.taskChanged$.subscribe(() => this.loadTasks()); }
  ngOnChanges() {
    const key = `${this.id()}|${this.teamId() || ''}|${this.workId() || ''}|${this.mode() || ''}`;
    if (key === this.loadedId) return;
    this.loadedId = key;
    this.tab.set(this.mode() === 'config' ? 'config' : savedView());
    this.deleting.set(null);
    const teamId = Number(this.teamId());
    if (!teamId) { this.resolvedId.set(Number(this.id())); this.load(); return; }
    this.project.set(null); this.error.set('');
    this.api.teamBoard(teamId).subscribe({
      next: r => { this.resolvedId.set(r.project_id); this.load(); },
      error: () => this.error.set('Equipe não encontrada ou sem acesso.'),
    });
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  load() {
    const pid = this.pid();
    const wid = Number(this.workId());
    if (!pid) return;
    this.project.set(null); this.error.set('');
    this.api.project(pid).subscribe({
      next: p => {
        // Projeto da equipe abre pelo endereço da equipe; o quadro em si não tem tela própria fora da configuração de status.
        if (p.is_board && p.team_id && !this.teamId() && (wid || this.mode() !== 'config')) {
          this.router.navigate(['/ti/taskhub/equipes', p.team_id, ...(wid ? ['projetos', wid] : [])], { replaceUrl: true });
          return;
        }
        if (p.my_role === 'partial' && !wid) { this.router.navigate(p.is_board && p.team_id ? ['/ti/taskhub/equipes', p.team_id] : ['/ti/taskhub/projetos', pid]); return; }
        const summary = this.data.projects().find(x => x.id === pid);
        this.project.set({ ...p, ...(summary ? { done_count: summary.done_count, total_count: summary.total_count } : {}) });
        this.form = { name: p.name, health: p.health, owner_id: p.owner_id, sector_id: p.sector_id ?? null, team_id: p.team_id ?? null, start_date: p.start_date, end_date: p.end_date, description: p.description };
      },
      error: e => this.error.set(errorMessage(e, 'Projeto não encontrado ou sem acesso.')),
    });
    this.api.projectPeople(pid).subscribe({ next: p => this.people.set(p), error: () => {} });
    this.work.set(null);
    this.phasesLog.set([]);
    if (wid) {
      this.api.work(wid).subscribe({
        next: w => {
          this.setWork(w);
          if (w.my_role === 'follow') this.api.workPhasesLog(wid).subscribe({ next: l => this.phasesLog.set(l), error: () => {} });
          else this.loadTasks();
        },
        error: e => this.error.set(errorMessage(e, this.teamId() ? 'Projeto não encontrado ou sem acesso.' : 'Trabalho não encontrado ou sem acesso.')),
      });
      this.api.visitWork(wid).subscribe({ error: () => {} });
    } else {
      this.loadTasks();
    }
  }

  private setWork(w: WorkDetail) {
    this.work.set(w);
    this.wform = { name: w.name, description: w.description, start_date: w.start_date ?? null, due_date: w.due_date };
    this.wOwnerIds.set(w.owners?.length ? w.owners.map(o => o.id) : w.owner_id ? [w.owner_id] : []);
    this.wImpact.set(null);
    this.wAutoDue = false;
    this.checkWImpact();
  }
  private reloadWork() {
    const wid = Number(this.workId()); if (!wid) return;
    this.api.work(wid).subscribe(w => this.setWork(w));
  }
  private currentPhaseIndex = computed(() => {
    const w = this.work(); if (!w) return 0;
    return Math.max(0, w.phases.findIndex(p => p.id === w.phase_id));
  });
  phaseState(i: number): 'past' | 'current' | 'future' {
    const cur = this.currentPhaseIndex();
    return i < cur ? 'past' : i === cur ? 'current' : 'future';
  }
  saveWork(push = false) {
    const w = this.work(); if (!w) return;
    if (this.wformSpanError() || !this.wOwnerIds().length) return;
    if (!push && this.wImpact()?.conflicts?.length) return;
    const body: Record<string, unknown> = { ...this.wform, owner_ids: this.wOwnerIds(), start_date: this.wform.start_date || null, due_date: this.wform.due_date || null, ...(push ? { push: true } : {}) };
    this.commitWork(w.id, body);
  }
  private commitWork(id: number, body: Record<string, unknown>) {
    this.api.updateWork(id, body).subscribe({
      next: () => { this.wImpact.set(null); this.reloadWork(); this.toast.show(`${this.t().One} atualizado.`); },
      error: e => {
        if (e?.status === 409 && e?.error?.conflicts) { this.wImpact.set(e.error); return; }
        this.toast.error(errorMessage(e, `Não foi possível salvar o ${this.t().one}.`));
      },
    });
  }
  toggleWorkDone() {
    const w = this.work(); if (!w) return;
    this.phaseMenu.set(false);
    const closing = !w.completed_at;
    this.api.updateWork(w.id, { done: closing }).subscribe({
      next: () => {
        this.reloadWork();
        this.toast.show(closing ? `${this.t().One} concluído. Permanece nesta fase.` : `${this.t().One} reaberto.`);
      },
      error: e => this.toast.error(errorMessage(e, `Não foi possível atualizar o ${this.t().one}.`)),
    });
  }
  sendWorkPhase(f: Phase) {
    const w = this.work(); if (!w) return;
    this.phaseMenu.set(false);
    this.api.setWorkPhase(w.id, f.id).subscribe({
      next: () => { this.reloadWork(); this.toast.show(`${this.t().One} enviado para ${f.name}.`); },
      error: e => this.toast.error(errorMessage(e, `Não foi possível mudar a fase do ${this.t().one}.`)),
    });
  }
  addWorkMember(uid: number) {
    const w = this.work(); if (!w || !uid) return;
    this.api.updateWork(w.id, { members: [...w.members.map(m => m.id), uid] }).subscribe({ next: () => this.reloadWork(), error: e => this.toast.error(errorMessage(e, 'Não foi possível incluir a pessoa.')) });
  }
  removeWorkMember(uid: number) {
    const w = this.work(); if (!w) return;
    this.api.updateWork(w.id, { members: w.members.map(m => m.id).filter(id => id !== uid) }).subscribe({ next: () => this.reloadWork(), error: e => this.toast.error(errorMessage(e, 'Não foi possível remover a pessoa.')) });
  }
  workDeleteMessage(w: WorkDetail) {
    if (!w.tasks_total) return `O ${this.t().one} ${w.name} não tem tarefas.`;
    const tasks = w.tasks_total === 1 ? 'A única tarefa dele' : `As ${w.tasks_total} tarefas dele`;
    return `${tasks}, com etapas, comentários e anexos, também serão apagadas.`;
  }
  deleteWork() {
    const w = this.work(); if (!w) return;
    const T = this.t();
    const back = this.backLink();
    this.removing.set(true);
    this.api.deleteWork(w.id).subscribe({
      next: () => {
        this.removing.set(false); this.deleting.set(null);
        this.data.reloadProjects(); this.data.reloadTeams(); this.toast.show(`${T.One} excluído.`);
        this.router.navigate(back);
      },
      error: e => { this.removing.set(false); this.toast.error(errorMessage(e, `Não foi possível excluir o ${T.one}.`)); },
    });
  }

  loadTasks() {
    const pid = this.pid();
    const wid = Number(this.workId());
    if (!wid || this.following()) { this.tasks.set([]); return; }
    this.api.tasks({ project_id: pid, section_id: wid, status: this.showClosed() ? 'all' : 'recent' }).subscribe({
      next: t => this.tasks.set(t), error: e => this.toast.error(errorMessage(e)),
    });
  }

  due(iso: string) { return dueLabel(iso); }
  tone(t: Task) { return dueTone(t); }

  toggle(t: Task) {
    this.api.updateTask(t.id, { done: t.status.category !== 'done' }).subscribe({
      next: u => { this.tasks.update(l => l.map(x => (x.id === t.id ? u : x))); this.data.reloadProjects(); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  addInline(ev: { title: string; extra: Record<string, unknown> }) {
    const title = ev.title.trim(); if (!title) return;
    this.api.createTask({ title, project_id: this.pid(), ...ev.extra, section_id: this.work()?.id }).subscribe({
      next: t => { this.tasks.update(l => [...l, t]); this.data.reloadProjects(); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  setView(v: 'kanban' | 'lista') {
    this.tab.set(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  }

  // ---- Kanban ----
  dragStart(e: DragEvent, t: Task) { e.dataTransfer?.setData('text/plain', String(t.id)); this.dragId.set(t.id); }

  // Soltar sobre um card coloca antes dele; no vazio da coluna, no fim. Trocar de coluna muda a fase da tarefa.
  dropTask(e: DragEvent, phase: Phase | null, before: Task | null) {
    e.preventDefault(); this.dropCol.set(null);
    const id = Number(e.dataTransfer?.getData('text/plain'));
    const t = this.tasks().find(x => x.id === id);
    this.dragId.set(null);
    if (!t || before?.id === t.id) return;
    if (!['edit', 'work'].includes(t.access)) { this.toast.show('Só quem está com a tarefa ou o gestor pode mudá-la de fase.'); return; }
    const col = (this.phaseColumns().find(c => c.key === (phase?.id ?? 0))?.tasks || []).filter(x => x.id !== id);
    let position: number;
    if (before) {
      const idx = col.findIndex(x => x.id === before.id);
      const prev = col[idx - 1]?.position ?? before.position - 1000;
      position = (prev + before.position) / 2;
    } else {
      position = (col.at(-1)?.position ?? 0) + 1000;
    }
    const moved = (t.phase?.id ?? null) !== (phase?.id ?? null);
    const body: Record<string, unknown> = { position };
    if (moved) body['phase_id'] = phase?.id ?? null;
    this.tasks.update(l => l.map(x => (x.id === t.id ? { ...t, position, phase: phase ? { id: phase.id, name: phase.name, color: phase.color } : null } : x)));
    this.api.updateTask(t.id, body).subscribe({
      next: u => { this.tasks.update(l => l.map(x => (x.id === t.id ? u : x))); if (moved && phase) this.toast.show(`Tarefa passou para ${phase.name}.`); },
      error: err => { this.toast.error(errorMessage(err, 'Não foi possível mover a tarefa.')); this.loadTasks(); },
    });
  }

  // ---- Configurações ----
  private pid() { return this.resolvedId(); }
  private refresh() { this.api.project(this.pid()).subscribe(p => this.project.update(cur => ({ ...(cur || {}), ...p }) as Project)); }

  saveDetails() {
    const body = { ...this.form, start_date: this.form['start_date'] || null, end_date: this.form['end_date'] || null };
    delete body.sector_id;
    if (this.project()?.space !== 'profissional' || !body.team_id) delete body.team_id;
    if (body.owner_id === this.project()?.owner_id) delete body.owner_id;
    if (this.project()?.space === 'profissional' && this.form.sector_id && !this.form.team_id) {
      this.toast.error('Este setor ainda não tem equipe.');
      return;
    }
    this.api.updateProject(this.pid(), body).subscribe({
      next: () => { this.toast.show('Projeto atualizado.'); this.refresh(); this.data.reloadProjects(); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }
  updateStatus(s: Status, body: Partial<Status>) {
    this.api.updateStatus(this.pid(), s.id, body).subscribe({ next: () => { this.refresh(); this.loadTasks(); }, error: e => this.toast.error(errorMessage(e)) });
  }
  rename(s: Status, name: string) { if (name.trim() && name.trim() !== s.name) this.updateStatus(s, { name: name.trim() }); }
  moveStatus(i: number, dir: number) {
    const list = [...(this.project()?.statuses || [])];
    const [s] = list.splice(i, 1); list.splice(i + dir, 0, s);
    this.project.update(p => (p ? { ...p, statuses: list } : p));
    this.api.orderStatuses(this.pid(), list.map(x => x.id)).subscribe({ error: e => this.toast.error(errorMessage(e)) });
  }
  addStatus() {
    if (!this.newStatus.trim()) return;
    this.api.createStatus(this.pid(), { name: this.newStatus.trim(), category: this.newStatusCat }).subscribe({
      next: () => { this.newStatus = ''; this.refresh(); }, error: e => this.toast.error(errorMessage(e)),
    });
  }
  deleteStatus(s: Status) {
    const others = (this.project()?.statuses || []).filter(x => x.id !== s.id);
    if (!others.some(x => x.category === 'todo') || !others.some(x => x.category === 'done')) {
      this.toast.error('O quadro precisa manter ao menos uma coluna A fazer e uma Concluído.');
      return;
    }
    const target = others.find(x => x.category === s.category) || others.find(x => x.category === 'todo');
    if (!target) return;
    const count = this.tasks().filter(t => t.status.id === s.id).length;
    if (count && !confirm(`${count} tarefa(s) em "${s.name}" vão para "${target.name}". Continuar?`)) return;
    this.api.deleteStatus(this.pid(), s.id, target.id).subscribe({ next: () => { this.refresh(); this.loadTasks(); }, error: e => this.toast.error(errorMessage(e)) });
  }
  setMember(userId: number, role: string) {
    this.api.setProjectMember(this.pid(), userId, role).subscribe({ next: () => { this.refresh(); this.api.projectPeople(this.pid()).subscribe(p => this.people.set(p)); }, error: e => this.toast.error(errorMessage(e)) });
  }
  removeMember(userId: number) {
    this.api.removeProjectMember(this.pid(), userId).subscribe({ next: () => this.refresh(), error: e => this.toast.error(errorMessage(e)) });
  }
  archive() {
    const p = this.project(); if (!p) return;
    this.api.updateProject(p.id, { archived: !p.archived }).subscribe({
      next: () => { this.toast.show(p.archived ? 'Projeto desarquivado.' : 'Projeto arquivado.'); this.data.reloadProjects(); this.refresh(); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }
  remove() {
    const p = this.project(); if (!p) return;
    this.removing.set(true);
    this.api.deleteProject(p.id).subscribe({
      next: () => {
        this.removing.set(false); this.deleting.set(null);
        this.toast.show('Projeto excluído.'); this.data.reloadProjects(); this.router.navigate(['/ti/taskhub/meu-dia']);
      },
      error: e => { this.removing.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
