import { Component, ElementRef, OnChanges, ViewChild, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { Person, Phase, Status, Subtask, TaskDetail, TimelineEntry } from '../core/models';
import { PRIORITIES, SIZES, activityValue, dueLabel, stamp, termsFor, todayIso } from '../core/format';
import { AvatarComponent, IconComponent, RichTextComponent, AutofocusDirective } from '../shared/ui';
import { takeBulletLine } from '../core/steps-text';
import { concat, toArray } from 'rxjs';

const ACTIVITY_TEXT: Record<string, string> = {
  created: 'criou a tarefa',
  status_changed: 'mudou o status para',
  assignee_changed: 'mudou o responsável para',
  due_changed: 'mudou o prazo para',
  priority_changed: 'mudou a prioridade para',
  title_changed: 'renomeou para',
  project_changed: 'moveu para o projeto',
  phase_changed: 'mudou a fase para',
  step_done: 'concluiu a etapa',
};

@Component({
  selector: 'app-task-drawer',
  standalone: true,
  imports: [AutofocusDirective, FormsModule, RouterLink, AvatarComponent, IconComponent, RichTextComponent],
  template: `
    <div class="task-modal-scrim" (click)="ui.closeTask()">
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Detalhes da tarefa" (click)="$event.stopPropagation()">
      <div class="drawer-head">
        @if (task(); as t) {
          @if (t.project) {
            @if (seesProject()) {
              <a class="proj-tag" [routerLink]="t.section ? ['/ti/taskhub/projetos', t.project.id, 'trabalhos', t.section.id] : ['/ti/taskhub/projetos', t.project.id]" (click)="ui.closeTask()"><i [style.background]="t.project.color"></i>{{ t.project.name }}@if (t.section) { · {{ t.section.name }} }</a>
            } @else {
              <span class="proj-tag" title="Você participa desta tarefa, não do projeto inteiro"><i [style.background]="t.project.color"></i>{{ t.project.name }}</span>
            }
          } @else { <span class="muted small">Sem projeto</span> }
          @if (t.space === 'pessoal') { <span class="space-chip">Individual · só você vê</span> }
        }
        <span class="grow"></span>
        @if (task()) {
          <button class="btn btn-sm btn-ghost dh-day" (click)="planToday()" title="Adicionar ao Meu Dia de hoje"><app-icon name="sun" [size]="14" />Meu Dia</button>
          @if (editable()) {
            <button class="btn btn-sm btn-ghost btn-icon dh-del" (click)="remove()" title="Excluir" aria-label="Excluir tarefa"><app-icon name="trash" [size]="14" /></button>
          }
        }
        <button class="btn btn-sm btn-ghost btn-icon dh-close" (click)="ui.closeTask()" aria-label="Fechar"><app-icon name="x" [size]="14" /></button>
      </div>

      <div class="drawer-body">
        @if (loading()) { <div class="muted">Carregando…</div> }
        @if (error()) { <div class="error-text">{{ error() }}</div> }
        @if (task(); as t) {
          <textarea #titleEl class="drawer-title" rows="1" [readOnly]="!editable()" [ngModel]="t.title"
                    (ngModelChange)="draftTitle = $event; autosize()" (blur)="saveTitle()"
                    (keydown.enter)="$event.preventDefault(); titleEl.blur()" aria-label="Título"></textarea>

          @if (t.access === 'view') {
            <div class="note-info">Você acompanha esta tarefa (só leitura).</div>
          } @else if (t.access === 'work') {
            <div class="note-info">Tarefa criada por {{ t.created_by?.name }}. Você atualiza o status, a estimativa, o bloqueio e as etapas, e pode comentar. O restante quem altera é o gestor.</div>
          } @else if (!seesProject() && t.project) {
            <div class="note-info">
              @if (t.assignee?.id === me || t.created_by?.id === me) { Você está nesta tarefa, não no projeto inteiro: o resto do projeto continua visível só para os participantes. }
              @else { Você participa desta tarefa por uma etapa (destacada abaixo). Pode comentar e concluir a sua parte. }
            </div>
          }
          @if (t.status.category === 'blocked' && t.blocked_reason) {
            <div class="blocked-note"><b>Bloqueada:</b> {{ t.blocked_reason }}</div>
          }
          @if (myTurn(); as s) {
            <div class="step-turn">
              <div class="grow">
                <div class="step-turn-k">Sua vez</div>
                <div class="step-turn-t">{{ s.title }}@if (s.due_date) { <span class="muted small"> · {{ dueText(s.due_date) }}</span> }</div>
              </div>
              <button class="btn btn-primary btn-sm" (click)="openFinish(s)"><app-icon name="check" [size]="14" />Concluí minha parte</button>
            </div>
          }

          <div class="props">
            <div class="k">Status</div>
            <div class="v">
              @if (t.project) {
                <select class="inline" [disabled]="!working()" [ngModel]="statusPick() ?? t.status.id" (ngModelChange)="setStatus($event)" aria-label="Status">
                  @for (s of t.statuses; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                </select>
              } @else {
                <label class="check-label"><input type="checkbox" [disabled]="!working()" [checked]="t.status.category === 'done'" (change)="patch({ done: t.status.category !== 'done' })" /> Concluída</label>
              }
            </div>

            <div class="k">Responsável</div>
            @if (t.space === 'pessoal') { <div class="v"><app-avatar [person]="t.assignee" /> Você</div> } @else {
            <div class="v">
              <app-avatar [person]="t.assignee" />
              <select class="inline grow" [disabled]="!editable()" [ngModel]="t.assignee?.id ?? null" (ngModelChange)="patch({ assignee_id: $event })" aria-label="Responsável">
                <option [ngValue]="null">Sem responsável</option>
                <optgroup [label]="t.project ? 'Participantes do projeto' : 'Pessoas'">
                  @for (p of teamPeople(); track p.id) { <option [ngValue]="p.id">{{ p.name }}{{ p.team_name ? ' · ' + p.team_name : '' }}{{ away(p) }}</option> }
                </optgroup>
                @if (otherPeople().length) {
                  <optgroup label="Outras pessoas (veem só esta tarefa)">
                    @for (p of otherPeople(); track p.id) { <option [ngValue]="p.id">{{ p.name }} · {{ p.team_name || 'sem equipe' }}{{ away(p) }}</option> }
                  </optgroup>
                }
              </select>
            </div>
            }
            @if (assigneeAway(); as away) {
              <div class="k"></div><div class="v small" style="color:var(--warn)">{{ away }}</div>
            }

            <div class="k" title="Quem participou ou pediu. Só registro: ninguém é avisado nem ganha acesso.">Alinhado com</div>
            <div class="v" style="flex-wrap: wrap; gap: 6px">
              @for (c of t.contacts || []; track c.id) {
                <span class="pill"><app-avatar [person]="c" />{{ c.name }}
                  @if (editable()) { <button type="button" (click)="toggleContact(c.id)" [attr.aria-label]="'Remover ' + c.name"><app-icon name="x" [size]="12" /></button> }
                </span>
              }
              @if (editable()) {
                <select #ct class="inline" (change)="toggleContact(+ct.value); ct.value = ''" aria-label="Adicionar pessoa com quem foi alinhado">
                  <option value="">{{ t.contacts?.length ? '+ pessoa' : 'Adicionar pessoa…' }}</option>
                  @for (p of contactCandidates(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.sector_name ? ' · ' + p.sector_name : '' }}</option> }
                </select>
              } @else if (!t.contacts?.length) { <span class="muted">—</span> }
            </div>

            <div class="k">Data</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.aligned_on" (change)="setAlignedOn($any($event.target).value || null)" aria-label="Data do alinhamento" /></div>

            <div class="k">Início</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.start_date" (change)="patch({ start_date: $any($event.target).value || null })" aria-label="Data de início" /></div>

            <div class="k">Prazo</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.due_date" (change)="patch({ due_date: $any($event.target).value || null })" aria-label="Prazo" /></div>

            <div class="props-sep"></div>
            <div class="k">Prioridade</div>
            <div class="v">
              <select class="inline" [disabled]="!editable()" [ngModel]="t.priority" (ngModelChange)="patch({ priority: $event })" aria-label="Prioridade">
                @for (p of priorities; track p.value) { <option [ngValue]="p.value">{{ p.label }}</option> }
              </select>
            </div>

            <div class="k">Tempo</div>
            <div class="v">
              <div class="seg" role="group" aria-label="Tempo">
                @for (z of sizes; track z.v) {
                  <button type="button" [disabled]="!working()" [class.on]="t.size === z.v" (click)="patch({ size: t.size === z.v ? null : z.v })" [title]="z.hint">{{ z.t }}</button>
                }
              </div>
            </div>

            @if (t.project) {
              <div class="props-sep"></div>
              @if (t.sections.length) {
                <div class="k">{{ terms().One }}</div>
                <div class="v">
                  <select class="inline" [disabled]="!editable()" [ngModel]="t.section?.id ?? null" (ngModelChange)="patch({ section_id: $event })" [attr.aria-label]="terms().One">
                    @for (s of t.sections; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                  </select>
                </div>
              }
              @if (t.phases?.length) {
                <div class="k">Fase</div>
                <div class="v">
                  <select class="inline" [disabled]="!editable()" [ngModel]="t.phase?.id ?? null" (ngModelChange)="patch({ phase_id: $event })" aria-label="Fase">
                    @if (!t.phase) { <option [ngValue]="null">Sem fase</option> }
                    @for (f of t.phases; track f.id) { <option [ngValue]="f.id">{{ f.name }}</option> }
                  </select>
                </div>
              }
            }

            @if (editable() && seesProject()) {
              <div class="k">{{ isBoard() ? 'Equipe' : 'Projeto' }}</div>
              <div class="v">
                <select class="inline grow" [ngModel]="t.project?.id ?? null" (ngModelChange)="moveProject($event)" [attr.aria-label]="isBoard() ? 'Equipe' : 'Projeto'">
                  <option [ngValue]="null">Sem projeto</option>
                  @for (p of data.editableProjects(t.space); track p.id) { <option [ngValue]="p.id">{{ p.is_board ? 'Equipe · ' + p.name : p.name }}</option> }
                </select>
              </div>
              @if (t.project && t.space === 'profissional') {
                <div class="k">Privacidade</div>
                <div class="v"><label class="check-label"><input type="checkbox" class="switch" role="switch" [checked]="t.is_private" (change)="patch({ is_private: !t.is_private })" /> Só quem está na tarefa (esconde dos outros participantes)</label></div>
              }
            }

          </div>

          <div class="section-label step-head">
            <span class="grow">Descrição</span>
            @if (editable()) {
              <label class="check-label" style="text-transform: none; letter-spacing: 0; font-weight: 500" title="Com o interruptor ligado, cada Enter vira etapa. Desligado, só a linha que começa com -.">
                <input type="checkbox" class="switch" role="switch" [ngModel]="linesToStepsOn" (ngModelChange)="linesToStepsOn = $event" /> Linhas viram etapas
              </label>
            }
          </div>
          <textarea #descEl class="textarea" [readOnly]="!editable()" [placeholder]="linesToStepsOn ? 'Cada Enter cria uma etapa. Ou comece a linha com -.' : 'Anotações, contexto, links…'" [ngModel]="t.description"
                    (ngModelChange)="draftDescription = $event" (blur)="saveDescription()" (keydown.enter)="descEnter($event, descEl)" aria-label="Descrição"></textarea>

          <div class="section-label step-head">
            <span>Etapas</span>
            @if (t.subtasks.length) {
              <span class="step-progress"><i [style.width.%]="(doneSubtasks() / t.subtasks.length) * 100"></i></span>
              <span class="muted small">{{ doneSubtasks() }}/{{ t.subtasks.length }}</span>
              <span class="muted small grow step-next">{{ nextText() }}</span>
            }
          </div>
          @for (s of t.subtasks; track s.id; let i = $index; let last = $last) {
            <div class="subtask step-row" [class.done]="s.done" [class.mine]="s.assignee_id === me" [class.step-current]="s.id === currentId()">
              <button class="step-num" [class.on]="s.done" [disabled]="!canTick(s)" (click)="tick(s)"
                      [title]="tickTitle(s)" [attr.aria-label]="s.done ? 'Desmarcar etapa ' + (i + 1) : 'Concluir etapa ' + (i + 1)">
                @if (s.done) { <app-icon name="check" [size]="12" /> } @else { {{ i + 1 }} }
              </button>
              <textarea class="step-title" rows="1" [readOnly]="!editable()" [ngModel]="s.title"
                        (input)="sizeStep($event)" (blur)="renameSub(s.id, $any($event.target).value)" (keydown.enter)="stepEnter($event)" aria-label="Etapa"></textarea>
              <span class="step-badge" [class]="'step-badge step-badge--' + stepState(s)">{{ stepLabel(s) }}</span>
              @if (editable()) {
                <span class="step-order">
                  <button class="btn btn-ghost btn-sm btn-icon" [disabled]="i === 0" (click)="moveSub(i, -1)" aria-label="Subir etapa" title="Subir"><app-icon name="chevron" [size]="12" class="rot-up" /></button>
                  <button class="btn btn-ghost btn-sm btn-icon" [disabled]="last" (click)="moveSub(i, 1)" aria-label="Descer etapa" title="Descer"><app-icon name="chevron" [size]="12" class="rot-down" /></button>
                </span>
                @if (t.space === 'profissional') {
                <select class="inline step-who" [ngModel]="s.assignee_id" (ngModelChange)="setSub(s.id, { assignee_id: $event })" aria-label="Responsável pela etapa" [title]="s.assignee_name ? s.assignee_name + (s.assignee_team ? ' · ' + s.assignee_team : '') : 'Responsável'">
                  <option [ngValue]="null">Responsável</option>
                  <optgroup [label]="t.project ? 'Participantes do projeto' : 'Pessoas'">@for (p of teamPeople(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }</optgroup>
                  @if (otherPeople().length) { <optgroup label="Outras pessoas">@for (p of otherPeople(); track p.id) { <option [ngValue]="p.id">{{ p.name }} · {{ p.team_name || 'sem equipe' }}</option> }</optgroup> }
                </select>
                @if (s.assignee_id && s.assignee_id !== me) {
                  <label class="check-label step-notify" title="Avisar a pessoa quando for a vez dela"><input type="checkbox" class="switch" role="switch" [checked]="s.notify !== false" (change)="setSub(s.id, { notify: s.notify === false })" /> avisar</label>
                }
                }
                <input type="date" class="inline step-due" [ngModel]="s.due_date" (change)="setSub(s.id, { due_date: $any($event.target).value || null })" aria-label="Prazo da etapa" />
                <button class="btn btn-ghost btn-sm btn-icon x" (click)="deleteSub(s.id)" aria-label="Remover etapa"><app-icon name="x" [size]="13" /></button>
              } @else {
                @if (s.assignee_name) {
                  <span class="step-who-ro"><app-avatar [person]="{ name: s.assignee_name, initials: s.assignee_initials || '?', color: s.assignee_color || '#888' }" />{{ s.assignee_id === me ? 'Você' : s.assignee_name }}</span>
                }
                @if (s.due_date) { <span class="due">{{ dueText(s.due_date) }}</span> }
              }
            </div>
          }
          @if (editable()) {
            <div class="subtask step-row">
              <span class="step-num step-num--new"><app-icon name="plus" [size]="12" /></span>
              <input class="inline grow" placeholder="Adicionar etapa e Enter" [(ngModel)]="newSub" (keydown.enter)="addSub()" />
            </div>
            @if (t.space === 'profissional') { <div class="muted small" style="margin-top:4px">As etapas andam em ordem: cada pessoa é avisada quando chega a vez dela, e a gestão do projeto acompanha cada conclusão.</div> }
          }

          <div class="section-label">Atividade</div>
          <div class="timeline">
            @for (e of visibleTimeline(); track e.kind + e.id) {
              <div class="tl-card" [class.tl-card--comment]="e.kind === 'comment'">
                <app-avatar [person]="{ name: e.user_name || 'Sistema', initials: e.initials || '?', color: e.color || '#888' }" />
                <div class="tl-card__body">
                  <div class="tl-card__head">
                    <b>{{ e.user_name || 'Sistema' }}</b>
                    <span class="tl-card__when">{{ when(e.created_at) }}</span>
                  </div>
                  @if (e.kind === 'comment') {
                    <div class="tl-card__text"><app-rich-text [text]="e.body || ''" /></div>
                  } @else {
                    <div class="tl-card__text">{{ activityText(e) }}@if (e.to_value) { <b> {{ valueOf(e.to_value) }}</b> }</div>
                  }
                  @if (e.note) {
                    <div class="tl-note"><app-icon name="lock" [size]="12" /> {{ e.note }}</div>
                  } @else if (e.note_hidden) {
                    <div class="tl-note tl-note--hidden"><app-icon name="lock" [size]="12" /> Motivo restrito à gestão</div>
                  }
                </div>
              </div>
            }
            @if (hiddenCount() > 0 || shown() > 4) {
              <div class="tl-more">
                @if (hiddenCount() > 0) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="showMore()"><app-icon name="chevron" [size]="12" class="rot-down" />Expandir</button>
                }
                @if (shown() > 4) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="showLess()"><app-icon name="chevron" [size]="12" class="rot-up" />Recolher</button>
                }
              </div>
            }
          </div>
        }
      </div>
      @if (task(); as t) {
        <div class="drawer-foot composer">
          <textarea class="textarea" style="min-height:70px" placeholder="Escreva um comentário. Use &#64;usuario para avisar alguém."
                    [(ngModel)]="comment" (ngModelChange)="onCommentInput()" (keydown)="commentKey($event)" aria-label="Comentário"></textarea>
          @if (mentionList().length) {
            <div class="card" style="padding:4px">
              @for (p of mentionList(); track p.id) {
                <button class="pal-item" (click)="insertMention(p)"><app-avatar [person]="p" />{{ p.name }} <span class="side-note">&#64;{{ p.username }}</span></button>
              }
            </div>
          }
          <div class="row"><span class="muted small grow">Ctrl+Enter envia</span>
            <button class="btn btn-primary btn-sm" [disabled]="!comment.trim() || sending()" (click)="sendComment()">Comentar</button></div>
          @if (working() || (editable() && otherPhases().length)) {
            <div class="drawer-actions">
              @if (working()) {
                <button type="button" class="btn-action-primary btn-sm" (click)="toggleDone()">{{ t.status.category === 'done' ? 'Reabrir' : 'Concluir' }}</button>
              }
              @if (editable() && otherPhases().length) {
                <div class="act-phase">
                  <button type="button" class="btn-action-secondary btn-sm" (click)="phaseMenu.set(!phaseMenu())">Jogar para outra fase</button>
                  @if (phaseMenu()) {
                    <div class="act-phase-menu act-phase-menu--up">
                      @for (f of otherPhases(); track f.id) {
                        <button type="button" (click)="sendToPhase(f)"><i [style.background]="f.color"></i>{{ f.name }}</button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </aside>
    </div>

    @if (finishFor(); as s) {
      <div class="modal-scrim" (click)="finishFor.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">Concluir etapa: {{ s.title }}</div>
          <div class="modal-body">
            <div class="field"><label for="fin-note">O que foi feito (opcional)</label>
              <textarea id="fin-note" class="textarea" [(ngModel)]="finishNote" maxlength="1000" placeholder="Ex.: contrato revisado e enviado ao jurídico." appAutofocus></textarea>
              <span class="muted small">{{ finishHint() }}</span>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="finishFor.set(null)">Cancelar</button>
            <button class="btn btn-primary" [disabled]="finishing()" (click)="confirmFinish()">{{ finishing() ? 'Concluindo…' : 'Concluir' }}</button>
          </div>
        </div>
      </div>
    }

    @if (moveFor(); as s) {
      <div class="modal-scrim" (click)="cancelMove()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">Mover para {{ s.name }}</div>
          <div class="modal-body">
            <div class="field"><label for="mv-reason">Motivo da mudança</label>
              <textarea id="mv-reason" class="textarea" [(ngModel)]="moveReason" placeholder="Por que a tarefa está mudando de etapa?" maxlength="1000" appAutofocus></textarea>
              <span class="muted small">Visível para você, o responsável e a gestão do projeto.</span>
            </div>
            @if (s.category === 'blocked') {
              <div class="field"><label for="mv-block">O que está bloqueando</label>
                <textarea id="mv-block" class="textarea" [(ngModel)]="blockReason" placeholder="Ex.: aguardando acesso do fornecedor. Quem pode destravar: Compras." maxlength="1000"></textarea>
                <span class="muted small">Aparece no card e no painel do gestor, e avisa quem criou a tarefa.</span>
              </div>
            }
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="cancelMove()">Cancelar</button>
            <button class="btn btn-primary" [disabled]="moveReason.trim().length < 3" (click)="confirmMove()">Mover</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TaskDrawerComponent implements OnChanges {
  taskId = input.required<number>();
  @ViewChild('titleEl') titleEl?: ElementRef<HTMLTextAreaElement>;

  ui = inject(UiService);
  data = inject(DataService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  task = signal<TaskDetail | null>(null);
  timeline = signal<TimelineEntry[]>([]);
  shown = signal(4);
  visibleTimeline = computed(() => this.timeline().slice(-this.shown()));
  hiddenCount = computed(() => Math.max(0, this.timeline().length - this.shown()));
  people = signal<Person[]>([]);
  loading = signal(false);
  error = signal('');
  sending = signal(false);
  moveFor = signal<Status | null>(null);
  statusPick = signal<number | null>(null);
  moveReason = '';
  mentionQuery = signal<string | null>(null);

  priorities = PRIORITIES;
  sizes = SIZES;
  today = todayIso();
  draftTitle = '';
  draftDescription: string | null = null;
  linesToStepsOn = false;
  newSub = '';
  comment = '';
  blockReason = '';

  editable = computed(() => this.task()?.access === 'edit');
  // Colaborador ("work") atualiza status, tamanho, bloqueio e etapas.
  working = computed(() => ['edit', 'work'].includes(this.task()?.access || ''));
  me = this.auth.user()?.id ?? 0;
  terms = computed(() => termsFor(!!this.data.projects().find(x => x.id === this.task()?.project?.id)?.is_board));
  seesProject = computed(() => { const p = this.task()?.project; return !p || this.data.projects().some(x => x.id === p.id); });
  myOpenSteps = computed(() => (this.task()?.subtasks || []).filter(s => s.assignee_id === this.me && !s.done));
  isBoard = computed(() => !!this.data.projects().find(x => x.id === this.task()?.project?.id)?.is_board);
  contactCandidates = computed(() => {
    const taken = (this.task()?.contacts || []).map(c => c.id);
    return this.data.people().filter(p => !taken.includes(p.id) && p.id !== this.me);
  });
  teamPeople = computed(() => this.people().filter(p => p.in_team !== false));
  otherPeople = computed(() => this.people().filter(p => p.in_team === false));
  doneSubtasks = computed(() => this.task()?.subtasks.filter(s => s.done).length || 0);
  // Etapas em sequência: a da vez é a primeira não concluída.
  currentId = computed(() => this.task()?.subtasks.find(s => !s.done)?.id ?? null);
  myTurn = computed(() => {
    const s = this.task()?.subtasks.find(x => x.id === this.currentId());
    return s && s.assignee_id === this.me ? s : null;
  });
  nextText = computed(() => {
    const list = this.task()?.subtasks || [];
    const cur = list.find(s => s.id === this.currentId());
    if (!list.length) return '';
    if (!cur) return 'Todas concluídas';
    return `Na vez: ${cur.assignee_id === this.me ? 'você' : cur.assignee_name || 'sem responsável'}`;
  });
  phaseMenu = signal(false);
  otherPhases = computed(() => {
    const t = this.task();
    const cur = t?.phase?.id;
    return (t?.phases || []).filter(p => p.id !== cur);
  });
  finishFor = signal<Subtask | null>(null);
  finishing = signal(false);
  finishNote = '';
  finishHint = computed(() => {
    const s = this.finishFor(); const list = this.task()?.subtasks || [];
    if (!s) return '';
    const next = list.find(x => !x.done && x.id !== s.id);
    return next
      ? `A gestão do projeto é avisada, e ${next.assignee_name || 'a próxima etapa'} recebe o aviso de que é a vez dela.`
      : 'É a última etapa: a gestão do projeto é avisada para seguir com a próxima fase.';
  });
  assigneeAway = computed(() => {
    const id = this.task()?.assignee?.id;
    const p = this.people().find(x => x.id === id);
    return p?.away_until && p.away_until >= this.today ? `${p.name.split(' ')[0]} está ausente até ${p.away_until.split('-').reverse().join('/')}.` : '';
  });
  mentionList = computed(() => {
    const q = this.mentionQuery();
    if (q === null) return [];
    const k = q.toLowerCase();
    return this.data.people().filter(p => p.username?.startsWith(k) || p.name.toLowerCase().includes(k)).slice(0, 5);
  });

  ngOnChanges() { this.phaseMenu.set(false); this.load(); }

  load() {
    this.loading.set(true); this.error.set(''); this.linesToStepsOn = false; this.shown.set(4);
    this.api.task(this.taskId()).subscribe({
      next: t => {
        this.task.set(t); this.loading.set(false); this.draftTitle = t.title;
        setTimeout(() => this.autosize());
        if (!t.project) {
          this.api.directory().subscribe(p => this.people.set(p));
        } else {
          // Quem é de outro setor não lê o projeto; usa o diretório da empresa.
          this.api.projectPeople(t.project.id).subscribe({
            next: p => this.people.set(p),
            error: () => this.api.directory().subscribe(p => this.people.set(p.map(x => ({ ...x, in_team: false })))),
          });
        }
      },
      error: e => { this.loading.set(false); this.error.set(errorMessage(e, 'Tarefa não encontrada ou sem acesso.')); },
    });
    this.api.timeline(this.taskId()).subscribe({ next: tl => this.timeline.set(tl), error: () => {} });
  }

  autosize() {
    const el = this.titleEl?.nativeElement;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
    document.querySelectorAll<HTMLTextAreaElement>('.drawer .step-title').forEach(t => this.sizeStep(t));
  }

  sizeStep(el: Event | HTMLTextAreaElement) {
    const t = el instanceof HTMLTextAreaElement ? el : (el.target as HTMLTextAreaElement);
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }

  stepEnter(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey) return;
    e.preventDefault();
    (e.target as HTMLTextAreaElement).blur();
  }

  patch(body: Record<string, unknown>, after?: () => void) {
    const t = this.task(); if (!t) return;
    this.api.updateTask(t.id, body).subscribe({
      next: updated => {
        this.task.set({ ...t, ...updated, subtasks: t.subtasks, statuses: t.statuses, sections: t.sections, phases: t.phases });
        this.ui.taskChanged$.next(t.id);
        this.api.timeline(t.id).subscribe(tl => this.timeline.set(tl));
        after?.();
      },
      error: e => { this.toast.error(errorMessage(e)); this.statusPick.set(null); this.load(); },
    });
  }

  toggleDone() {
    const t = this.task(); if (!t) return;
    this.phaseMenu.set(false);
    const closing = t.status.category !== 'done';
    this.patch({ done: closing }, () => this.toast.show(closing ? 'Tarefa concluída. Permanece nesta fase.' : 'Tarefa reaberta.'));
  }
  sendToPhase(f: Phase) {
    this.phaseMenu.set(false);
    this.patch({ phase_id: f.id }, () => this.toast.show(`Tarefa enviada para ${f.name}.`));
  }

  setStatus(id: number) {
    const t = this.task();
    const s = t?.statuses.find(x => x.id === id);
    if (!t || !s || s.id === t.status.id) return;
    this.moveReason = ''; this.blockReason = '';
    this.statusPick.set(id);
    this.moveFor.set(s);
  }

  cancelMove() { this.moveFor.set(null); this.statusPick.set(null); }

  confirmMove() {
    const s = this.moveFor(); if (!s || this.moveReason.trim().length < 3) return;
    const body: Record<string, unknown> = { status_id: s.id, move_reason: this.moveReason.trim() };
    if (s.category === 'blocked') body['blocked_reason'] = this.blockReason.trim() || null;
    this.moveFor.set(null);
    this.patch(body, () => this.statusPick.set(null));
  }

  moveProject(projectId: number | null) {
    if (!projectId) { this.patch({ project_id: null }, () => this.load()); return; }
    this.api.works(projectId).subscribe({
      next: r => {
        const list = r.works.filter(w => !w.completed_at && (r.can_create || w.my_role === 'manage'));
        if (list.length !== 1) {
          const T = termsFor(!!this.data.projects().find(x => x.id === projectId)?.is_board);
          this.toast.show(list.length ? `Aí há mais de um ${T.one}. Abra o ${T.one} e mova a tarefa para lá.` : `Ainda não há nenhum ${T.one} aí.`);
          this.load();
          return;
        }
        this.patch({ project_id: projectId, section_id: list[0].id }, () => this.load());
      },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  saveTitle() {
    const t = this.task();
    const v = this.draftTitle.trim();
    if (t && v && v !== t.title) this.patch({ title: v });
  }

  saveDescription() {
    const t = this.task();
    if (t && this.draftDescription !== null && this.draftDescription !== t.description) this.patch({ description: this.draftDescription });
    this.draftDescription = null;
  }

  toggleContact(id: number) {
    const t = this.task(); if (!t || !id) return;
    const cur = (t.contacts || []).map(c => c.id);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    this.api.setTaskContacts(t.id, next).subscribe({
      next: r => this.task.set({ ...t, contacts: r.contacts, aligned_on: r.aligned_on }),
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  setAlignedOn(date: string | null) {
    const t = this.task(); if (!t || date === (t.aligned_on ?? null)) return;
    this.api.setTaskAlignment(t.id, date).subscribe({
      next: r => this.task.set({ ...t, contacts: r.contacts, aligned_on: r.aligned_on }),
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  descEnter(e: Event, el: HTMLTextAreaElement) {
    const k = e as KeyboardEvent;
    if (!this.editable() || k.ctrlKey || k.metaKey || k.shiftKey) return;
    const r = takeBulletLine(el.value, el.selectionStart, this.linesToStepsOn);
    if (!r) return;
    e.preventDefault();
    el.value = r.text;
    el.setSelectionRange(r.caret, r.caret);
    this.draftDescription = r.text;
    this.addSteps([r.step]);
  }

  private addSteps(titles: string[]) {
    const t = this.task(); if (!t) return;
    concat(...titles.map(title => this.api.addSubtask(t.id, title))).pipe(toArray()).subscribe({
      next: list => {
        const cur = this.task() || t;
        this.task.set({ ...cur, subtasks: [...cur.subtasks, ...list], subtasks_total: cur.subtasks_total + list.length });
        this.ui.taskChanged$.next(t.id);
        setTimeout(() => this.autosize());
        if (list.length > 1) this.toast.show(`${list.length} etapas criadas.`);
      },
      error: e => { this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  addSub() {
    const t = this.task(); const title = this.newSub.trim();
    if (!t || !title) return;
    this.api.addSubtask(t.id, title).subscribe({
      next: s => { this.task.set({ ...t, subtasks: [...t.subtasks, s], subtasks_total: t.subtasks_total + 1 }); this.newSub = ''; this.ui.taskChanged$.next(t.id); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  toggleSub(id: number, done: boolean) {
    const t = this.task(); if (!t) return;
    this.task.set({ ...t, subtasks: t.subtasks.map(s => (s.id === id ? { ...s, done } : s)) });
    this.api.updateSubtask(t.id, id, { done }).subscribe({
      next: () => { this.ui.taskChanged$.next(t.id); this.api.timeline(t.id).subscribe(tl => this.timeline.set(tl)); },
      error: e => { this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  stepState(s: Subtask) { return s.done ? 'done' : s.id === this.currentId() ? 'turn' : 'wait'; }
  stepLabel(s: Subtask) { return s.done ? 'Concluída' : s.id === this.currentId() ? 'Na vez' : 'Aguardando'; }
  canTick(s: Subtask) {
    if (this.editable()) return true;
    const mine = s.assignee_id === this.me || this.task()?.access === 'work';
    return mine && !s.done && s.id === this.currentId();
  }
  tickTitle(s: Subtask) {
    if (this.editable()) return s.done ? 'Desmarcar' : 'Marcar como feita';
    if (s.done) return 'Concluída';
    return s.id === this.currentId() ? 'Concluir minha parte' : 'Aguarde a etapa anterior';
  }
  tick(s: Subtask) {
    if (!s.done && s.assignee_id === this.me) { this.openFinish(s); return; }
    this.toggleSub(s.id, !s.done);
  }

  openFinish(s: Subtask) { this.finishNote = ''; this.finishFor.set(s); }

  confirmFinish() {
    const t = this.task(); const s = this.finishFor(); if (!t || !s || this.finishing()) return;
    const note = this.finishNote.trim();
    this.finishing.set(true);
    this.api.updateSubtask(t.id, s.id, note ? { done: true, note } : { done: true }).subscribe({
      next: () => {
        this.finishing.set(false); this.finishFor.set(null);
        this.toast.show('Etapa concluída. A gestão do projeto foi avisada.');
        this.ui.taskChanged$.next(t.id);
        this.load();
      },
      error: e => { this.finishing.set(false); this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  moveSub(i: number, dir: -1 | 1) {
    const t = this.task(); if (!t) return;
    const list = [...t.subtasks]; const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.task.set({ ...t, subtasks: list });
    this.api.reorderSubtasks(t.id, list.map(s => s.id)).subscribe({
      next: () => this.ui.taskChanged$.next(t.id),
      error: e => { this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  renameSub(id: number, title: string) {
    const t = this.task(); const s = t?.subtasks.find(x => x.id === id);
    if (!t || !s || !title.trim() || title.trim() === s.title) return;
    this.api.updateSubtask(t.id, id, { title: title.trim() }).subscribe({ error: e => this.toast.error(errorMessage(e)) });
  }

  deleteSub(id: number) {
    const t = this.task(); if (!t) return;
    this.task.set({ ...t, subtasks: t.subtasks.filter(s => s.id !== id) });
    this.api.deleteSubtask(t.id, id).subscribe({ next: () => this.ui.taskChanged$.next(t.id), error: e => this.toast.error(errorMessage(e)) });
  }

  onCommentInput() {
    const m = this.comment.match(/@([a-z0-9._-]*)$/i);
    this.mentionQuery.set(m ? m[1] : null);
  }

  insertMention(p: Person) {
    this.comment = this.comment.replace(/@([a-z0-9._-]*)$/i, `@${p.username} `);
    this.mentionQuery.set(null);
  }

  commentKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.sendComment(); }
  }

  sendComment() {
    const t = this.task(); const body = this.comment.trim();
    if (!t || !body) return;
    this.sending.set(true);
    this.api.comment(t.id, body).subscribe({
      next: c => { this.timeline.update(l => [...l, c]); this.comment = ''; this.sending.set(false); this.ui.taskChanged$.next(t.id); },
      error: e => { this.sending.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  planToday() {
    const t = this.task(); if (!t) return;
    this.api.planAdd(t.id, todayIso()).subscribe({
      next: () => { this.toast.show('Adicionada ao Meu Dia de hoje.'); this.ui.taskChanged$.next(t.id); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  remove() {
    const t = this.task(); if (!t) return;
    this.ui.closeTask();
    this.ui.hide(t.id);
    this.toast.undoable(`Tarefa "${t.title}" excluída.`,
      () => this.api.deleteTask(t.id).subscribe({
        next: () => { this.ui.taskChanged$.next(null); this.ui.unhide(t.id); },
        error: e => { this.ui.unhide(t.id); this.toast.error(errorMessage(e)); },
      }),
      () => this.ui.unhide(t.id));
  }

  setSub(id: number, body: Record<string, unknown>) {
    const t = this.task(); if (!t) return;
    this.api.updateSubtask(t.id, id, body).subscribe({
      next: () => {
        this.load(); this.ui.taskChanged$.next(t.id);
        const quiet = t.subtasks.find(s => s.id === id)?.notify === false;
        if (body['notify'] !== undefined) this.toast.show(body['notify'] ? 'A pessoa será avisada nesta etapa.' : 'A pessoa não será avisada nesta etapa.');
        else if (body['assignee_id'] && quiet) this.toast.show('Etapa atribuída, sem aviso.');
        else if (body['assignee_id']) this.toast.show(id === this.currentId() ? 'Etapa atribuída. A pessoa foi avisada.' : 'Etapa atribuída. A pessoa será avisada quando chegar a vez dela.');
      },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  away(p: Person) { return p.away_until && p.away_until >= this.today ? ' (ausente)' : ''; }
  dueText(iso: string) { return dueLabel(iso); }
  showMore() { this.shown.update(n => n + 4); }
  showLess() { this.shown.set(4); }
  when(iso: string) { return stamp(iso); }
  valueOf(v: string | null) { return activityValue(v); }
  activityText(e: TimelineEntry) { return ACTIVITY_TEXT[e.type || ''] || 'atualizou a tarefa'; }
}
