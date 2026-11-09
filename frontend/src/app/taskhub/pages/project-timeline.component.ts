import { Component, ElementRef, OnChanges, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { ProjectTimeline, Task, TimelineWork, WorkPause } from '../core/models';
import { TimelineRow, addDays, businessDays, businessDiff, businessSpan, computeTimeline, dayOf, isBusiness, isoOf, parseIso } from '../core/timeline';
import { AutofocusDirective, AvatarComponent, IconComponent } from '../shared/ui';
import { termsFor } from '../core/format';
import { DateLogComponent } from '../shared/date-log.component';

interface DraftItem {
  key: string; id?: number; name: string; color: string; duration_days: number; start_date: string | null;
  completed_at: string | null; removed: boolean; work?: TimelineWork; owner_ids?: number[];
}
interface Span { start: string; end: string }
interface Row {
  key: string; id?: number; name: string; color: string; duration: number; done: boolean; removed: boolean; isNew: boolean;
  work?: TimelineWork; planned: Span | null; cur: TimelineRow | null; next: TimelineRow | null;
  drift: number | null; shift: number | null; parallel?: string[]; pauses: WorkPause[]; pausedFor?: string[];
}
interface PhaseCard {
  phase_id: number; name: string; color: string; days: number; planned: number;
  from?: string; to?: string; pending?: boolean;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const COLORS = ['#4c8dff', '#2fbf71', '#e11d48', '#f97316', '#a78bfa', '#14b8a6', '#c9a84c', '#ec4899'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const fmt = (iso: string | null | undefined) => { if (!iso) return '—'; const d = parseIso(iso.slice(0, 10)); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`; };
const fmtYear = (iso: string) => { const d = parseIso(iso.slice(0, 10)); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; };
const same = (a: Span | null, b: Span | null) => !!a && !!b && a.start === b.start && a.end === b.end;
/** Trechos em que o projeto anda de fato: o período previsto menos as pausas. */
const activeSpans = (c: Span | null, pauses: WorkPause[]): Span[] => {
  let out: Span[] = c ? [{ start: c.start, end: c.end }] : [];
  for (const p of pauses) {
    out = out.flatMap(s => (p.end < s.start || p.start > s.end ? [s] : [
      ...(p.start > s.start ? [{ start: s.start, end: addDays(p.start, -1) }] : []),
      ...(p.end < s.end ? [{ start: addDays(p.end, 1), end: s.end }] : []),
    ]));
  }
  return out;
};
const spansMeet = (a: Span[], b: Span[]) => a.some(x => b.some(y => x.start <= y.end && y.start <= x.end));

// Régua do projeto: datas planejadas de cada trabalho, o previsto (com reajustes) e a simulação.
@Component({
  selector: 'app-project-timeline',
  standalone: true,
  imports: [FormsModule, AutofocusDirective, AvatarComponent, IconComponent, DateLogComponent],
  template: `
    @if (data(); as d) {
      <div class="tl-toolbar">
        <div class="wk-chips" role="group" aria-label="Escala da régua">
          <button type="button" [class.on]="zoom() === 'semana'" (click)="zoom.set('semana')">Semana</button>
          <button type="button" [class.on]="zoom() === 'mes'" (click)="zoom.set('mes')">Mês</button>
          <button type="button" [class.on]="zoom() === 'anual'" (click)="zoom.set('anual')">Anual</button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="scrollToToday()">Hoje</button>
        <span class="tl-legend"><i class="tl-legend__bar"></i>previsto <i class="tl-legend__late"></i>atrasado <i class="tl-legend__pause"></i>pausado</span>
        <span class="grow"></span>
        @if (draft()) {
          <span class="tl-sim-tag">Simulação · nada foi gravado</span>
          <button type="button" class="btn btn-sm" (click)="openInsert()"><app-icon name="plus" [size]="14" />Inserir {{ t().one }}</button>
          <button type="button" class="btn btn-ghost btn-sm" (click)="discard()">Descartar</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="!dirty() || saving() || (dateChanges().length > 0 && reason.trim().length < 10)" (click)="apply()">{{ saving() ? 'Aplicando…' : 'Aplicar' }}</button>
        } @else if (d.can_edit) {
          <button type="button" class="btn btn-sm" (click)="startSim()"><app-icon name="pencil" [size]="14" />Simular mudanças</button>
        }
      </div>

      @if (draft() && dirty()) {
        <div class="tl-reason">
          <div class="field"><label for="tl-reason">Motivo da alteração das datas @if (dateChanges().length) { <span class="wk-late">*</span> }</label>
            <input id="tl-reason" class="input" maxlength="500" [(ngModel)]="reason" placeholder="Ex.: cliente pediu para adiar a entrega" /></div>
          <span class="muted small">
            @if (dateChanges().length) { Muda as datas de {{ dateChanges().join(', ') }}. O motivo fica no histórico e as novas datas viram o planejado. }
            @else { Nenhuma data já combinada muda nesta simulação. }
          </span>
        </div>
      }

      @if (inserting; as f) {
        <div class="tl-insert">
          <div class="field"><label for="tl-in">Nome do {{ t().one }}</label><input id="tl-in" class="input" appAutofocus [(ngModel)]="f.name" placeholder="Ex.: Homologação" (keydown.enter)="confirmInsert()" /></div>
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
        <div class="tl-empty muted">{{ board() ? 'Nenhum projeto nesta equipe ainda.' : 'Nenhum projeto neste quadro ainda.' }} Crie o primeiro para montar a linha do tempo.</div>
      } @else {
        <div class="tl-scroll" #scroller>
          <div class="tl-grid" [style.width.px]="labelWidth + days().length * dayW()">
            <div class="tl-row tl-head">
              <div class="tl-label tl-label--head"><span>{{ t().One }}</span><span>período</span></div>
              <div class="tl-track" [style.width.px]="days().length * dayW()">
                <div class="tl-months">
                  @for (m of months(); track m.key) { <span [style.left.px]="m.at * dayW()" [style.width.px]="m.len * dayW()">{{ m.label }}</span> }
                </div>
                <div class="tl-days" [class.tl-days--anual]="zoom() === 'anual'">
                  @for (t of ticks(); track t.iso) {
                    <span [style.left.px]="t.at * dayW()" [style.width.px]="t.len * dayW()" [class.tl-today-tick]="t.today">
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
                      <div class="tl-label__drift" [class.tl-back]="r.drift < 0" [title]="'previsto ' + fmt(r.cur?.end) + ' (' + (r.drift > 0 ? '+' : '') + r.drift + ')'">previsto {{ fmt(r.cur?.end) }} ({{ r.drift > 0 ? '+' : '' }}{{ r.drift }})</div>
                    } @else if (r.removed) {
                      <div class="tl-label__drift">sai da fila</div>
                    }
                    @if (!draft() && r.pausedFor?.length) {
                      <div class="tl-label__drift" [title]="'pausado para ' + r.pausedFor!.join(', ')">pausado para {{ r.pausedFor!.join(', ') }}</div>
                    }
                    @if (!draft() && r.parallel?.length) {
                      <div class="tl-label__drift" [title]="'em paralelo com ' + r.parallel!.join(', ')">em paralelo com {{ r.parallel!.join(', ') }}</div>
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
                  @if (barOf(r); as b) {
                    <span class="tl-date tl-date--start" [style.right.px]="days().length * dayW() - x(b.start) + 4">{{ fmt(b.start) }}</span>
                    <button type="button" class="tl-bar" [class.tl-bar--done]="r.done" [class.tl-bar--late]="b.late && !r.done" [class.tl-bar--new]="r.isNew"
                            [class.tl-bar--sel]="selectedKey() === r.key" [class.tl-bar--phases]="selectedKey() === r.key && phasePlan(r).length"
                            [style.left.px]="x(b.start)" [style.width.px]="span(b)" [style.--c]="r.color"
                            [title]="selectedKey() === r.key && phasePlan(r).length ? '' : r.name + ': ' + fmt(b.start) + ' a ' + fmt(b.end) + (b.late && !r.done ? ' (atrasado)' : '')"
                            (click)="select(r.key)">
                      @if (selectedKey() === r.key && phasePlan(r).length) {
                        <span class="tl-bar__phases">
                          @for (s of phasePlan(r); track $index) {
                            <i [style.flex-grow]="s.days" [style.background]="s.color"
                               [title]="s.name + ': previsto ' + s.days + (s.days === 1 ? ' dia útil' : ' dias úteis')"></i>
                          }
                        </span>
                      } @else if (r.work && !r.isNew) {
                        <span class="tl-bar__fill" [style.width.%]="pct(r.work)"></span>
                      }
                      <span class="tl-bar__label">{{ r.name }}</span>
                      @if (draft() && !r.done) { <span class="tl-handle" (pointerdown)="resizeStart($event, r, b)" (click)="$event.stopPropagation()" title="Arraste para mudar a duração"></span> }
                    </button>
                    <span class="tl-date tl-date--end" [style.left.px]="x(b.end) + dayW() + 4">
                      {{ fmt(b.end) }}
                      @if (draft() && r.shift) { <b class="tl-shift" [class.tl-back]="r.shift < 0">{{ r.shift > 0 ? '+' : '' }}{{ r.shift }} {{ abs(r.shift) === 1 ? 'dia útil' : 'dias úteis' }}</b> }
                      @else if (!draft() && r.drift && !r.done) { <b class="tl-shift" [class.tl-back]="r.drift < 0">{{ r.drift > 0 ? '+' : '' }}{{ r.drift }} vs. planejado</b> }
                    </span>
                    @if (!draft()) {
                      @for (p of r.pauses; track $index) {
                        <span class="tl-pause" [style.left.px]="x(p.start)" [style.width.px]="span(p)" (click)="select(r.key)"
                              [title]="'Pausado de ' + fmt(p.start) + ' a ' + fmt(p.end) + (p.cause_name ? ' para ' + p.cause_name : '')"></span>
                      }
                    }
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
                  @if (r.work?.phase_name; as ph) { <span class="phase-chip" [style.--phase]="r.work?.phase_color">{{ ph }}</span> }
                  @if (r.work) { · {{ r.work.tasks_done }} de {{ r.work.tasks_total }} tarefas ({{ pct(r.work) }}%) }
                </div>
              </div>
              @if (r.id && !r.isNew) { <button type="button" class="btn btn-sm" (click)="openWork(r)"><app-icon name="arrow" [size]="14" />Abrir {{ t().one }}</button> }
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="selectedKey.set(null)" aria-label="Fechar detalhes" title="Fechar"><app-icon name="x" [size]="14" /></button>
            </div>

            <div class="tl-phases">
              <h4>Etapas</h4>
              @if (phaseCards(r); as cards) {
                @if (cards.length) {
                  <div class="tl-phase-cards">
                    @for (c of cards; track $index) {
                      <div class="tl-phase-card" [class.tl-phase-card--pending]="c.pending" [style.--pc]="c.color">
                        <b>{{ c.name }}</b>
                        @if (c.pending) {
                          <strong>previsto {{ c.planned }} {{ c.planned === 1 ? 'dia útil' : 'dias úteis' }}</strong>
                          <small>ainda não entrou nesta fase</small>
                        } @else {
                          <strong>{{ c.days }} {{ c.days === 1 ? 'dia útil' : 'dias úteis' }}</strong>
                          <small>{{ fmtYear(c.from!) }} - {{ fmtYear(c.to!) }}@if (c.planned) { · previsto {{ c.planned }} d }</small>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <p class="muted small">Ainda sem histórico de etapas.</p>
                }
              }
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
                  @for (p of r.pauses; track $index) {
                    <dt>Pausa</dt>
                    <dd>{{ fmt(p.start) }} a {{ fmt(p.end) }} · {{ businessSpan(p.start, p.end) }} dias úteis @if (p.cause_name) { <span class="muted">para {{ p.cause_name }}</span> }</dd>
                  }
                  @if (r.work?.completed_at) { <dt>Concluído em</dt><dd>{{ fmt(r.work?.completed_at) }}</dd> }
                </dl>
                @if (r.id && !r.isNew) {
                  <h4 style="margin-top: 14px">Histórico de datas</h4>
                  <app-date-log [workId]="r.id" />
                }
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
                @if (r.isNew) { <p class="muted small">{{ t().One }} novo da simulação, ainda sem tarefas.</p> }
                @else if (tasksLoading()) { <p class="muted small">Carregando…</p> }
                @else if (!tasks().length) { <p class="muted small">Nenhuma tarefa neste {{ t().one }}.</p> }
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
            <div><span class="muted small">{{ t().Many }} atrasados</span><strong [class.wk-late]="lateCount() > 0">{{ lateCount() }}</strong></div>
            <span class="grow"></span>
            <span class="muted small tl-hint">
              @if (draft()) { Arraste as linhas para reordenar e a ponta da barra para mudar a duração. Clique num {{ t().one }} para mudar a data inicial. }
              @else { Clique num {{ t().one }} para ver datas, tarefas e informações. O mesmo responsável faz um por vez e a fila dele é reajustada; pessoas diferentes andam em paralelo. }
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
  board = input(false);
  t = computed(() => termsFor());
  changed = output<void>();
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly labelWidth = 320;
  readonly today = isoOf(new Date());
  fmt = fmt;
  fmtYear = fmtYear;
  abs = Math.abs;
  same = same;
  businessSpan = businessSpan;

  data = signal<ProjectTimeline | null>(null);
  error = signal('');
  zoom = signal<'semana' | 'mes' | 'anual'>('semana');
  dayW = computed(() => this.zoom() === 'semana' ? 34 : this.zoom() === 'mes' ? 12 : 4);
  draft = signal<DraftItem[] | null>(null);
  dragKey = signal<string | null>(null);
  selectedKey = signal<string | null>(null);
  tasks = signal<Task[]>([]);
  tasksLoading = signal(false);
  saving = signal(false);
  inserting: { name: string; duration: number; after: number } | null = null;
  private seq = 0;
  private tasksFor: number | null = null;

  private ownersOf(w?: TimelineWork | DraftItem | null) {
    if (!w) return [] as number[];
    if ('owner_ids' in w && w.owner_ids?.length) return w.owner_ids;
    return ((w as TimelineWork).owners || []).map(o => o.id);
  }
  baseline = computed(() => {
    const d = this.data();
    return computeTimeline((d?.works || []).map(w => ({ duration_days: w.duration_days, start_date: w.start_date, completed_at: w.completed_at, owner_ids: this.ownersOf(w) })), d?.project_start || null, this.today);
  });
  private active = computed(() => (this.draft() || []).filter(i => !i.removed));
  simPlan = computed(() => computeTimeline(this.active().map(i => ({ duration_days: i.duration_days, start_date: i.start_date, completed_at: i.completed_at, owner_ids: this.ownersOf(i) })), this.data()?.project_start || null, this.today));
  current = computed(() => (this.draft() ? this.simPlan() : this.baseline()));

  rows = computed<Row[]>(() => {
    const d = this.data();
    if (!d) return [];
    const base = new Map(d.works.map((w, i) => [w.id, this.baseline().rows[i]]));
    const plannedOf = (w?: TimelineWork): Span | null => {
      const start = w?.planned_start ?? w?.start_date; const end = w?.planned_due ?? w?.due_date;
      return start && end ? { start, end } : null;
    };
    const driftOf = (p: Span | null, c: TimelineRow | null) => (p && c ? businessDiff(p.end, c.end) || null : null);
    const draft = this.draft();
    if (!draft) {
      const active = d.works.map((w, i) => activeSpans(this.baseline().rows[i], w.pauses || []));
      return d.works.map((w, i) => {
        const cur = this.baseline().rows[i];
        const planned = plannedOf(w);
        const pauses = (w.pauses || []).filter(p => !cur || (p.start <= cur.end && p.end >= cur.start));
        const parallel = d.works.filter((o, j) => j !== i && spansMeet(active[i], active[j])).map(o => o.name);
        const pausedFor = [...new Set(pauses.map(p => p.cause_name).filter((n): n is string => !!n))];
        return {
          key: `w${w.id}`, id: w.id, name: w.name, color: w.color, duration: w.duration_days, done: !!w.completed_at,
          removed: false, isNew: false, work: w, planned, cur, next: null, drift: driftOf(planned, cur), shift: null, parallel, pauses, pausedFor,
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
        removed: it.removed, isNew: !it.id, work: it.work, planned, cur, next, pauses: it.work?.pauses || [],
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

  /** Projetos com datas já combinadas que a simulação muda: exigem motivo. */
  dateChanges = computed(() => this.rows()
    .filter(r => r.id && !r.isNew && !r.removed && !r.done && (r.work?.start_date || r.work?.due_date) && r.next
      && (r.next.start !== (r.work?.start_date || null) || r.next.end !== (r.work?.due_date || null)))
    .map(r => r.name));
  reason = '';

  private range = computed(() => {
    const d = this.data();
    const dates = [this.today, d?.project_start || this.today];
    if (d?.end_date) dates.push(d.end_date);
    for (const r of this.rows()) for (const b of [r.cur, r.next, r.planned]) if (b) dates.push(b.start, b.end);
    dates.sort();
    const pad = this.zoom() === 'semana' ? 5 : this.zoom() === 'mes' ? 14 : 30;
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
    const year = this.zoom() === 'anual';
    const out: { key: string; label: string; at: number; len: number }[] = [];
    this.days().forEach((iso, i) => {
      const key = year ? iso.slice(0, 4) : iso.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.key === key) last.len++;
      else {
        const dt = parseIso(iso);
        out.push({ key, label: year ? String(dt.getFullYear()) : `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`, at: i, len: 1 });
      }
    });
    return out;
  });
  ticks = computed(() => {
    const days = this.days();
    const z = this.zoom();
    if (z === 'anual') {
      const out: { iso: string; at: number; wd: string; label: string; len: number; today: boolean }[] = [];
      days.forEach((iso, i) => {
        const key = iso.slice(0, 7);
        const last = out[out.length - 1];
        if (last && last.iso.slice(0, 7) === key) last.len++;
        else {
          const dt = parseIso(iso);
          out.push({ iso, at: i, wd: WEEKDAYS[dt.getDay()], label: MONTHS[dt.getMonth()], len: 1, today: key === this.today.slice(0, 7) });
        }
      });
      return out;
    }
    return days
      .map((iso, i) => ({ iso, at: i, dow: parseIso(iso).getDay() }))
      .filter(t => (z === 'semana' ? true : t.dow === 1))
      .map((t, k, list) => {
        const next = list[k + 1]?.at ?? days.length;
        return { iso: t.iso, at: t.at, wd: WEEKDAYS[t.dow], label: String(parseIso(t.iso).getDate()), len: next - t.at, today: t.iso === this.today };
      });
  });
  gridLines = computed(() => {
    const anual = this.zoom() === 'anual';
    const out: { at: number; month: boolean }[] = [];
    this.days().forEach((iso, i) => {
      if (!i) return;
      const prev = this.days()[i - 1];
      if (iso.slice(0, 7) !== prev.slice(0, 7)) out.push({ at: i, month: true });
      else if (!anual && parseIso(iso).getDay() === 1) out.push({ at: i, month: false });
    });
    return out;
  });
  weekendCols = computed(() => {
    if (this.zoom() === 'anual') return [];
    return this.days().map((d, i) => (isBusiness(d) ? -1 : i)).filter(i => i >= 0);
  });

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
  pct(w: TimelineWork) { return w.tasks_total ? Math.round((w.tasks_done / w.tasks_total) * 100) : 0; }
  phaseStays(r: Row): { phase_id: number; name: string; color: string; days: number; from: string; to: string }[] {
    const log = r.work?.phase_log || [];
    if (!log.length) return [];
    const until = dayOf(r.work?.completed_at) || this.today;
    const out: { phase_id: number; name: string; color: string; days: number; from: string; to: string }[] = [];
    log.forEach((entry, i) => {
      const from = dayOf(entry.changed_at);
      if (!from) return;
      const next = log[i + 1] ? dayOf(log[i + 1].changed_at) : null;
      const to = next ? addDays(next, -1) : until;
      const days = businessDays(from, to);
      if (days > 0) out.push({ phase_id: entry.phase_id, name: entry.phase_name, color: entry.phase_color, days, from, to });
    });
    return out;
  }
  phasePlan(r: Row): { name: string; color: string; days: number }[] {
    const phases = this.data()?.phases || [];
    const planned = phases.filter(p => (p.duration_days ?? 0) > 0);
    if (planned.length) return planned.map(p => ({ name: p.name, color: p.color, days: p.duration_days || 1 }));
    return this.phaseStays(r).map(s => ({ name: s.name, color: s.color, days: s.days }));
  }
  phaseCards(r: Row): PhaseCard[] {
    const phases = this.data()?.phases || [];
    const plannedOf = (id: number) => phases.find(p => p.id === id)?.duration_days ?? 0;
    const stays = this.phaseStays(r).map(s => ({
      phase_id: s.phase_id, name: s.name, color: s.color, days: s.days, planned: plannedOf(s.phase_id), from: s.from, to: s.to,
    }));
    const seen = new Set(stays.map(s => s.phase_id));
    const pending = phases.filter(p => (p.duration_days ?? 0) > 0 && !seen.has(p.id)).map(p => ({
      phase_id: p.id, name: p.name, color: p.color, days: 0, planned: p.duration_days || 0, pending: true,
    }));
    return [...stays, ...pending];
  }
  statusOf(r: Row) {
    if (r.done) return { key: 'done', label: 'Concluído' };
    if (r.cur?.late || (r.work?.tasks_overdue || 0) > 0) return { key: 'late', label: 'Atrasado' };
    if (r.drift && r.drift > 0) return { key: 'risk', label: 'Reajustado' };
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
      completed_at: w.completed_at, removed: false, work: w, owner_ids: this.ownersOf(w),
    })));
  }
  discard() {
    if (this.selected()?.isNew) this.selectedKey.set(null);
    this.draft.set(null); this.inserting = null; this.reason = '';
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
    // A data salva prende o projeto no lugar; ao arrastar um que ainda não começou, a fila decide o início.
    const notStarted = !it.completed_at && (!it.start_date || it.start_date > this.today);
    next.splice(to, 0, notStarted ? { ...it, start_date: null } : it);
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
      const what = removed.length === 1 ? `O ${this.t().one}` : `${removed.length} ${this.t().many}`;
      if (!confirm(`${what} ${names} ${removed.length === 1 ? 'será excluído' : 'serão excluídos'}${tasks ? ` com ${tasks} ${tasks === 1 ? 'tarefa' : 'tarefas'}` : ''}. Não dá para desfazer.\nAplicar a simulação?`)) return;
    }
    const body = {
      items: list.filter(i => !i.removed).map(i => (i.id
        ? { id: i.id, duration_days: i.duration_days, start_date: i.start_date }
        : { name: i.name, color: i.color, duration_days: i.duration_days, start_date: i.start_date })),
      remove: removed.map(i => i.id!),
      ...(this.reason.trim() ? { reason: this.reason.trim() } : {}),
    };
    this.saving.set(true);
    this.api.saveTimeline(this.projectId(), body).subscribe({
      next: t => {
        this.saving.set(false); this.draft.set(null); this.data.set(t); this.selectedKey.set(null); this.reason = '';
        this.toast.show(`Linha do tempo atualizada. As datas dos ${this.t().many} foram recalculadas.`);
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
