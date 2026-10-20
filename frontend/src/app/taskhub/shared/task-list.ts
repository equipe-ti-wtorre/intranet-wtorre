import { Component, EventEmitter, Output, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Section, Status, Task } from '../core/models';
import { CATEGORY_LABEL, PRIORITY_RANK, addDaysIso, isClosed, todayIso } from '../core/format';
import { UiService } from '../core/ui.service';
import { EmptyComponent, TaskRowComponent } from './ui';

export type GroupBy = 'status' | 'section' | 'due' | 'project' | 'assignee' | 'none';
export type SortBy = 'manual' | 'due' | 'priority' | 'title';

interface Group { key: string; label: string; color?: string; tasks: Task[]; add?: Record<string, unknown>; }

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [FormsModule, TaskRowComponent, EmptyComponent],
  template: `
    @for (g of groups(); track g.key) {
      @if (groupBy() !== 'none') {
        <div class="group-head">
          @if (g.color) { <span class="dot" style="width:8px;height:8px;border-radius:50%" [style.background]="g.color"></span> }
          {{ g.label }} <span class="n">{{ g.tasks.length }}</span>
        </div>
      }
      <div class="tlist">
        @for (t of g.tasks; track t.id) {
          <app-task-row [task]="t" [showProject]="showProject()" [showStatus]="groupBy() !== 'status'"
                        (open)="ui.openTask($event.id)" (toggle)="toggle.emit($event)" />
        }
        @if (canAdd() && g.add) {
          <div class="add-row">
            <span style="width:18px;text-align:center">+</span>
            <input #inp placeholder="Adicionar tarefa e Enter" (keydown.enter)="add.emit({ title: inp.value, extra: g.add! }); inp.value = ''" [attr.aria-label]="'Adicionar tarefa em ' + g.label" />
          </div>
        }
      </div>
    }
    @if (!total()) {
      <app-empty [title]="emptyTitle()" [text]="emptyText()" />
    }
  `,
})
export class TaskListComponent {
  ui = inject(UiService);
  tasks = input.required<Task[]>();
  groupBy = input<GroupBy>('status');
  sortBy = input<SortBy>('manual');
  statuses = input<Status[]>([]);
  sections = input<Section[]>([]);
  showProject = input(true);
  canAdd = input(false);
  emptyTitle = input('Nada por aqui');
  emptyText = input('');
  @Output() toggle = new EventEmitter<Task>();
  @Output() add = new EventEmitter<{ title: string; extra: Record<string, unknown> }>();

  total = computed(() => this.visible().length);
  private visible = computed(() => {
    const hidden = this.ui.hidden();
    const list = this.tasks().filter(t => !hidden.has(t.id));
    const s = this.sortBy();
    const sorted = [...list];
    if (s === 'due') sorted.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    if (s === 'priority') sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    if (s === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    return sorted;
  });

  groups = computed<Group[]>(() => {
    const list = this.visible();
    const by = this.groupBy();
    if (by === 'none') return [{ key: 'all', label: '', tasks: list, add: {} }];
    if (by === 'status' && this.statuses().length) {
      return this.statuses().map(s => ({ key: `s${s.id}`, label: s.name, color: s.color, tasks: list.filter(t => t.status.id === s.id), add: { status_id: s.id } }))
        .filter(g => g.tasks.length || !['done', 'canceled'].includes(this.statuses().find(s => `s${s.id}` === g.key)!.category));
    }
    if (by === 'status') {
      const cats = ['blocked', 'doing', 'todo', 'done', 'canceled'] as const;
      return cats.map(c => ({ key: c, label: CATEGORY_LABEL[c], tasks: list.filter(t => t.status.category === c) })).filter(g => g.tasks.length);
    }
    if (by === 'section') {
      const groups: Group[] = [{ key: 'none', label: 'Sem seção', tasks: list.filter(t => !t.section), add: { section_id: null } }];
      for (const s of this.sections()) groups.push({ key: `x${s.id}`, label: s.name, tasks: list.filter(t => t.section?.id === s.id), add: { section_id: s.id } });
      return groups.filter(g => g.tasks.length || g.key !== 'none' || !this.sections().length);
    }
    if (by === 'project') {
      const map = new Map<string, Group>();
      for (const t of list) {
        const key = t.project ? `p${t.project.id}` : 'none';
        if (!map.has(key)) map.set(key, { key, label: t.project?.name || 'Sem projeto', color: t.project?.color, tasks: [] });
        map.get(key)!.tasks.push(t);
      }
      return [...map.values()];
    }
    if (by === 'assignee') {
      const map = new Map<string, Group>();
      for (const t of list) {
        const key = t.assignee ? `a${t.assignee.id}` : 'none';
        if (!map.has(key)) map.set(key, { key, label: t.assignee?.name || 'Sem responsável', tasks: [] });
        map.get(key)!.tasks.push(t);
      }
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    }
    // por prazo
    const today = todayIso(); const week = addDaysIso(today, 7);
    const buckets: Group[] = [
      { key: 'late', label: 'Atrasadas', tasks: [] }, { key: 'today', label: 'Hoje', tasks: [] },
      { key: 'week', label: 'Próximos 7 dias', tasks: [] }, { key: 'later', label: 'Mais adiante', tasks: [] },
      { key: 'none', label: 'Sem prazo', tasks: [] }, { key: 'closed', label: 'Concluídas', tasks: [] },
    ];
    for (const t of list) {
      const b = isClosed(t.status.category) ? 'closed' : !t.due_date ? 'none' : t.due_date < today ? 'late'
        : t.due_date === today ? 'today' : t.due_date <= week ? 'week' : 'later';
      buckets.find(x => x.key === b)!.tasks.push(t);
    }
    return buckets.filter(g => g.tasks.length);
  });
}
