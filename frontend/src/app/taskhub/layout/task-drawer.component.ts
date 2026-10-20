import { Component, ElementRef, OnChanges, ViewChild, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { Person, Status, TaskDetail, TimelineEntry } from '../core/models';
import { PRIORITIES, dueLabel, relativeTime, todayIso } from '../core/format';
import { AvatarComponent, IconComponent, RichTextComponent, AutofocusDirective } from '../shared/ui';

const ACTIVITY_TEXT: Record<string, string> = {
  created: 'criou a tarefa',
  status_changed: 'mudou o status para',
  assignee_changed: 'mudou o responsável para',
  due_changed: 'mudou o prazo para',
  priority_changed: 'mudou a prioridade para',
  title_changed: 'renomeou para',
  project_changed: 'moveu para o projeto',
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
              <a class="proj-tag" [routerLink]="['/ti/taskhub/projetos', t.project.id]" (click)="ui.closeTask()"><i [style.background]="t.project.color"></i>{{ t.project.name }}</a>
            } @else {
              <span class="proj-tag" title="Você participa desta tarefa, não do projeto inteiro"><i [style.background]="t.project.color"></i>{{ t.project.name }}</span>
            }
          } @else { <span class="muted small">Sem projeto</span> }
          @if (t.space === 'pessoal') { <span class="space-chip">Individual · só você vê</span> }
        }
        <span class="grow"></span>
        @if (task()) {
          <button class="btn btn-sm btn-ghost" (click)="planToday()" title="Adicionar ao Meu Dia de hoje"><app-icon name="sun" [size]="14" />Meu Dia</button>
          <button class="btn btn-sm btn-ghost btn-icon" (click)="copyLink()" title="Copiar link" aria-label="Copiar link"><app-icon name="arrow" [size]="14" /></button>
          @if (editable()) {
            <button class="btn btn-sm btn-ghost btn-icon" (click)="remove()" title="Excluir" aria-label="Excluir tarefa"><app-icon name="trash" [size]="14" /></button>
          }
        }
        <button class="btn btn-sm btn-ghost btn-icon" (click)="ui.closeTask()" aria-label="Fechar"><app-icon name="x" [size]="14" /></button>
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

          <div class="props">
            <div class="k">Status</div>
            <div class="v">
              @if (t.project) {
                <select class="inline" [disabled]="!working()" [ngModel]="t.status.id" (ngModelChange)="setStatus($event)" aria-label="Status">
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

            <div class="k">Prazo</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.due_date" (change)="patch({ due_date: $any($event.target).value || null })" aria-label="Prazo" /></div>

            <div class="k">Início</div>
            <div class="v"><input type="date" class="inline" [disabled]="!editable()" [ngModel]="t.start_date" (change)="patch({ start_date: $any($event.target).value || null })" aria-label="Data de início" /></div>

            <div class="k">Prioridade</div>
            <div class="v">
              <select class="inline" [disabled]="!editable()" [ngModel]="t.priority" (ngModelChange)="patch({ priority: $event })" aria-label="Prioridade">
                @for (p of priorities; track p.value) { <option [ngValue]="p.value">{{ p.label }}</option> }
              </select>
            </div>

            <div class="k">Tamanho</div>
            <div class="v">
              <div class="seg" role="group" aria-label="Tamanho">
                @for (z of sizes; track z.v) {
                  <button type="button" [disabled]="!working()" [class.on]="t.size === z.v" (click)="patch({ size: t.size === z.v ? null : z.v })" [title]="z.t">{{ z.v }} · {{ z.t }}</button>
                }
              </div>
            </div>

            @if (t.project) {
              @if (t.sections.length) {
                <div class="k">Trabalho</div>
                <div class="v">
                  <select class="inline" [disabled]="!editable()" [ngModel]="t.section?.id ?? null" (ngModelChange)="patch({ section_id: $event })" aria-label="Trabalho">
                    @for (s of t.sections; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                  </select>
                </div>
              }
            }

            @if (editable() && seesProject()) {
              <div class="k">Projeto</div>
              <div class="v">
                <select class="inline grow" [ngModel]="t.project?.id ?? null" (ngModelChange)="moveProject($event)" aria-label="Projeto">
                  <option [ngValue]="null">Sem projeto</option>
                  @for (p of data.editableProjects(t.space); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
                </select>
              </div>
              @if (t.project && t.space === 'profissional') {
                <div class="k">Privacidade</div>
                <div class="v"><label class="check-label"><input type="checkbox" [checked]="t.is_private" (change)="patch({ is_private: !t.is_private })" /> Só quem está na tarefa (esconde dos outros participantes)</label></div>
              }
            }

          </div>

          <div class="section-label">Descrição</div>
          <textarea class="textarea" [readOnly]="!editable()" placeholder="Contexto, links, critérios de pronto…" [ngModel]="t.description"
                    (ngModelChange)="draftDescription = $event" (blur)="saveDescription()" aria-label="Descrição"></textarea>

          <div class="section-label">Etapas @if (t.subtasks.length) { <span class="muted">{{ doneSubtasks() }}/{{ t.subtasks.length }}</span> }</div>
          @for (s of t.subtasks; track s.id) {
            <div class="subtask" [class.done]="s.done" [class.mine]="s.assignee_id === me">
              <button class="tick" [class.on]="s.done" [disabled]="!working() && s.assignee_id !== me" (click)="toggleSub(s.id, !s.done)" [attr.aria-label]="s.done ? 'Desmarcar' : 'Marcar como feita'"></button>
              <input class="inline grow" [readOnly]="!editable()" [ngModel]="s.title" (blur)="renameSub(s.id, $any($event.target).value)" (keydown.enter)="$any($event.target).blur()" aria-label="Etapa" />
              @if (editable()) {
                @if (t.space === 'profissional') {
                <select class="inline step-who" [ngModel]="s.assignee_id" (ngModelChange)="setSub(s.id, { assignee_id: $event })" aria-label="Responsável pela etapa" [title]="s.assignee_name ? s.assignee_name + (s.assignee_team ? ' · ' + s.assignee_team : '') : 'Sem responsável'">
                  <option [ngValue]="null">—</option>
                  <optgroup [label]="t.project ? 'Participantes do projeto' : 'Pessoas'">@for (p of teamPeople(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }</optgroup>
                  @if (otherPeople().length) { <optgroup label="Outras pessoas">@for (p of otherPeople(); track p.id) { <option [ngValue]="p.id">{{ p.name }} · {{ p.team_name || 'sem equipe' }}</option> }</optgroup> }
                </select>
                }
                <input type="date" class="inline step-due" [ngModel]="s.due_date" (change)="setSub(s.id, { due_date: $any($event.target).value || null })" aria-label="Prazo da etapa" />
                <button class="btn btn-ghost btn-sm btn-icon x" (click)="deleteSub(s.id)" aria-label="Remover etapa"><app-icon name="x" [size]="13" /></button>
              } @else {
                @if (s.assignee_name) { <span class="small muted">{{ s.assignee_id === me ? 'Você' : s.assignee_name }}</span> }
                @if (s.due_date) { <span class="due">{{ dueText(s.due_date) }}</span> }
              }
            </div>
          }
          @if (editable()) {
            <div class="subtask">
              <span class="tick" style="border-style:dashed"></span>
              <input class="inline grow" placeholder="Adicionar etapa e Enter" [(ngModel)]="newSub" (keydown.enter)="addSub()" />
            </div>
            @if (t.space === 'profissional') { <div class="muted small" style="margin-top:4px">Uma etapa pode ficar com qualquer pessoa; quem não participa do projeto vê só esta tarefa.</div> }
          }

          <div class="section-label">Atividade</div>
          <div class="timeline">
            @for (e of timeline(); track e.kind + e.id) {
              @if (e.kind === 'comment') {
                <div class="tl-comment">
                  <app-avatar [person]="{ name: e.user_name || '', initials: e.initials || '?', color: e.color || '#888' }" />
                  <div class="bubble">
                    <div class="who"><b>{{ e.user_name }}</b> · {{ rel(e.created_at) }}</div>
                    <div class="text"><app-rich-text [text]="e.body || ''" /></div>
                  </div>
                </div>
              } @else {
                <div class="tl-act">
                  <span><b>{{ e.user_name || 'Sistema' }}</b> {{ activityText(e) }} @if (e.to_value) { <b>{{ e.to_value }}</b> }</span>
                  <span class="muted">· {{ rel(e.created_at) }}</span>
                </div>
              }
            }
          </div>
          <div class="composer">
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
          </div>
        }
      </div>
    </aside>
    </div>

    @if (blockFor()) {
      <div class="modal-scrim" (click)="blockFor.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head">O que está bloqueando esta tarefa?</div>
          <div class="modal-body">
            <textarea class="textarea" [(ngModel)]="blockReason" placeholder="Ex.: aguardando acesso do fornecedor. Quem pode destravar: Compras." appAutofocus></textarea>
            <span class="muted small">O motivo aparece no painel do gestor e avisa quem criou a tarefa.</span>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="blockFor.set(null)">Cancelar</button>
            <button class="btn btn-primary" (click)="confirmBlock()">Marcar como bloqueada</button>
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
  people = signal<Person[]>([]);
  loading = signal(false);
  error = signal('');
  sending = signal(false);
  blockFor = signal<Status | null>(null);
  mentionQuery = signal<string | null>(null);

  priorities = PRIORITIES;
  sizes = [{ v: 'P' as const, t: 'Pequena' }, { v: 'M' as const, t: 'Média' }, { v: 'G' as const, t: 'Grande' }];
  today = todayIso();
  draftTitle = '';
  draftDescription: string | null = null;
  newSub = '';
  comment = '';
  blockReason = '';

  editable = computed(() => this.task()?.access === 'edit');
  // Colaborador ("work") atualiza status, tamanho, bloqueio e etapas.
  working = computed(() => ['edit', 'work'].includes(this.task()?.access || ''));
  me = this.auth.user()?.id ?? 0;
  seesProject = computed(() => { const p = this.task()?.project; return !p || this.data.projects().some(x => x.id === p.id); });
  myOpenSteps = computed(() => (this.task()?.subtasks || []).filter(s => s.assignee_id === this.me && !s.done));
  teamPeople = computed(() => this.people().filter(p => p.in_team !== false));
  otherPeople = computed(() => this.people().filter(p => p.in_team === false));
  doneSubtasks = computed(() => this.task()?.subtasks.filter(s => s.done).length || 0);
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

  ngOnChanges() { this.load(); }

  load() {
    this.loading.set(true); this.error.set('');
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
  }

  patch(body: Record<string, unknown>, after?: () => void) {
    const t = this.task(); if (!t) return;
    this.api.updateTask(t.id, body).subscribe({
      next: updated => {
        this.task.set({ ...t, ...updated, subtasks: t.subtasks, statuses: t.statuses, sections: t.sections });
        this.ui.taskChanged$.next(t.id);
        this.api.timeline(t.id).subscribe(tl => this.timeline.set(tl));
        after?.();
      },
      error: e => { this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  setStatus(id: number) {
    const s = this.task()?.statuses.find(x => x.id === id);
    if (s?.category === 'blocked') { this.blockReason = ''; this.blockFor.set(s); return; }
    this.patch({ status_id: id });
  }

  confirmBlock() {
    const s = this.blockFor(); if (!s) return;
    this.patch({ status_id: s.id, blocked_reason: this.blockReason.trim() || null });
    this.blockFor.set(null);
  }

  moveProject(projectId: number | null) {
    if (!projectId) { this.patch({ project_id: null }, () => this.load()); return; }
    this.api.works(projectId).subscribe({
      next: r => {
        const list = r.works.filter(w => !w.completed_at && (r.can_create || w.my_role === 'manage'));
        if (list.length !== 1) {
          this.toast.show(list.length ? 'Esse projeto tem mais de um trabalho. Abra o trabalho e mova a tarefa para lá.' : 'Esse projeto ainda não tem um trabalho.');
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
    this.api.updateSubtask(t.id, id, { done }).subscribe({ next: () => this.ui.taskChanged$.next(t.id), error: e => { this.toast.error(errorMessage(e)); this.load(); } });
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

  copyLink() {
    const t = this.task(); if (!t) return;
    const url = `${location.origin}/tarefas?v=minhas&tarefa=${t.id}`;
    navigator.clipboard?.writeText(url).then(() => this.toast.show('Link copiado.'), () => this.toast.show(url));
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
      next: () => { this.load(); this.ui.taskChanged$.next(t.id); if (body['assignee_id']) this.toast.show('Etapa atribuída. A pessoa foi avisada.'); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  away(p: Person) { return p.away_until && p.away_until >= this.today ? ' (ausente)' : ''; }
  dueText(iso: string) { return dueLabel(iso); }
  rel(iso: string) { return relativeTime(iso); }
  activityText(e: TimelineEntry) { return ACTIVITY_TEXT[e.type || ''] || 'atualizou a tarefa'; }
}
