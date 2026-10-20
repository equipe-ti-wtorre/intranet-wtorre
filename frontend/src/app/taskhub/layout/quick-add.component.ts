import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { AuthService } from '../core/auth.service';
import { Person, Priority } from '../core/models';
import { PRIORITIES, dueLabel } from '../core/format';
import { parseQuickTask } from '../core/quick-parse';

import { AutofocusDirective } from '../shared/ui';

@Component({
  selector: 'app-quick-add',
  standalone: true,
  imports: [AutofocusDirective, FormsModule],
  template: `
    <div class="modal-scrim" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Nova tarefa">
        <input class="qa-input" appAutofocus [(ngModel)]="text" (ngModelChange)="text$.set($event)" (keydown.enter)="save($event)"
               placeholder="Revisar contrato sexta @ana !alta #compras ~1h" aria-label="Título da tarefa" />
        <div class="qa-chips">
          @for (c of parsed().chips; track c) { <span class="pill">{{ c }}</span> }
          @if (!parsed().chips.length) { <span class="muted small">Dica: &#64;pessoa, #projeto, !prioridade, sexta, 15/10, ~2h</span> }
        </div>
        <div class="qa-fields">
          <div class="field" style="grid-column:1 / -1">
            <div class="seg" role="group" aria-label="Espaço" style="align-self:flex-start">
              <button type="button" [class.on]="space() === 'profissional'" [disabled]="!canWork() && !lockedToProject()" (click)="setSpace('profissional')"
                      [title]="canWork() || lockedToProject() ? '' : 'Tarefas corporativas são criadas pelo gestor'">Corporativo</button>
              <button type="button" [class.on]="space() === 'pessoal'" (click)="setSpace('pessoal')">Individual</button>
            </div>
          </div>
          <div class="field">
            <label for="qa-p">Projeto</label>
            <select id="qa-p" class="select" [ngModel]="projectId()" (ngModelChange)="projectId.set($event); loadPeople(); loadWorks()">
              @if (!(lockedToProject() && space() === 'profissional')) { <option [ngValue]="null">Sem projeto</option> }
              @for (p of projectOptions(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
            </select>
          </div>
          @if (projectId()) {
            <div class="field">
              <label for="qa-w">Trabalho</label>
              <select id="qa-w" class="select" [ngModel]="workId()" (ngModelChange)="workId.set($event)" [class.qa-missing]="!workId()">
                <option [ngValue]="null">Escolha o trabalho</option>
                @for (w of works(); track w.id) { <option [ngValue]="w.id">{{ w.name }}</option> }
              </select>
            </div>
          }
          @if (space() === 'profissional') {
          <div class="field">
            <label for="qa-a">Responsável</label>
            <select id="qa-a" class="select" [ngModel]="assigneeId()" (ngModelChange)="assigneeId.set($event)">
              <option [ngValue]="null">{{ projectId() ? 'Sem responsável' : 'Eu' }}</option>
              @for (p of people(); track p.id) { <option [ngValue]="p.id">{{ p.name }}{{ p.team_name ? ' · ' + p.team_name : '' }}</option> }
            </select>
          </div>
          }
          <div class="field">
            <label for="qa-d">Prazo</label>
            <input id="qa-d" type="date" class="input" [ngModel]="due()" (ngModelChange)="due.set($event || null)" />
          </div>
          <div class="field">
            <label for="qa-r">Prioridade</label>
            <select id="qa-r" class="select" [ngModel]="priority()" (ngModelChange)="priority.set($event)">
              @for (p of priorities; track p.value) { <option [ngValue]="p.value">{{ p.label }}</option> }
            </select>
          </div>
          <div class="field">
            <label>Tamanho</label>
            <div class="seg" role="group" aria-label="Tamanho">
              @for (z of sizes; track z.v) { <button type="button" [class.on]="size === z.v" (click)="size = size === z.v ? null : z.v" [title]="z.t">{{ z.v }}</button> }
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <label class="check-label left"><input type="checkbox" [(ngModel)]="planToday" /> Planejar para hoje</label>
          <button class="btn btn-ghost" (click)="close()">Cancelar</button>
          <button class="btn btn-primary" [disabled]="!parsed().title || saving()" (click)="save()">Criar tarefa</button>
        </div>
      </div>
    </div>
  `,
})
export class QuickAddComponent implements OnInit {
  ui = inject(UiService);
  data = inject(DataService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  priorities = PRIORITIES;
  sizes = [{ v: 'P' as const, t: 'Pequena' }, { v: 'M' as const, t: 'Média' }, { v: 'G' as const, t: 'Grande' }];
  size: 'P' | 'M' | 'G' | null = null;
  text = '';
  text$ = signal('');
  planToday = false;
  canWork = computed(() => !!this.auth.user()?.is_manager);
  // Aberto de um projeto em que a pessoa participa, sem ser gestora: a tarefa nasce nesse projeto.
  lockedToProject = computed(() => {
    const id = this.defaults.project_id;
    if (!id || this.canWork()) return false;
    return this.data.projects().some(p => p.id === id && p.space === 'profissional');
  });
  projectOptions = computed(() => {
    if (this.lockedToProject() && this.space() === 'profissional') {
      const p = this.data.projects().find(x => x.id === this.defaults.project_id);
      return p ? [p] : [];
    }
    const list = this.data.editableProjects(this.space());
    const ctx = this.data.projects().find(p => p.id === this.defaults.project_id);
    return ctx && !list.some(p => p.id === ctx.id) ? [ctx, ...list] : list;
  });
  workId = signal<number | null>(null);
  works = signal<{ id: number; name: string }[]>([]);
  space = signal<'profissional' | 'pessoal'>('pessoal');
  saving = signal(false);
  projectId = signal<number | null>(null);
  assigneeId = signal<number | null>(null);
  due = signal<string | null>(null);
  priority = signal<Priority>('media');
  people = signal<Person[]>([]);
  private defaults = this.ui.quickAdd() || {};

  // O texto preenche os campos; o que a pessoa escolher nos campos prevalece.
  parsed = computed(() => {
    const r = parseQuickTask(this.text$(), this.space() === 'pessoal' ? [] : this.data.people(), this.projectOptions());
    return r;
  });

  setSpace(s: 'profissional' | 'pessoal') {
    this.space.set(s);
    this.projectId.set(s === 'profissional' && this.lockedToProject() ? this.defaults.project_id ?? null : null);
    this.workId.set(null); this.works.set([]);
    this.assigneeId.set(null);
    this.loadPeople();
    this.loadWorks();
  }

  ngOnInit() {
    const fromProject = this.data.projects().find(p => p.id === this.defaults.project_id)?.space;
    this.space.set(this.defaults.space ?? fromProject ?? (this.canWork() ? 'profissional' : 'pessoal'));
    if (this.space() === 'profissional' && !this.canWork() && !fromProject) this.space.set('pessoal');
    this.projectId.set(this.defaults.project_id ?? null);
    this.workId.set(this.defaults.section_id ?? null);
    this.loadWorks(this.defaults.section_id ?? null);
    this.assigneeId.set(this.defaults.assignee_id ?? null);
    this.planToday = !!this.defaults.plan_today;
    this.size = null;
    this.loadPeople();
  }

  loadWorks(keep: number | null = null) {
    const pid = this.projectId();
    this.workId.set(keep);
    if (!pid) { this.works.set([]); return; }
    this.api.works(pid).subscribe(r => {
      const list = r.works.filter(w => !w.completed_at && (r.can_create || w.my_role === 'manage'));
      this.works.set(list);
      if (!keep && list.length === 1) this.workId.set(list[0].id);
    });
  }

  loadPeople() {
    const pid = this.projectId();
    if (pid) this.api.projectPeople(pid).subscribe(p => this.people.set(p));
    else this.people.set(this.data.people().filter(p => p.id !== this.auth.user()?.id));
  }

  close() { this.ui.quickAdd.set(null); }

  save(e?: Event) {
    e?.preventDefault();
    const p = this.parsed();
    if (!p.title || this.saving()) return;
    let projectId = this.projectId() ?? p.project?.id ?? null;
    if (this.lockedToProject() && this.space() === 'profissional') projectId = this.defaults.project_id ?? projectId;
    if (projectId && !this.workId()) { this.toast.show('Escolha o trabalho da tarefa.'); return; }
    let assignee = this.assigneeId() ?? p.assignee?.id ?? null;
    if (this.space() === 'pessoal' || (!projectId && !assignee)) assignee = this.auth.user()!.id;
    const body = {
      title: p.title,
      project_id: projectId,
      status_id: this.defaults.status_id ?? undefined,
      section_id: projectId ? this.workId() : undefined,
      assignee_id: assignee,
      due_date: this.due() ?? p.due_date,
      priority: p.priority && this.priority() === 'media' ? p.priority : this.priority(),
      estimate_min: this.size ? undefined : p.estimate_min,
      plan_today: this.planToday && (!assignee || assignee === this.auth.user()!.id),
      plan_period: this.defaults.plan_period,
      size: this.size || null,
      space: this.space(),
    };
    if (this.planToday && !body.assignee_id) body.assignee_id = this.auth.user()!.id;
    this.saving.set(true);
    this.api.createTask(body).subscribe({
      next: t => {
        this.saving.set(false);
        const extra = t.due_date ? ` · prazo ${dueLabel(t.due_date).toLowerCase()}` : '';
        this.toast.show(`Tarefa criada${t.assignee && t.assignee.id !== this.auth.user()!.id ? ` para ${t.assignee.name}` : ''}${extra}.`);
        this.ui.taskChanged$.next(t.id);
        this.data.reloadProjects();
        this.close();
      },
      error: err => { this.saving.set(false); this.toast.error(errorMessage(err)); },
    });
  }
}
