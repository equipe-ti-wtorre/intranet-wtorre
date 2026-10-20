import { Component, OnChanges, OnDestroy, OnInit, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { DataService } from '../core/data.service';
import { Person, Project, Status, StatusCategory, Task, WorkDetail } from '../core/models';
import { CATEGORY_LABEL, dueLabel, dueTone, todayIso } from '../core/format';
import { businessSpan } from '../core/timeline';
import { GroupBy, SortBy, TaskListComponent } from '../shared/task-list';
import { AvatarComponent, IconComponent, PrioComponent, AutofocusDirective } from '../shared/ui';
import { WorkDashboardComponent } from '../presentation/work-dashboard.component';

type Tab = 'kanban' | 'lista' | 'dashboard' | 'config';
const VIEW_KEY = 'taskhub_project_view';

// Kanban é a visão padrão; se a pessoa preferir a lista, o sistema lembra a escolha.
function savedView(): Tab {
  try { return localStorage.getItem(VIEW_KEY) === 'lista' ? 'lista' : 'kanban'; } catch { return 'kanban'; }
}

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [RouterLink, WorkDashboardComponent, AutofocusDirective, FormsModule, TaskListComponent, AvatarComponent, IconComponent, PrioComponent],
  template: `
    <div class="page">
      @if (project(); as p) {
        @if (work(); as w) {
          <div class="crumb"><a [routerLink]="['/ti/taskhub/projetos', p.id]">‹ {{ p.name }}</a> · todos os trabalhos</div>
          <div class="page-head" style="margin-bottom:12px">
            <div class="grow">
              <div class="row" style="gap:10px">
                <span style="width:12px;height:12px;border-radius:4px" [style.background]="w.color"></span>
                <h1>{{ w.name }}</h1>
                <span class="health" [class]="'health ' + workHealth()"><i></i>{{ w.completed_at ? 'Concluído' : healthLabel[workHealth()] }}</span>
              </div>
              <div class="sub">
                {{ p.name }}
                @if (w.owner_name) { · Responsável: {{ w.owner_name }} }
                · {{ w.members.length }} {{ w.members.length === 1 ? 'participante' : 'participantes' }}
                @if (w.start_date && w.due_date) { · {{ shortDate(w.start_date) }} a {{ shortDate(w.due_date) }} }
                @else if (w.due_date) { · Até {{ shortDate(w.due_date) }} }
                @else if (w.start_date) { · Início {{ shortDate(w.start_date) }} }
                · {{ progress() }}% concluído
                @if (w.my_role === 'view') { · Você acompanha este trabalho }
              </div>
            </div>
            <div class="actions">
              @if (canCreate()) { <button class="btn btn-primary btn-sm" (click)="ui.openQuickAdd({ project_id: p.id, section_id: w.id })"><app-icon name="plus" [size]="14" />Nova tarefa</button> }
            </div>
          </div>
          @if (w.description) { <p class="muted" style="max-width:760px;margin-bottom:14px;white-space:pre-wrap">{{ w.description }}</p> }
        } @else {
          <div class="crumb"><a [routerLink]="['/ti/taskhub/projetos', p.id]">‹ {{ p.name }}</a> · trabalhos</div>
          <div class="page-head" style="margin-bottom:12px">
            <div class="grow">
              <div class="row" style="gap:10px">
                <span style="width:12px;height:12px;border-radius:4px" [style.background]="p.color"></span>
                <h1>Configurações do projeto</h1>
              </div>
              <div class="sub">{{ p.name }} · status do Kanban, participantes e detalhes valem para todos os trabalhos</div>
            </div>
          </div>
        }

        @if (work()) {
          <nav class="tabs">
            <button [class.active]="tab() === 'kanban'" (click)="setView('kanban')">Kanban</button>
            <button [class.active]="tab() === 'lista'" (click)="setView('lista')">Lista</button>
            <button [class.active]="tab() === 'dashboard'" (click)="tab.set('dashboard')">Dashboard</button>
            <button [class.active]="tab() === 'config'" (click)="tab.set('config')">Configurações</button>
          </nav>
        }

        @if (tab() === 'dashboard' && work(); as w) { <app-work-dashboard [workId]="w.id" /> }

        @if (work() && (tab() === 'kanban' || tab() === 'lista')) {
          <div class="toolbar">
            <input class="input" style="width:220px;height:30px" placeholder="Filtrar por título" [ngModel]="text()" (ngModelChange)="text.set($event)" aria-label="Filtrar" />
            <select class="select" style="width:210px;height:30px" [ngModel]="who()" (ngModelChange)="who.set($event)" aria-label="Responsável">
              <option [ngValue]="0">Todos os responsáveis</option>
              <option [ngValue]="-1">Sem responsável</option>
              @for (m of people(); track m.id) { <option [ngValue]="m.id">{{ m.name }}</option> }
            </select>
            @if (tab() === 'lista') {
              <select class="select" style="width:150px;height:30px" [ngModel]="groupBy()" (ngModelChange)="groupBy.set($event)" aria-label="Agrupar">
                <option value="status">Por status</option>
                <option value="due">Por prazo</option><option value="assignee">Por responsável</option><option value="none">Sem grupo</option>
              </select>
              <select class="select" style="width:140px;height:30px" [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)" aria-label="Ordenar">
                <option value="manual">Ordem manual</option><option value="due">Por prazo</option><option value="priority">Por prioridade</option>
              </select>
            }
            <label class="check-label" style="margin-left:auto"><input type="checkbox" [ngModel]="showClosed()" (ngModelChange)="showClosed.set($event); load()" /> Mostrar concluídas</label>
          </div>
        }

        @if (work() && tab() === 'lista') {
          <app-task-list [tasks]="filtered()" [groupBy]="groupBy()" [sortBy]="sortBy()" [statuses]="listStatuses()" [sections]="[]"
                         [showProject]="false" [canAdd]="canCreate()" (toggle)="toggle($event)" (add)="addInline($event)"
                         emptyTitle="Nenhuma tarefa" [emptyText]="canCreate() ? 'Crie a primeira com Q ou pelo botão Nova tarefa.' : ''" />
        }

        @if (work() && tab() === 'kanban') {
          <div class="board">
            @for (s of boardStatuses(); track s.id) {
              <section class="bcol" [attr.aria-label]="s.name">
                <div class="bcol-head" [class.open]="colMenu() === s.id">
                  <span class="bcol-dot" [style.background]="s.color"></span>
                  @if (renamingId() === s.id) {
                    <input class="inline grow" appAutofocus [ngModel]="s.name" (blur)="finishRename(s, $any($event.target).value)" (keydown.enter)="$any($event.target).blur()" aria-label="Nome da coluna" />
                  } @else if (canManage()) {
                    <button type="button" class="bcol-name ellipsis" (click)="startRename(s)">{{ s.name }}</button>
                  } @else {
                    <span class="ellipsis">{{ s.name }}</span>
                  }
                  <span class="n">{{ column(s.id).length }}</span>
                  @if (s.wip_limit) { <span class="wip" [class.over]="column(s.id).length > s.wip_limit" title="Limite de tarefas em andamento">limite {{ s.wip_limit }}</span> }
                  @if (canManage()) {
                    <button type="button" class="bcol-more" (click)="toggleColMenu(s.id, $event)" aria-label="Opções da coluna"><app-icon name="more" [size]="16" /></button>
                    @if (colMenu() === s.id) {
                      <div class="bcol-menu" (click)="$event.stopPropagation()">
                        <button type="button" (click)="startRename(s)"><app-icon name="pencil" [size]="14" /> Renomear</button>
                        <div class="bcol-swatches">
                          @for (c of columnColors; track c) {
                            <button type="button" [style.background]="c" [class.on]="s.color.toLowerCase() === c" (click)="paintColumn(s, c)" [attr.aria-label]="'Cor ' + c"></button>
                          }
                        </div>
                        <div class="bcol-menu-label">Tipo da coluna</div>
                        @for (c of boardCategories; track c) {
                          <button type="button" (click)="setColumnType(s, c)">
                            <span class="bcol-check">@if (s.category === c) { <app-icon name="check" [size]="14" /> }</span>
                            {{ categoryLabel[c] }}
                          </button>
                        }
                        <button type="button" [disabled]="boardIndex(s) === 0" (click)="moveBoardStatus(s, -1)"><app-icon name="back" [size]="14" /> Mover para a esquerda</button>
                        <button type="button" [disabled]="boardIndex(s) === boardStatuses().length - 1" (click)="moveBoardStatus(s, 1)"><app-icon name="arrow" [size]="14" /> Mover para a direita</button>
                        <button type="button" class="danger" (click)="colMenu.set(null); deleteStatus(s)"><app-icon name="trash" [size]="14" /> Excluir coluna</button>
                      </div>
                    }
                  }
                </div>
                <div class="bcol-body" [class.drop]="dropCol() === s.id"
                     (dragover)="$event.preventDefault(); dropCol.set(s.id)" (dragleave)="dropCol.set(null)" (drop)="dropCard($event, s, null)">
                  @for (t of column(s.id); track t.id) {
                    <article class="bcard" draggable="true" [class.dragging]="dragId() === t.id"
                             (dragstart)="dragStart($event, t)" (dragend)="dragId.set(null)"
                             (dragover)="$event.preventDefault()" (drop)="dropCard($event, s, t); $event.stopPropagation()"
                             (click)="ui.openTask(t.id)" tabindex="0" (keydown.enter)="ui.openTask(t.id)">
                      <div class="t">{{ t.title }}</div>
                      @if (t.status.category === 'blocked' && t.blocked_reason) { <div class="blocked">{{ t.blocked_reason }}</div> }
                      <div class="foot">
                        <app-prio [p]="t.priority" />
                        @if (t.due_date) { <span class="due" [class]="'due ' + tone(t)">{{ due(t.due_date) }}</span> }
                        @if (t.subtasks_total) { <span class="chip"><app-icon name="subtasks" [size]="13" />{{ t.subtasks_done }}/{{ t.subtasks_total }}</span> }
                        @if (t.is_private) { <app-icon name="lock" [size]="13" class="lock" /> }
                        <app-avatar [person]="t.assignee" />
                      </div>
                    </article>
                  }
                  @if (canCreate() && s.category !== 'done' && s.category !== 'canceled') {
                    <button class="add" (click)="ui.openQuickAdd({ project_id: p.id, section_id: work()?.id, status_id: s.id })">+ Adicionar</button>
                  }
                </div>
              </section>
            }
            @if (canManage()) {
              <button type="button" class="bcol-new" (click)="addColumn()">+ Nova coluna</button>
            }
          </div>
          @if (colMenu() !== null) { <div class="bcol-menu-scrim" (click)="colMenu.set(null)"></div> }
        }

        @if (tab() === 'config' && work(); as w) {
          <div class="settings-section">
            <div><h2>Trabalho</h2><p class="desc">Nome, descrição, responsável e período deste trabalho. As datas montam a linha do tempo do projeto.</p></div>
            <div class="stack">
              <div class="fields">
                <div class="field"><label for="wn">Nome</label><input id="wn" class="input" [disabled]="w.my_role !== 'manage'" [(ngModel)]="wform.name" /></div>
                <div class="field"><label for="wo">Responsável</label>
                  <select id="wo" class="select" [disabled]="w.my_role !== 'manage'" [(ngModel)]="wform.owner_id">
                    @for (m of people(); track m.id) { <option [ngValue]="m.id">{{ m.name }}</option> }
                  </select></div>
                <div class="field"><label for="ws">Data inicial</label><input id="ws" type="date" class="input" [disabled]="w.my_role !== 'manage'" [(ngModel)]="wform.start_date" /></div>
                <div class="field"><label for="wp">Data final</label><input id="wp" type="date" class="input" [disabled]="w.my_role !== 'manage'" [min]="wform.start_date || ''" [(ngModel)]="wform.due_date" /></div>
              </div>
              @if (wformSpanError()) { <span class="hint" style="color: var(--danger)">A data final deve ser igual ou depois da inicial.</span> }
              @else if (wform.start_date && wform.due_date) { <span class="hint">{{ wformSpan() }} {{ wformSpan() === 1 ? 'dia útil' : 'dias úteis' }} na linha do tempo.</span> }
              <div class="field"><label for="wd">Descrição</label><textarea id="wd" class="textarea" [disabled]="w.my_role !== 'manage'" [(ngModel)]="wform.description"></textarea></div>
              @if (w.my_role === 'manage') {
                <div class="row">
                  <button class="btn btn-primary btn-sm" [disabled]="wformSpanError()" (click)="saveWork()">Salvar</button>
                  <button class="btn btn-sm" (click)="toggleWorkDone()">{{ w.completed_at ? 'Reabrir trabalho' : 'Marcar como concluído' }}</button>
                </div>
              }
            </div>
          </div>
          <div class="settings-section">
            <div><h2>Participantes do trabalho</h2><p class="desc">Veem este trabalho e as tarefas dele. Quem participa do projeto inteiro vê todos os trabalhos.</p></div>
            <div>
              @for (m of w.members; track m.id) {
                <div class="status-row"><app-avatar [person]="m" /><span class="grow">{{ m.name }}</span>
                  @if (w.my_role === 'manage') { <button class="btn btn-ghost btn-sm btn-icon" (click)="removeWorkMember(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="14" /></button> }</div>
              } @empty { <div class="muted small">Ninguém além dos participantes do projeto.</div> }
              @if (w.my_role === 'manage') {
                <div class="mini-form"><select #wm class="select" (change)="addWorkMember(+wm.value); wm.value = ''" aria-label="Adicionar participante">
                  <option value="">Adicionar pessoa…</option>
                  @for (u of workCandidates(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }
                </select></div>
              }
            </div>
          </div>
          @if (canManage()) {
            <div class="settings-section">
              <div><h2>Projeto</h2><p class="desc">Status do Kanban, participantes e detalhes valem para todos os trabalhos.</p></div>
              <div class="row"><a class="btn btn-sm" [routerLink]="['/ti/taskhub/projetos', p.id, 'configuracoes']">Abrir configurações do projeto</a>
                <button class="btn btn-sm btn-danger" (click)="deleteWork()">Excluir trabalho</button></div>
            </div>
          }
        }

        @if (tab() === 'config' && !work()) {
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

          @if (p.space === 'profissional') {
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

          @if (canManage()) {
            <div class="settings-section">
              <div><h2>Arquivar ou excluir</h2><p class="desc">Arquivar tira o projeto do menu e mantém o histórico.</p></div>
              <div class="row">
                <button class="btn btn-sm" (click)="archive()">{{ p.archived ? 'Desarquivar' : 'Arquivar projeto' }}</button>
                <button class="btn btn-sm btn-danger" (click)="remove()">Excluir projeto</button>
              </div>
            </div>
          }
        }
      } @else if (error()) {
        <div class="error-text">{{ error() }}</div>
      } @else { <div class="muted">Carregando…</div> }
    </div>

    @if (blockMove()) {
      <div class="modal-scrim" (click)="blockMove.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">O que está bloqueando esta tarefa?</div>
          <div class="modal-body"><textarea class="textarea" [(ngModel)]="blockReason" placeholder="Motivo e quem pode destravar" appAutofocus></textarea></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="blockMove.set(null)">Cancelar</button>
            <button class="btn btn-primary" (click)="confirmBlock()">Marcar como bloqueada</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProjectPage implements OnInit, OnChanges, OnDestroy {
  id = input.required<string>();
  workId = input<string>();
  mode = input<string>();
  work = signal<WorkDetail | null>(null);
  wform: { name: string; description: string; owner_id: number | null; start_date: string | null; due_date: string | null } = { name: '', description: '', owner_id: null, start_date: null, due_date: null };
  wformSpanError() { return !!(this.wform.start_date && this.wform.due_date && this.wform.due_date < this.wform.start_date); }
  wformSpan() { return this.wform.start_date && this.wform.due_date ? businessSpan(this.wform.start_date, this.wform.due_date) : 0; }
  shortDate(iso: string) { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; }
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
  groupBy = signal<GroupBy>('status');
  sortBy = signal<SortBy>('manual');
  showClosed = signal(false);
  dropCol = signal<number | null>(null);
  dragId = signal<number | null>(null);
  blockMove = signal<{ task: Task; status: Status; position: number } | null>(null);
  blockReason = '';
  colMenu = signal<number | null>(null);
  renamingId = signal<number | null>(null);
  columnColors = ['#8b93a1', '#3b82f6', '#a78bfa', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#84cc16'];
  boardCategories: StatusCategory[] = ['todo', 'doing', 'blocked', 'done'];

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
  workCandidates = computed(() => { const ids = new Set((this.work()?.members || []).map(m => m.id)); return this.data.people().filter(p => !ids.has(p.id)); });
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
  boardStatuses = computed(() => (this.project()?.statuses || []).filter(s => s.category !== 'canceled' || this.showClosed()));
  nonMembers = computed(() => {
    const ids = new Set((this.project()?.members || []).map(m => m.id));
    return this.data.people().filter(p => !ids.has(p.id));
  });

  ngOnInit() { this.sub = this.ui.taskChanged$.subscribe(() => this.loadTasks()); }
  ngOnChanges() {
    const key = `${this.id()}|${this.workId() || ''}|${this.mode() || ''}`;
    if (key !== this.loadedId) { this.loadedId = key; this.tab.set(this.mode() === 'config' ? 'config' : savedView()); this.load(); }
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  load() {
    const pid = Number(this.id());
    this.project.set(null); this.error.set('');
    this.api.project(pid).subscribe({
      next: p => {
        const summary = this.data.projects().find(x => x.id === pid);
        this.project.set({ ...p, ...(summary ? { done_count: summary.done_count, total_count: summary.total_count } : {}) });
        this.form = { name: p.name, health: p.health, owner_id: p.owner_id, sector_id: p.sector_id ?? null, team_id: p.team_id ?? null, start_date: p.start_date, end_date: p.end_date, description: p.description };
      },
      error: e => this.error.set(errorMessage(e, 'Projeto não encontrado ou sem acesso.')),
    });
    this.api.projectPeople(pid).subscribe({ next: p => this.people.set(p), error: () => {} });
    this.work.set(null);
    const wid = Number(this.workId());
    if (wid) {
      this.api.work(wid).subscribe({
        next: w => { this.work.set(w); this.wform = { name: w.name, description: w.description, owner_id: w.owner_id, start_date: w.start_date ?? null, due_date: w.due_date }; },
        error: e => this.error.set(errorMessage(e, 'Trabalho não encontrado ou sem acesso.')),
      });
      this.api.visitWork(wid).subscribe({ error: () => {} });
    }
    this.loadTasks();
  }

  private reloadWork() {
    const wid = Number(this.workId()); if (!wid) return;
    this.api.work(wid).subscribe(w => this.work.set(w));
  }
  saveWork() {
    const w = this.work(); if (!w) return;
    if (this.wformSpanError()) return;
    this.api.updateWork(w.id, { ...this.wform, start_date: this.wform.start_date || null, due_date: this.wform.due_date || null }).subscribe({
      next: () => { this.reloadWork(); this.toast.show('Trabalho atualizado.'); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível salvar o trabalho.')),
    });
  }
  toggleWorkDone() {
    const w = this.work(); if (!w) return;
    this.api.updateWork(w.id, { done: !w.completed_at }).subscribe({ next: () => this.reloadWork(), error: e => this.toast.error(errorMessage(e, 'Não foi possível atualizar o trabalho.')) });
  }
  addWorkMember(uid: number) {
    const w = this.work(); if (!w || !uid) return;
    this.api.updateWork(w.id, { members: [...w.members.map(m => m.id), uid] }).subscribe({ next: () => this.reloadWork(), error: e => this.toast.error(errorMessage(e, 'Não foi possível incluir a pessoa.')) });
  }
  removeWorkMember(uid: number) {
    const w = this.work(); if (!w) return;
    this.api.updateWork(w.id, { members: w.members.map(m => m.id).filter(id => id !== uid) }).subscribe({ next: () => this.reloadWork(), error: e => this.toast.error(errorMessage(e, 'Não foi possível remover a pessoa.')) });
  }
  deleteWork() {
    const w = this.work(); if (!w) return;
    const text = w.tasks_total ? `As ${w.tasks_total} tarefas dele também serão apagadas. Não dá para desfazer.` : 'Ele não tem tarefas.';
    if (!confirm(`Excluir o trabalho ${w.name}?\n${text}`)) return;
    this.api.deleteWork(w.id).subscribe({ next: () => { this.data.reloadProjects(); this.router.navigate(['/ti/taskhub/projetos', w.project_id]); }, error: e => this.toast.error(errorMessage(e, 'Não foi possível excluir o trabalho.')) });
  }

  loadTasks() {
    const pid = Number(this.id());
    const wid = Number(this.workId());
    if (!wid) { this.tasks.set([]); return; }
    this.api.tasks({ project_id: pid, section_id: wid, status: this.showClosed() ? 'all' : 'recent' }).subscribe({
      next: t => this.tasks.set(t), error: e => this.toast.error(errorMessage(e)),
    });
  }

  column(statusId: number) {
    return this.filtered().filter(t => t.status.id === statusId).sort((a, b) => a.position - b.position);
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
    this.api.createTask({ title, project_id: Number(this.id()), ...ev.extra, section_id: this.work()?.id }).subscribe({
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

  dropCard(e: DragEvent, status: Status, before: Task | null) {
    e.preventDefault(); this.dropCol.set(null);
    const id = Number(e.dataTransfer?.getData('text/plain'));
    const t = this.tasks().find(x => x.id === id);
    this.dragId.set(null);
    if (!t || !['edit', 'work'].includes(t.access)) { if (t) this.toast.show('Só quem está com a tarefa ou o gestor pode mudá-la de coluna.'); return; }
    const col = this.column(status.id).filter(x => x.id !== id);
    let position: number;
    if (before) {
      const idx = col.findIndex(x => x.id === before.id);
      const prev = col[idx - 1]?.position ?? before.position - 1000;
      position = (prev + before.position) / 2;
    } else {
      position = (col.at(-1)?.position ?? 0) + 1000;
    }
    if (status.category === 'blocked' && t.status.id !== status.id) {
      this.blockReason = ''; this.blockMove.set({ task: t, status, position }); return;
    }
    this.move(t, status, position);
  }

  confirmBlock() {
    const m = this.blockMove(); if (!m) return;
    this.move(m.task, m.status, m.position, this.blockReason.trim() || null);
    this.blockMove.set(null);
  }

  private move(t: Task, status: Status, position: number, blocked_reason?: string | null) {
    const optimistic: Task = { ...t, position, status: { id: status.id, name: status.name, color: status.color, category: status.category } };
    this.tasks.update(l => l.map(x => (x.id === t.id ? optimistic : x)));
    const body: Record<string, unknown> = { position };
    if (status.id !== t.status.id) body['status_id'] = status.id;
    if (blocked_reason !== undefined) body['blocked_reason'] = blocked_reason;
    this.api.updateTask(t.id, body).subscribe({
      next: u => { this.tasks.update(l => l.map(x => (x.id === t.id ? u : x))); if (status.category === 'done') this.data.reloadProjects(); },
      error: e => { this.toast.error(errorMessage(e)); this.loadTasks(); },
    });
  }

  // ---- Configurações ----
  private pid() { return Number(this.id()); }
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
  toggleColMenu(id: number, event: Event) {
    event.stopPropagation();
    this.colMenu.update(cur => cur === id ? null : id);
  }
  startRename(s: Status) {
    this.colMenu.set(null);
    this.renamingId.set(s.id);
  }
  finishRename(s: Status, name: string) {
    this.renamingId.set(null);
    this.rename(s, name);
  }
  paintColumn(s: Status, color: string) {
    this.colMenu.set(null);
    if (s.color.toLowerCase() !== color) this.updateStatus(s, { color });
  }
  setColumnType(s: Status, category: StatusCategory) {
    this.colMenu.set(null);
    if (s.category !== category) this.updateStatus(s, { category });
  }
  boardIndex(s: Status) { return this.boardStatuses().findIndex(x => x.id === s.id); }
  moveBoardStatus(s: Status, dir: number) {
    const visible = this.boardStatuses();
    const neighbor = visible[this.boardIndex(s) + dir];
    this.colMenu.set(null);
    if (!neighbor) return;
    const list = [...(this.project()?.statuses || [])];
    const a = list.findIndex(x => x.id === s.id);
    const b = list.findIndex(x => x.id === neighbor.id);
    [list[a], list[b]] = [list[b], list[a]];
    this.project.update(p => (p ? { ...p, statuses: list } : p));
    this.api.orderStatuses(this.pid(), list.map(x => x.id)).subscribe({ error: e => this.toast.error(errorMessage(e)) });
  }
  addColumn() {
    const names = new Set((this.project()?.statuses || []).map(s => s.name));
    let name = 'Nova coluna';
    let n = 2;
    while (names.has(name)) name = `Nova coluna ${n++}`;
    this.api.createStatus(this.pid(), { name, category: 'doing', color: '#3b82f6' }).subscribe({
      next: created => { this.renamingId.set(created.id); this.refresh(); },
      error: e => this.toast.error(errorMessage(e)),
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
    const typed = prompt(`Excluir apaga o projeto e todas as tarefas dele. Digite o nome do projeto para confirmar:\n${p.name}`);
    if (typed !== p.name) return;
    this.api.deleteProject(p.id).subscribe({
      next: () => { this.toast.show('Projeto excluído.'); this.data.reloadProjects(); this.router.navigate(['/ti/taskhub/meu-dia']); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }
}
