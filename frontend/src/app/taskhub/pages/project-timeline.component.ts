import { Component, ElementRef, OnChanges, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { ProjectTimeline, Task, TimelineWork } from '../core/models';
import { TimelineRow, addDays, businessDiff, businessSpan, computeTimeline, isBusiness, isoOf, parseIso } from '../core/timeline';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';

interface DraftItem {
  key: string; id?: number; name: string; color: string; duration_days: number; start_date: string | null;
  completed_at: string | null; removed: boolean; work?: TimelineWork;
}
interface Span { start: string; end: string }
interface Row {
  key: string; id?: number; name: string; color: string; duration: number; done: boolean; removed: boolean; isNew: boolean;
  work?: TimelineWork; planned: Span | null; cur: TimelineRow | null; next: TimelineRow | null;
  drift: number | null; shift: number | null;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const COLORS = ['#4c8dff', '#2fbf71', '#e11d48', '#f97316', '#a78bfa', '#14b8a6', '#c9a84c', '#ec4899'];
const fmt = (iso: string | null | undefined) => { if (!iso) return '—'; const d = parseIso(iso.slice(0, 10)); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const same = (a: Span | null, b: Span | null) => !!a && !!b && a.start === b.start && a.end === b.end;

// Régua do projeto: datas planejadas de cada trabalho, o previsto (com empurrões) e a simulação.
@Component({
  selector: 'app-project-timeline',
  standalone: true,
  imports: [FormsModule, AutofocusDirective, AvatarComponent, IconComponent],
  template: `
    @if (data(); as d) {
      <div class="tl-toolbar">
        <div class="wk-chips" role="group" aria-label="Escala da régua">
          <button type="button" [class.on]="zoom() === 'semana'" (click)="zoom.set('semana')">Semana</button>
          <button type="button" [class.on]="zoom() === 'mes'" (click)="zoom.set('mes')">Mês</button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="scrollToToday()">Hoje</button>
        <span class="tl-legend"><i class="tl-legend__plan"></i>planejado <i class="tl-legend__bar"></i>previsto <i class="tl-legend__late"></i>atrasado</span>
        <span class="grow"></span>
        @if (draft()) {
          <span class="tl-sim-tag">Simulação · nada foi gravado</span>
          <button type="button" class="btn btn-sm" (click)="openInsert()"><app-icon name="plus" [size]="14" />Inserir trabalho</button>
          <button type="button" class="btn btn-ghost btn-sm" (click)="discard()">Descartar</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="!dirty() || saving()" (click)="apply()">{{ saving() ? 'Aplicando…' : 'Aplicar' }}</button>
        } @else if (d.can_edit) {
          <button type="button" class="btn btn-sm" (click)="startSim()"><app-icon name="pencil" [size]="14" />Simular mudanças</button>
        }
      </div>

      @if (inserting; as f) {
        <div class="tl-insert">
          <div class="field"><label for="tl-in">Nome do trabalho</label><input id="tl-in" class="input" appAutofocus [(ngModel)]="f.name" placeholder="Ex.: Homologação" (keydown.enter)="confirmInsert()" /></div>
          <div class="field" style="max-width: 130px"><label for="tl-id">Duração (dias úteis)</label><input id="tl-id" class="input" type="number" min="1" max="365" [(ngModel)]="f.duration" /></div>
          <div class="field" style="min-width: 200px"><label for="tl-ia">Posição</label>
            <select id="tl-ia" class="select" [(ngModel)]="f.after">
              <option [ngValue]="-1">No início da fila</option>
              @for (r of draft() || []; track r.key; let i = $index) { @if (!r.removed) { <option [ngValue]="i">Depois de {{ r.name }}</option> } }
            </select></div>
          <div class="row" style="gap: 6px; align-self: flex-end; padding-bottom: 2px">
            <button type="button" class="btn btn-ghost btn-sm" (click)="inserting = null">Cancelar</button>
            <button type="button" class="btn btn-primary btn-sm" [disabled]="(f.name || '').trim().length < 2" (click)="confirmInsert()">Inserir na simulação</button>
          </div>
        </div>
      }

      @if (!rows().length) {
        <div class="tl-empty muted">Nenhum trabalho neste projeto ainda. Crie o primeiro para montar a linha do tempo.</div>
      } @else {
        <div class="tl-scroll" #scroller>
          <div class="tl-grid" [style.width.px]="labelWidth + days().length * dayW()">
            <div class="tl-row tl-head">
              <div class="tl-label tl-label--head"><span>Trabalho</span><span>período</span></div>
              <div class="tl-track" [style.width.px]="days().length * dayW()">
                <div class="tl-months">
                  @for (m of months(); track m.key) { <span [style.left.px]="m.at * dayW()" [style.width.px]="m.len * dayW()">{{ m.label }}</span> }
                </div>
                <div class="tl-days">
                  @for (t of ticks(); track t.iso) {
                    <span [style.left.px]="t.at * dayW()" [style.width.px]="zoom() === 'semana' ? dayW() : 7 * dayW()" [class.tl-today-tick]="t.iso === today">
                      @if (zoom() === 'semana') { <small>{{ t.wd }}</small> }{{ t.label }}
                    </span>
                  }
                </div>
                @if (d.end_date && inRange(d.end_date)) {
                  <span class="tl-flag" [style.left.px]="x(d.end_date) + dayW()" title="Entrega do projeto">Entrega {{ fmt(d.end_date) }}</span>
                }
              </div>
            </div>

            @for (r of rows(); track r.key; let i = $index) {
              <div class="tl-row" [class.tl-row--removed]="r.removed" [class.tl-row--new]="r.isNew" [class.tl-row--drag]="dragKey() === r.key"
                   [class.tl-row--sel]="selectedKey() === r.key"
                   [attr.draggable]="!!draft()" (dragstart)="dragStart($event, r.key)" (dragend)="dragKey.set(null)"
                   (dragover)="dragOver($event, i)" (drop)="$event.preventDefault()">
                <div class="tl-label" (click)="select(r.key)">
                  @if (draft()) { <span class="tl-grip" aria-hidden="true">⋮⋮</span> }
                  <span class="wk-dot" [style.background]="r.done ? 'var(--text-subtle)' : r.color"></span>
                  <div class="tl-label__text">
                    <button type="button" class="tl-label__name" [title]="r.name" (click)="select(r.key); $event.stopPropagation()">{{ r.name }}</button>
                    <div class="tl-label__dates">
                      @if (r.planned) { {{ fmt(r.planned.start) }} a {{ fmt(r.planned.end) }} }
                      @else if (r.cur) { <span class="muted">sem datas · {{ fmt(r.cur.start) }} a {{ fmt(r.cur.end) }}</span> }
                      @else { <span class="muted">novo</span> }
                      <span class="muted">· {{ r.duration }} {{ r.duration === 1 ? 'dia útil' : 'dias úteis' }}</span>
                    </div>
                    @if (draft() && r.next && !r.removed && (r.shift || r.isNew || !same(r.cur, r.next))) {
                      <div class="tl-label__sim">→ {{ fmt(r.next.start) }} a {{ fmt(r.next.end) }}
                        @if (r.shift) { <b [class.tl-back]="r.shift < 0">({{ r.shift > 0 ? '+' : '' }}{{ r.shift }})</b> }
                      </div>
                    } @else if (!draft() && r.drift && !r.done) {
                      <div class="tl-label__drift" [class.tl-back]="r.drift < 0">previsto {{ fmt(r.cur?.end) }} ({{ r.drift > 0 ? '+' : '' }}{{ r.drift }})</div>
                    } @else if (r.removed) {
                      <div class="tl-label__drift">sai da fila</div>
                    }
                  </div>
                  @if (draft() && !r.removed && !r.done) {
                    <input class="input tl-dur" type="number" min="1" max="365" [ngModel]="r.duration" (ngModelChange)="setDuration(r.key, $event)" (click)="$event.stopPropagation()" [attr.aria-label]="'Duração de ' + r.name" title="Duração em dias úteis" />
                  }
                  @if (draft()) {
                    <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="toggleRemove(r.key); $event.stopPropagation()"
                            [attr.aria-label]="r.removed ? 'Voltar ' + r.name + ' para a fila' : 'Tirar ' + r.name + ' da fila'"
                            [title]="r.removed ? 'Voltar para a fila' : 'Tirar da fila'"><app-icon [name]="r.removed ? 'back' : 'trash'" [size]="14" /></button>
                  }
                </div>
                <div class="tl-track" [style.width.px]="days().length * dayW()">
                  @if (ghostOf(r); as g) {
                    <div class="tl-ghost" [style.left.px]="x(g.start)" [style.width.px]="span(g)" [title]="(draft() ? 'Atual: ' : 'Planejado: ') + fmt(g.start) + ' a ' + fmt(g.end)"></div>
                  }
                  @if (barOf(r); as b) {
                    <span class="tl-date tl-date--start" [style.right.px]="days().length * dayW() - x(b.start) + 4">{{ fmt(b.start) }}</span>
                    <button type="button" class="tl-bar" [class.tl-bar--done]="r.done" [class.tl-bar--late]="b.late && !r.done" [class.tl-bar--new]="r.isNew"
                            [class.tl-bar--sel]="selectedKey() === r.key"
                            [style.left.px]="x(b.start)" [style.width.px]="span(b)" [style.--c]="r.color"
                            [title]="r.name + ': ' + fmt(b.start) + ' a ' + fmt(b.end) + (b.late && !r.done ? ' (atrasado)' : '')"
                            (click)="select(r.key)">
                      @if (r.work && !r.isNew) { <span class="tl-bar__fill" [style.width.%]="pct(r.work)"></span> }
                      <span class="tl-bar__label">{{ r.name }}</span>
                      @if (draft() && !r.done) { <span class="tl-handle" (pointerdown)="resizeStart($event, r, b)" (click)="$event.stopPropagation()" title="Arraste para mudar a duração"></span> }
                    </button>
                    <span class="tl-date tl-date--end" [style.left.px]="x(b.end) + dayW() + 4">
                      {{ fmt(b.end) }}
                      @if (draft() && r.shift) { <b class="tl-shift" [class.tl-back]="r.shift < 0">{{ r.shift > 0 ? '+' : '' }}{{ r.shift }} {{ abs(r.shift) === 1 ? 'dia útil' : 'dias úteis' }}</b> }
                      @else if (!draft() && r.drift && !r.done) { <b class="tl-shift" [class.tl-back]="r.drift < 0">{{ r.drift > 0 ? '+' : '' }}{{ r.drift }} vs. planejado</b> }
                    </span>
                  }
                </div>
              </div>
            }

            @for (w of weekendCols(); track w) {
              <i class="tl-weekend" [style.left.px]="labelWidth + w * dayW()" [style.width.px]="dayW()"></i>
            }
            @for (g of gridLines(); track g.at) {
              <i class="tl-vline" [class.tl-vline--month]="g.month" [style.left.px]="labelWidth + g.at * dayW()"></i>
            }
            <i class="tl-todaycol" [style.left.px]="labelWidth + x(today)" [style.width.px]="dayW()"></i>
            <div class="tl-line tl-line--today" [style.left.px]="labelWidth + x(today) + dayW() / 2"><span>Hoje</span></div>
            @if (d.end_date && inRange(d.end_date)) {
              <div class="tl-line tl-line--end" [style.left.px]="labelWidth + x(d.end_date) + dayW()"><span>Entrega do projeto</span></div>
            }
          </div>
        </div>

        @if (selected(); as r) {
          <div class="tl-panel">
            <div class="tl-panel__head">
              <span class="wk-dot" [style.background]="r.done ? 'var(--text-subtle)' : r.color"></span>
              <div class="grow" style="min-width: 0">
                <h3>{{ r.name }}</h3>
                <div class="muted small row" style="gap: 6px">
                  @if (r.work?.owner_name; as on) { <app-avatar [person]="{ name: on, initials: r.work?.owner_initials || '', color: r.work?.owner_color || '' }" />{{ on }} · }
                  <span [class]="'tl-status tl-status--' + statusOf(r).key">{{ statusOf(r).label }}</span>
                  @if (r.work) { · {{ r.work.tasks_done }} de {{ r.work.tasks_total }} tarefas ({{ pct(r.work) }}%) }
                </div>
              </div>
              @if (r.id && !r.isNew) { <button type="button" class="btn btn-sm" (click)="openWork(r)"><app-icon name="arrow" [size]="14" />Abrir trabalho</button> }
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="selectedKey.set(null)" aria-label="Fechar detalhes" title="Fechar"><app-icon name="x" [size]="14" /></button>
            </div>

            <div class="tl-panel__body">
              <section>
                <h4>Datas</h4>
                <dl class="tl-dates">
                  <dt>Planejado</dt>
                  <dd>@if (r.planned) { {{ fmt(r.planned.start) }} a {{ fmt(r.planned.end) }} · {{ businessSpan(r.planned.start, r.planned.end) }} dias úteis } @else { <span class="muted">sem data inicial e final</span> }</dd>
                  @if (r.cur) {
                    <dt>Previsto</dt>
                    <dd>{{ fmt(r.cur.start) }} a {{ fmt(r.cur.end) }}
                      @if (r.drift) { <b [class.wk-late]="r.drift > 0" [class.wk-ok]="r.drift < 0">({{ r.drift > 0 ? '+' : '' }}{{ r.drift }} {{ abs(r.drift) === 1 ? 'dia útil' : 'dias úteis' }})</b> }
                      @if (r.cur.late && !r.done) { <span class="wk-late"> · atrasado</span> }
                    </dd>
                  }
                  @if (draft()) {
                    <dt>Na simulação</dt>
                    <dd>
                      @if (r.removed) { <span class="wk-late">sai da fila</span> }
                      @else if (r.next) { <strong>{{ fmt(r.next.start) }} a {{ fmt(r.next.end) }}</strong>
                        @if (r.shift) { <b [class.wk-late]="r.shift > 0" [class.wk-ok]="r.shift < 0">({{ r.shift > 0 ? '+' : '' }}{{ r.shift }})</b> }
                      }
                    </dd>
                  }
                  @if (r.work?.completed_at) { <dt>Concluído em</dt><dd>{{ fmt(r.work?.completed_at) }}</dd> }
                </dl>
                @if (draft() && !r.removed && !r.done) {
                  <div class="tl-panel__edit">
                    <div class="field"><label for="tl-ps">Data inicial</label>
                      <input id="tl-ps" type="date" class="input" [ngModel]="draftOf(r.key)?.start_date" (ngModelChange)="setStart(r.key, $event)" /></div>
                    <div class="field"><label for="tl-pd">Duração (dias úteis)</label>
                      <input id="tl-pd" type="number" min="1" max="365" class="input" [ngModel]="r.duration" (ngModelChange)="setDuration(r.key, $event)" /></div>
                    <button type="button" class="btn btn-ghost btn-sm" style="align-self: flex-end" (click)="toggleRemove(r.key)"><app-icon name="trash" [size]="14" />Tirar da fila</button>
                  </div>
                } @else if (draft() && r.removed) {
                  <button type="button" class="btn btn-sm" (click)="toggleRemove(r.key)"><app-icon name="back" [size]="14" />Voltar para a fila</button>
                }
              </section>

              <section>
                <h4>Tarefas @if (r.work) { <span class="muted">{{ r.work.tasks_total }}</span> }</h4>
                @if (r.isNew) { <p class="muted small">Trabalho novo da simulação, ainda sem tarefas.</p> }
                @else if (tasksLoading()) { <p class="muted small">Carregando…</p> }
                @else if (!tasks().length) { <p class="muted small">Nenhuma tarefa neste trabalho.</p> }
                @else {
                  <ul class="tl-tasks">
                    @for (t of tasks().slice(0, 8); track t.id) {
                      <li [class.tl-task--done]="!!t.completed_at">
                        <i [style.background]="t.status.color || 'var(--text-subtle)'"></i>
                        <span class="tl-task__title" [title]="t.title">{{ t.title }}</span>
                        <span class="muted small">{{ t.status.name }}</span>
                        @if (t.assignee) { <app-avatar [person]="t.assignee" /> }
                        @if (t.due_date) { <span class="small" [class.wk-late]="!t.completed_at && t.due_date < today">{{ fmt(t.due_date) }}</span> }
                      </li>
                    }
                  </ul>
                  @if (tasks().length > 8) { <button type="button" class="btn btn-ghost btn-sm" (click)="openWork(r)">ver todas as {{ tasks().length }} tarefas</button> }
                }
              </section>

              <section>
                <h4>Informações</h4>
                <p class="small" style="white-space: pre-wrap; margin: 0 0 8px">{{ r.work?.description || 'Sem descrição.' }}</p>
                @if (r.work?.members?.length) {
                  <div class="row small muted" style="gap: 4px; flex-wrap: wrap">Participantes:
                    @for (m of r.work?.members || []; track m.id) { <span class="row" style="gap: 4px"><app-avatar [person]="m" />{{ m.name.split(' ')[0] }}</span> }
                  </div>
                }
              </section>
            </div>
          </div>
        } @else {
          <div class="tl-summary">
            <div><span class="muted small">Entrega prevista</span>
              <strong>
                {{ fmt(baseline().forecast_end) }}
                @if (draft() && simPlan().forecast_end !== baseline().forecast_end) {
                  → {{ fmt(simPlan().forecast_end) }}
                  <span [class.wk-late]="forecastShift() > 0" [class.wk-ok]="forecastShift() < 0">({{ forecastShift() > 0 ? '+' : '' }}{{ forecastShift() }})</span>
                }
              </strong>
            </div>
            <div><span class="muted small">Entrega do projeto</span><strong>{{ d.end_date ? fmt(d.end_date) : 'sem data' }}</strong></div>
            @if (d.end_date && current().forecast_end) {
              <div><span class="muted small">{{ slack() >= 0 ? 'Folga' : 'Atraso' }}</span>
                <strong [class.wk-late]="slack() < 0" [class.wk-ok]="slack() >= 0">{{ abs(slack()) }} {{ abs(slack()) === 1 ? 'dia útil' : 'dias úteis' }}</strong></div>
            }
            <div><span class="muted small">Trabalhos atrasados</span><strong [class.wk-late]="lateCount() > 0">{{ lateCount() }}</strong></div>
            <span class="grow"></span>
            <span class="muted small tl-hint">
              @if (draft()) { Arraste as linhas para reordenar e a ponta da barra para mudar a duração. Clique num trabalho para mudar a data inicial. }
              @else { Clique num trabalho para ver datas, tarefas e informações. Se um trabalho atrasa, os seguintes são empurrados. }
            </span>
          </div>
        }
      }
    } @else if (error()) {
      <div class="muted" style="padding: 30px 0">{{ error() }}</div>
    } @else {
      <div class="muted" style="padding: 30px 0">Carregando linha do tempo…</div>
    }
  `,
})
export class ProjectTimelineComponent implements OnChanges {
  projectId = input.required<number>();
  changed = output<void>();
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly labelWidth = 320;
  readonly today = isoOf(new Date());
  fmt = fmt;
  abs = Math.abs;
  same = same;
  businessSpan = businessSpan;

  data = signal<ProjectTimeline | null>(null);
  error = signal('');
  zoom = signal<'semana' | 'mes'>('semana');
  dayW = computed(() => (this.zoom() === 'semana' ? 34 : 12));
  draft = signal<DraftItem[] | null>(null);
  dragKey = signal<string | null>(null);
  selectedKey = signal<string | null>(null);
  tasks = signal<Task[]>([]);
  tasksLoading = signal(false);
  saving = signal(false);
  inserting: { name: string; duration: number; after: number } | null = null;
  private seq = 0;
  private tasksFor: number | null = null;

  baseline = computed(() => {
    const d = this.data();
    return computeTimeline((d?.works || []).map(w => ({ duration_days: w.duration_days, start_date: w.start_date, completed_at: w.completed_at })), d?.project_start || null, this.today);
  });
  private active = computed(() => (this.draft() || []).filter(i => !i.removed));
  simPlan = computed(() => computeTimeline(this.active(), this.data()?.project_start || null, this.today));
  current = computed(() => (this.draft() ? this.simPlan() : this.baseline()));

  rows = computed<Row[]>(() => {
    const d = this.data();
    if (!d) return [];
    const base = new Map(d.works.map((w, i) => [w.id, this.baseline().rows[i]]));
    const plannedOf = (w?: TimelineWork): Span | null =>
      w?.start_date && w.due_date ? { start: w.start_date, end: w.due_date } : null;
    const driftOf = (p: Span | null, c: TimelineRow | null) => (p && c ? businessDiff(p.end, c.end) || null : null);
    const draft = this.draft();
    if (!draft) {
      return d.works.map((w, i) => {
        const cur = this.baseline().rows[i];
        const planned = plannedOf(w);
        return {
          key: `w${w.id}`, id: w.id, name: w.name, color: w.color, duration: w.duration_days, done: !!w.completed_at,
          removed: false, isNew: false, work: w, planned, cur, next: null, drift: driftOf(planned, cur), shift: null,
        };
      });
    }
    const sim = this.simPlan().rows;
    let k = 0;
    return draft.map(it => {
      const cur = it.id ? base.get(it.id) || null : null;
      const next = it.removed ? null : sim[k++];
      const planned = plannedOf(it.work);
      return {
        key: it.key, id: it.id, name: it.name, color: it.color, duration: it.duration_days, done: !!it.completed_at,
        removed: it.removed, isNew: !it.id, work: it.work, planned, cur, next,
        drift: driftOf(planned, cur), shift: cur && next ? businessDiff(cur.end, next.end) || null : null,
      };
    });
  });
  selected = computed(() => this.rows().find(r => r.key === this.selectedKey()) || null);

  dirty = computed(() => {
    const draft = this.draft(); const d = this.data();
    if (!draft || !d) return false;
    const kept = draft.filter(i => !i.removed);
    if (kept.length !== d.works.length) return true;
    return kept.some((it, i) => {
      const w = d.works[i];
      return it.id !== w.id || it.duration_days !== w.duration_days || (it.start_date || null) !== (w.start_date || null) || !w.duration_saved;
    });
  });

  private range = computed(() => {
    const d = this.data();
    const dates = [this.today, d?.project_start || this.today];
    if (d?.end_date) dates.push(d.end_date);
    for (const r of this.rows()) for (const b of [r.cur, r.next, r.planned]) if (b) dates.push(b.start, b.end);
    dates.sort();
    const pad = this.zoom() === 'semana' ? 5 : 14;
    return { from: addDays(dates[0], -pad), to: addDays(dates[dates.length - 1], pad + 10) };
  });
  days = computed(() => {
    const out: string[] = [];
    const { from, to } = this.range();
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  });
  private index = computed(() => new Map(this.days().map((d, i) => [d, i])));
  months = computed(() => {
    const out: { key: string; label: string; at: number; len: number }[] = [];
    this.days().forEach((iso, i) => {
      const key = iso.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.key === key) last.len++;
      else { const dt = parseIso(iso); out.push({ key, label: `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`, at: i, len: 1 }); }
    });
    return out;
  });
  ticks = computed(() => {
    const week = this.zoom() === 'semana';
    return this.days()
      .map((iso, i) => ({ iso, at: i, dow: parseIso(iso).getDay() }))
      .filter(t => (week ? true : t.dow === 1))
      .map(t => ({ iso: t.iso, at: t.at, wd: WEEKDAYS[t.dow], label: String(parseIso(t.iso).getDate()) }));
  });
  gridLines = computed(() => {
    const monthStarts = new Set(this.months().slice(1).map(m => m.at));
    const out: { at: number; month: boolean }[] = [];
    this.days().forEach((iso, i) => {
      if (monthStarts.has(i)) out.push({ at: i, month: true });
      else if (parseIso(iso).getDay() === 1) out.push({ at: i, month: false });
    });
    return out;
  });
  weekendCols = computed(() => this.days().map((d, i) => (isBusiness(d) ? -1 : i)).filter(i => i >= 0));

  forecastShift = computed(() => {
    const a = this.baseline().forecast_end; const b = this.simPlan().forecast_end;
    return a && b ? businessDiff(a, b) : 0;
  });
  slack = computed(() => {
    const end = this.data()?.end_date; const f = this.current().forecast_end;
    return end && f ? businessDiff(f, end) : 0;
  });
  lateCount = computed(() => this.current().rows.filter(r => r.late).length);

  ngOnChanges() { this.selectedKey.set(null); this.load(); }

  load() {
    this.error.set('');
    this.api.projectTimeline(this.projectId()).subscribe({
      next: t => { this.data.set(t); setTimeout(() => this.scrollToToday(), 0); },
      error: e => this.error.set(errorMessage(e, 'Não foi possível carregar a linha do tempo.')),
    });
  }

  x(iso: string) {
    const i = this.index().get(iso);
    if (i !== undefined) return i * this.dayW();
    const from = this.range().from;
    return Math.round((parseIso(iso).getTime() - parseIso(from).getTime()) / 864e5) * this.dayW();
  }
  span(b: Span) { return Math.max(this.dayW(), this.x(b.end) - this.x(b.start) + this.dayW()); }
  inRange(iso: string) { return this.index().has(iso); }
  barOf(r: Row) { return this.draft() ? r.next : r.cur; }
  ghostOf(r: Row): Span | null {
    if (this.draft()) return r.cur && (r.shift || r.removed || !same(r.cur, r.next)) ? r.cur : null;
    return r.planned && !r.done && !same(r.planned, r.cur) ? r.planned : null;
  }
  pct(w: TimelineWork) { return w.tasks_total ? Math.round((w.tasks_done / w.tasks_total) * 100) : 0; }
  statusOf(r: Row) {
    if (r.done) return { key: 'done', label: 'Concluído' };
    if (r.cur?.late || (r.work?.tasks_overdue || 0) > 0) return { key: 'late', label: 'Atrasado' };
    if (r.drift && r.drift > 0) return { key: 'risk', label: 'Empurrado' };
    return { key: 'ok', label: 'No prazo' };
  }
  draftOf(key: string) { return this.draft()?.find(i => i.key === key) || null; }

  scrollToToday() {
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollLeft = Math.max(0, this.x(this.today) - 7 * this.dayW());
  }

  select(key: string) {
    this.selectedKey.set(this.selectedKey() === key ? null : key);
    const r = this.selected();
    if (!r?.id || r.isNew) { this.tasks.set([]); this.tasksFor = null; return; }
    if (this.tasksFor === r.id) return;
    this.tasksFor = r.id;
    this.tasksLoading.set(true);
    this.api.tasks({ project_id: this.projectId(), section_id: r.id, status: 'all', limit: 200 }).subscribe({
      next: t => { if (this.tasksFor === r.id) { this.tasks.set(t); this.tasksLoading.set(false); } },
      error: e => { this.tasksLoading.set(false); this.tasks.set([]); this.toast.error(errorMessage(e, 'Não foi possível carregar as tarefas.')); },
    });
  }

  openWork(r: Row) {
    if (!r.id || r.isNew) return;
    this.router.navigate(['/ti/taskhub/projetos', this.projectId(), 'trabalhos', r.id]);
  }

  startSim() {
    const d = this.data(); if (!d) return;
    this.draft.set(d.works.map(w => ({
      key: `w${w.id}`, id: w.id, name: w.name, color: w.color, duration_days: w.duration_days, start_date: w.start_date || null,
      completed_at: w.completed_at, removed: false, work: w,
    })));
  }
  discard() {
    if (this.selected()?.isNew) this.selectedKey.set(null);
    this.draft.set(null); this.inserting = null;
  }

  openInsert() {
    const list = this.draft() || [];
    let after = -1;
    list.forEach((it, i) => { if (!it.removed && !it.completed_at) after = i; });
    this.inserting = { name: '', duration: 5, after };
  }
  confirmInsert() {
    const f = this.inserting; const list = this.draft();
    if (!f || !list || (f.name || '').trim().length < 2) return;
    const item: DraftItem = {
      key: `n${++this.seq}`, name: f.name.trim(), color: COLORS[(list.length + this.seq) % COLORS.length],
      duration_days: this.clamp(f.duration), start_date: null, completed_at: null, removed: false,
    };
    const at = f.after + 1;
    this.draft.set([...list.slice(0, at), item, ...list.slice(at)]);
    this.inserting = null;
    this.selectedKey.set(item.key);
  }

  setDuration(key: string, v: number) {
    this.draft.update(l => l && l.map(it => (it.key === key ? { ...it, duration_days: this.clamp(v) } : it)));
  }
  setStart(key: string, v: string) {
    this.draft.update(l => l && l.map(it => (it.key === key ? { ...it, start_date: v || null } : it)));
  }
  toggleRemove(key: string) {
    this.draft.update(l => {
      if (!l) return l;
      const it = l.find(i => i.key === key);
      if (it && !it.id) { if (this.selectedKey() === key) this.selectedKey.set(null); return l.filter(i => i.key !== key); }
      return l.map(i => (i.key === key ? { ...i, removed: !i.removed } : i));
    });
  }
  private clamp(v: unknown) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : 1; }

  dragStart(e: DragEvent, key: string) {
    if (!this.draft()) { e.preventDefault(); return; }
    this.dragKey.set(key);
    e.dataTransfer?.setData('text/plain', key);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  dragOver(e: DragEvent, to: number) {
    const key = this.dragKey(); const list = this.draft();
    if (!key || !list) return;
    e.preventDefault();
    const from = list.findIndex(i => i.key === key);
    if (from < 0 || from === to) return;
    const next = [...list];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    this.draft.set(next);
  }

  resizeStart(e: PointerEvent, r: Row, b: TimelineRow) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const w = this.dayW();
    const move = (ev: PointerEvent) => {
      const end = addDays(b.end, Math.round((ev.clientX - startX) / w));
      this.setDuration(r.key, businessSpan(b.start, end));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  apply() {
    const list = this.draft(); if (!list) return;
    const removed = list.filter(i => i.removed && i.id);
    if (removed.length) {
      const tasks = removed.reduce((n, i) => n + (i.work?.tasks_total || 0), 0);
      const names = removed.map(i => i.name).join(', ');
      const what = removed.length === 1 ? 'O trabalho' : `${removed.length} trabalhos`;
      if (!confirm(`${what} ${names} ${removed.length === 1 ? 'será excluído' : 'serão excluídos'}${tasks ? ` com ${tasks} ${tasks === 1 ? 'tarefa' : 'tarefas'}` : ''}. Não dá para desfazer.\nAplicar a simulação?`)) return;
    }
    const body = {
      items: list.filter(i => !i.removed).map(i => (i.id
        ? { id: i.id, duration_days: i.duration_days, start_date: i.start_date }
        : { name: i.name, color: i.color, duration_days: i.duration_days, start_date: i.start_date })),
      remove: removed.map(i => i.id!),
    };
    this.saving.set(true);
    this.api.saveTimeline(this.projectId(), body).subscribe({
      next: t => {
        this.saving.set(false); this.draft.set(null); this.data.set(t); this.selectedKey.set(null);
        this.toast.show('Linha do tempo atualizada. As datas dos trabalhos foram recalculadas.');
        this.changed.emit();
      },
      error: e => {
        this.saving.set(false);
        this.toast.error(errorMessage(e, 'Não foi possível aplicar a simulação.'));
        if (e?.status === 409) { this.draft.set(null); this.load(); }
      },
    });
  }
}
