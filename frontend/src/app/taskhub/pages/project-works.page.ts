import { Component, OnChanges, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { ToastService } from '../core/toast.service';
import { Person, Project, Work } from '../core/models';
import { dueLabel, relativeTime, todayIso } from '../core/format';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';
import { ProjectTimelineComponent } from './project-timeline.component';
import { businessSpan } from '../core/timeline';

const COLORS = ['#4c8dff', '#2fbf71', '#e11d48', '#f97316', '#a78bfa', '#14b8a6', '#c9a84c', '#ec4899'];
type Filter = 'todos' | 'responsavel' | 'participo' | 'atraso';
type Sort = 'prazo' | 'nome' | 'progresso';

// Projeto → Trabalhos → Tarefas. Ao abrir o projeto aparecem os trabalhos em cartões.
@Component({
  selector: 'app-project-works',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, RouterLink, AutofocusDirective, AvatarComponent, IconComponent, ProjectTimelineComponent],
  template: `
    <div class="page works-page">
      @if (project(); as p) {
        <div class="crumb">
          @if (p.sector_name) { <span>{{ p.sector_name }}</span> › } {{ p.name }}
        </div>
        <div class="page-head">
          <div class="grow">
            <div class="row" style="gap: 10px">
              <span class="wk-dot" [style.background]="p.color"></span>
              <h1>{{ p.name }}</h1>
              <span class="health" [class]="'health ' + p.health"><i></i>{{ healthLabel[p.health] }}</span>
            </div>
            <div class="sub">
              {{ works().length }} {{ works().length === 1 ? 'trabalho' : 'trabalhos' }}
              · {{ totals().done }} de {{ totals().total }} tarefas concluídas
              @if (totals().overdue) { · <span class="wk-late">{{ totals().overdue }} atrasadas</span> }
              @if (p.owner_name && p.space === 'profissional') { · Gestor: {{ p.owner_name }} }
              @if (p.end_date) { · Entrega {{ due(p.end_date) }} }
            </div>
          </div>
          <div class="actions">
            @if (p.my_role === 'manage') { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/projetos', p.id, 'configuracoes']">Configurações</a> }
            @if (canCreate()) { <button class="btn btn-primary btn-sm" (click)="openNew()"><app-icon name="plus" [size]="14" />Novo trabalho</button> }
          </div>
        </div>
        @if (p.description) { <p class="muted" style="max-width: 760px; margin: -6px 0 14px; white-space: pre-wrap">{{ p.description }}</p> }

        <div class="tl-tabs" role="tablist" aria-label="Visão do projeto">
          <button type="button" role="tab" [class.on]="!timelineView()" [attr.aria-selected]="!timelineView()" (click)="setView(null)"><app-icon name="board" [size]="14" />Trabalhos</button>
          <button type="button" role="tab" [class.on]="timelineView()" [attr.aria-selected]="timelineView()" (click)="setView('linha')"><app-icon name="calendar" [size]="14" />Linha do tempo</button>
        </div>

        @if (timelineView()) {
          <app-project-timeline [projectId]="p.id" (changed)="load(); data.reloadProjects()" />
        } @else {
        <div class="wk-toolbar">
          <input class="input" style="width: 240px; height: 36px" placeholder="Buscar trabalho" [ngModel]="queryText" (ngModelChange)="search($event)" aria-label="Buscar trabalho" />
          <div class="wk-chips" role="group" aria-label="Filtrar trabalhos">
            @for (f of filters; track f.key) {
              <button type="button" [class.on]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }} {{ countOf(f.key) }}</button>
            }
          </div>
          <span class="grow"></span>
          <label class="muted small" for="wk-sort">Ordenar</label>
          <select id="wk-sort" class="select" style="width: 140px; height: 36px" [ngModel]="sort()" (ngModelChange)="sort.set($event)">
            <option value="prazo">Prazo</option><option value="nome">Nome</option><option value="progresso">Progresso</option>
          </select>
        </div>

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
            @if (canCreate()) { <button type="button" class="wk-new" (click)="openNew()">+ Novo trabalho</button> }
            @if (!active().length && !canCreate()) { <div class="muted small">Nenhum trabalho em andamento.</div> }
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
            <a class="wk-name" [routerLink]="['/ti/taskhub/projetos', w.project_id, 'trabalhos', w.id]">{{ w.name }}</a>
            <div class="wk-meta">{{ isRecent ? 'aberto ' + rel(w.last_visit) : (w.description || 'Sem descrição') }}</div>
          </div>
          @if (w.my_role === 'manage') {
            <div class="wk-actions">
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="openEdit(w)" aria-label="Editar trabalho" title="Editar trabalho"><app-icon name="gear" [size]="14" /></button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="toggleDone(w)" [attr.aria-label]="w.completed_at ? 'Reabrir trabalho' : 'Marcar como concluído'" [title]="w.completed_at ? 'Reabrir trabalho' : 'Marcar como concluído'"><app-icon name="check" [size]="14" /></button>
              @if (canCreate()) {
                <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="remove(w)" aria-label="Excluir trabalho" title="Excluir trabalho"><app-icon name="trash" [size]="14" /></button>
              }
            </div>
          }
        </div>
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
        <div class="row wk-foot">
          @if (w.owner_name) {
            <span class="row" style="gap: 6px"><app-avatar [person]="{ name: w.owner_name, initials: w.owner_initials || '', color: w.owner_color || '' }" />{{ w.owner_name.split(' ')[0] }}@if (w.due_date && (w.tasks_overdue || w.tasks_blocked)) { <span class="muted"> · prazo {{ due(w.due_date) }}</span> }</span>
          }
          <span class="grow"></span>
          <span class="wk-avatars">@for (m of w.members.slice(0, 3); track m.id) { <app-avatar [person]="m" /> }@if (w.members.length > 3) { <span class="wk-more">+{{ w.members.length - 3 }}</span> }</span>
        </div>
      </div>
    </ng-template>

    @if (form) {
      <div class="modal-scrim" (click)="form = null">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" [attr.aria-label]="form.id ? 'Editar trabalho' : 'Novo trabalho'">
          <div class="modal-head">{{ form.id ? 'Editar trabalho' : 'Novo trabalho' }}</div>
          <div class="modal-body">
            <div class="field"><label for="wk-n">Nome</label><input id="wk-n" class="input" appAutofocus [(ngModel)]="form.name" placeholder="Ex.: Customização Fiscal" /></div>
            <div class="field"><label for="wk-d">Descrição</label>
              <textarea id="wk-d" class="textarea" style="min-height: 80px" [(ngModel)]="form.description"></textarea></div>
            <div class="fields">
              <div class="field"><label for="wk-o">Responsável</label>
                <select id="wk-o" class="select" [(ngModel)]="form.owner_id">
                  @for (u of people(); track u.id) { <option [ngValue]="u.id">{{ u.name }}{{ u.team_name ? ' · ' + u.team_name : '' }}</option> }
                </select></div>
            </div>
            <div class="fields">
              <div class="field"><label for="wk-s">Data inicial</label><input id="wk-s" type="date" class="input" [(ngModel)]="form.start_date" /></div>
              <div class="field"><label for="wk-p">Data final</label><input id="wk-p" type="date" class="input" [min]="form.start_date || ''" [(ngModel)]="form.due_date" /></div>
            </div>
            @if (spanError()) { <span class="hint" style="margin-top: -6px; color: var(--danger)">A data final deve ser igual ou depois da inicial.</span> }
            @else if (form.start_date && form.due_date) { <span class="hint" style="margin-top: -6px">{{ span() }} {{ span() === 1 ? 'dia útil' : 'dias úteis' }} na linha do tempo. Se o trabalho anterior atrasar, este é empurrado.</span> }
            <div class="field">
              <label>Participantes do trabalho</label>
              <div class="row" style="flex-wrap: wrap; gap: 6px">
                @for (m of chosen(); track m.id) {
                  <span class="pill"><app-avatar [person]="m" />{{ m.name }}<button type="button" (click)="toggleMember(m.id)" [attr.aria-label]="'Remover ' + m.name"><app-icon name="x" [size]="12" /></button></span>
                }
              </div>
              <select #mk class="select" (change)="toggleMember(+mk.value); mk.value = ''" aria-label="Adicionar participante">
                <option value="">Adicionar pessoa…</option>
                @for (u of candidates(); track u.id) { <option [value]="u.id">{{ u.name }}{{ u.team_name ? ' · ' + u.team_name : '' }}</option> }
              </select>
              <span class="hint">Participantes do trabalho veem este trabalho e as tarefas dele. Quem participa do projeto inteiro vê todos os trabalhos.</span>
            </div>
            <div class="field"><label>Cor</label>
              <div class="row">@for (c of colors; track c) {
                <button type="button" class="wk-color" [style.background]="c" [class.on]="form.color === c" (click)="form.color = c" [attr.aria-label]="'Cor ' + c"></button>
              }</div></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="form = null">Cancelar</button>
            <button class="btn btn-primary" [disabled]="!form.name.trim() || saving() || spanError()" (click)="save()">{{ form.id ? 'Salvar' : 'Criar trabalho' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProjectWorksPage implements OnChanges {
  id = input.required<string>();
  vista = input<string | undefined>();
  timelineView = computed(() => this.vista() === 'linha');
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
  form: { id?: number; name: string; description: string; owner_id: number | null; start_date: string | null; due_date: string | null; color: string } | null = null;
  spanError() { return !!(this.form?.start_date && this.form.due_date && this.form.due_date < this.form.start_date); }
  span() { return this.form?.start_date && this.form.due_date ? businessSpan(this.form.start_date, this.form.due_date) : 0; }
  private memberIds = signal<number[]>([]);
  colors = COLORS;
  healthLabel = { no_prazo: 'No prazo', em_risco: 'Em risco', atrasado: 'Atrasado' } as const;
  filters: { key: Filter; label: string }[] = [
    { key: 'todos', label: 'Todos' }, { key: 'responsavel', label: 'Sou responsável' },
    { key: 'participo', label: 'Participo' }, { key: 'atraso', label: 'Com atraso' },
  ];

  private me = computed(() => this.auth.user()?.id);
  private matches = (w: Work, f: Filter) =>
    f === 'todos' || (f === 'responsavel' && w.owner_id === this.me()) || (f === 'participo' && w.members.some(m => m.id === this.me()))
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
  candidates = computed(() => this.allPeople().filter(p => !this.memberIds().includes(p.id)));
  private allPeople = computed(() => this.people().length ? this.people() : this.data.people());

  ngOnChanges() { this.load(); }

  load() {
    const pid = Number(this.id());
    this.error.set('');
    this.api.project(pid).subscribe({
      next: p => this.project.set(p),
      error: () => this.error.set('Projeto não encontrado ou sem acesso.'),
    });
    this.api.works(pid).subscribe({
      next: r => { this.works.set(r.works); this.canCreate.set(r.can_create); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível carregar os trabalhos.')),
    });
    this.api.projectPeople(pid).subscribe({ next: p => this.people.set(p), error: () => {} });
  }

  setView(v: 'linha' | null) {
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

  openNew() {
    this.memberIds.set([]);
    this.form = { name: '', description: '', owner_id: this.me() ?? null, start_date: null, due_date: null, color: COLORS[this.works().length % COLORS.length] };
  }
  openEdit(w: Work) {
    this.memberIds.set(w.members.map(m => m.id));
    this.form = { id: w.id, name: w.name, description: w.description, owner_id: w.owner_id, start_date: w.start_date ?? null, due_date: w.due_date, color: w.color };
  }
  toggleMember(id: number) { if (id) this.memberIds.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id])); }

  save() {
    const f = this.form; if (!f?.name?.trim()) return;
    const body = { name: f.name.trim(), description: f.description || '', owner_id: f.owner_id, due_date: f.due_date || null, color: f.color, members: this.memberIds(),
      start_date: f.start_date || null };
    this.saving.set(true);
    const req = f.id ? this.api.updateWork(f.id, body) : this.api.createWork(Number(this.id()), body);
    req.subscribe({
      next: w => {
        this.saving.set(false); this.form = null; this.load(); this.data.reloadProjects();
        this.toast.show(f.id ? 'Trabalho atualizado.' : 'Trabalho criado.');
        if (!f.id) this.router.navigate(['/ti/taskhub/projetos', w.project_id, 'trabalhos', w.id]);
      },
      error: e => { this.saving.set(false); this.toast.error(errorMessage(e, 'Não foi possível salvar o trabalho.')); },
    });
  }

  toggleDone(w: Work) {
    this.api.updateWork(w.id, { done: !w.completed_at }).subscribe({
      next: () => { this.load(); this.toast.show(w.completed_at ? 'Trabalho reaberto.' : 'Trabalho concluído.'); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível atualizar o trabalho.')),
    });
  }

  remove(w: Work) {
    const text = w.tasks_total
      ? `As ${w.tasks_total} tarefas dele, com etapas e comentários, também serão apagadas. Não dá para desfazer.`
      : 'Ele não tem tarefas.';
    if (!confirm(`Excluir o trabalho ${w.name}?\n${text}`)) return;
    this.api.deleteWork(w.id).subscribe({
      next: () => { this.load(); this.data.reloadProjects(); this.toast.show('Trabalho excluído.'); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível excluir o trabalho.')),
    });
  }
}
