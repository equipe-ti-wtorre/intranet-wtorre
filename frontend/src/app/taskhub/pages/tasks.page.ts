import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { DataService } from '../core/data.service';
import { Task } from '../core/models';
import { GroupBy, SortBy, TaskListComponent } from '../shared/task-list';

const DUE_LABEL: Record<string, string> = { overdue: 'atrasadas', today: 'com prazo hoje', week: 'com prazo nos próximos 7 dias', none: 'sem prazo' };
const STATUS_LABEL: Record<string, string> = { blocked: 'bloqueadas', doing: 'em andamento', done: 'concluídas', todo: 'a fazer' };

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [TaskListComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>{{ title() }}</h1><div class="sub">{{ subtitle() }}</div></div>
        <div class="actions">
          <label class="label" for="g">Agrupar</label>
          <select id="g" class="select" style="width:150px;height:30px" [value]="groupBy()" (change)="groupBy.set($any($event.target).value)">
            <option value="due">Prazo</option><option value="project">Projeto</option>
            <option value="status">Status</option><option value="assignee">Responsável</option><option value="none">Sem grupo</option>
          </select>
          <select class="select" style="width:140px;height:30px" [value]="sortBy()" (change)="sortBy.set($any($event.target).value)" aria-label="Ordenar">
            <option value="manual">Ordem padrão</option><option value="due">Por prazo</option>
            <option value="priority">Por prioridade</option><option value="title">Por título</option>
          </select>
          @if (!fixedStatus()) {
            <button class="btn btn-sm" [class.btn-primary]="showDone()" (click)="showDone.set(!showDone()); load()">Concluídas recentes</button>
          }
        </div>
      </div>
      @if (error()) { <div class="error-text">{{ error() }}</div> }
      @if (loaded()) {
        <app-task-list [tasks]="tasks()" [groupBy]="groupBy()" [sortBy]="sortBy()" (toggle)="toggle($event)"
                       [emptyTitle]="emptyTitle()" [emptyText]="emptyText()" />
      } @else { <div class="muted">Carregando…</div> }
    </div>
  `,
})
export class TasksPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private ui = inject(UiService);
  private toast = inject(ToastService);
  private data = inject(DataService);

  tasks = signal<Task[]>([]);
  loaded = signal(false);
  error = signal('');
  showDone = signal(false);
  groupBy = signal<GroupBy>('due');
  sortBy = signal<SortBy>('manual');
  private q = signal<Record<string, string>>({});
  private subs: Subscription[] = [];

  view = computed(() => this.q()['v'] || 'filtro');
  fixedStatus = computed(() => !!this.q()['status']);
  title = computed(() => {
    const v = this.view();
    if (v === 'minhas') return this.q()['space'] === 'pessoal' ? 'Minhas tarefas individuais' : 'Minhas tarefas';
    if (v === 'delegadas') return 'Atribuídas por mim';
    if (v === 'pessoa') return this.data.people().find(p => p.id === Number(this.q()['pessoa']))?.name || 'Tarefas da pessoa';
    const parts = ['Tarefas'];
    if (this.q()['status']) parts.push(STATUS_LABEL[this.q()['status']] || '');
    if (this.q()['due']) parts.push(DUE_LABEL[this.q()['due']] || '');
    if (this.q()['assignee'] === 'none') parts.push('sem responsável');
    return parts.join(' ');
  });
  subtitle = computed(() => {
    const v = this.view();
    if (v === 'minhas') return this.q()['space'] === 'pessoal' ? 'Só você vê. Não aparece para o gestor.' : 'Tudo o que o gestor colocou com você, em todos os projetos corporativos.';
    if (v === 'delegadas') return 'O que você criou e entregou para outras pessoas. Acompanhe sem precisar perguntar.';
    if (v === 'pessoa') return 'Tarefas abertas desta pessoa nos projetos que você enxerga.';
    const team = this.data.teams().find(t => t.id === Number(this.q()['team_id']));
    return team ? `Equipe ${team.name}` : '';
  });
  emptyTitle = computed(() => (this.view() === 'delegadas' ? 'Nada delegado em aberto' : 'Nenhuma tarefa aqui'));
  emptyText = computed(() => (this.view() === 'minhas' ? 'Quando alguém atribuir algo a você, aparece nesta lista.' : ''));

  ngOnInit() {
    this.subs.push(this.route.queryParams.subscribe(p => {
      this.q.set(p as Record<string, string>);
      this.groupBy.set(p['v'] === 'delegadas' ? 'assignee' : p['v'] === 'filtro' || !p['v'] ? 'project' : 'due');
      if (p['tarefa']) this.ui.openTask(Number(p['tarefa']));
      this.load();
    }));
    this.subs.push(this.ui.taskChanged$.subscribe(() => this.load()));
  }
  ngOnDestroy() { this.subs.forEach(s => s.unsubscribe()); }

  load() {
    const p = this.q(); const v = this.view();
    const f: Record<string, unknown> = { status: p['status'] || (this.showDone() ? 'recent' : 'open') };
    if (v === 'minhas') f['assignee'] = 'me';
    if (v === 'delegadas') f['delegated'] = '1';
    if (v === 'pessoa') f['assignee'] = p['pessoa'];
    for (const k of ['team_id', 'sector_id', 'project_id', 'due', 'space']) if (p[k]) f[k] = p[k];
    if (v === 'filtro' && p['assignee']) f['assignee'] = p['assignee'];
    this.api.tasks(f).subscribe({
      next: t => { this.tasks.set(t); this.loaded.set(true); this.error.set(''); },
      error: e => { this.loaded.set(true); this.error.set(errorMessage(e)); },
    });
  }

  toggle(t: Task) {
    const done = t.status.category !== 'done';
    this.api.updateTask(t.id, { done }).subscribe({
      next: u => { this.tasks.update(l => l.map(x => (x.id === t.id ? u : x))); if (done) this.toast.show('Concluída.'); },
      error: e => this.toast.error(errorMessage(e)),
    });
  }
}
