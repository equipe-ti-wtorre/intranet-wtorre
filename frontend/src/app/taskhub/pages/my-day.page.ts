import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, errorMessage } from '../core/api.service';
import { UiService } from '../core/ui.service';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { DayData, DayItem, Load, Period, Task } from '../core/models';
import { TaskSize, addDaysIso, dueLabel, longDate, sizeInfo, todayIso } from '../core/format';
import { WeatherService } from '../core/weather.service';
import { DAY_SLIDES, DaySlideKey, DeckSlide, buildDayDeck } from '../presentation/day-deck';
import { DeckViewerComponent } from '../presentation/deck-viewer.component';
import { downloadDeckPptx } from '../presentation/deck-pptx';

type PlanTask = Task & { period: Period };
type Line =
  | { kind: 'task'; key: string; task: PlanTask }
  | { kind: 'routine' | 'reminder'; key: string; item: DayItem };

const PERIODS: { key: Period; label: string }[] = [
  { key: 'manha', label: 'Manhã' },
  { key: 'tarde', label: 'Tarde' },
  { key: 'fim', label: 'Fim do dia' },
];
const LOAD_LABEL: Record<Load, string> = { leve: 'leve', equilibrado: 'equilibrada', cheio: 'cheia' };
// Horário padrão quando a rotina é criada direto num período (o horário não aparece na tela).
const PERIOD_TIME: Record<Period, string> = { manha: '09:00', tarde: '14:00', fim: '17:30' };

// Meu Dia em "linha do dia": tarefas, rotina e lembretes numa lista só, em Manhã, Tarde e
// Fim do dia. Sem horários: a carga vem do tamanho da tarefa (Rápida/Normal/Longa).
@Component({
  selector: 'app-my-day',
  standalone: true,
  imports: [FormsModule, RouterLink, DeckViewerComponent],
  template: `
    <div class="page day-line">
      <div class="page-head">
        <div>
          <div class="sub">{{ dateLabel() }}@if (weather(); as w) { · <span class="day-weather">{{ w.temp }}°</span>@if (w.place) { {{ w.place }} } } @if (!isToday()) { · <button class="link-btn" (click)="goToday()">voltar para hoje</button> }</div>
          <h1>{{ greeting() }}</h1>
        </div>
        <div class="actions">
          <button class="btn btn-ghost btn-icon" (click)="shift(-1)" aria-label="Dia anterior" title="Dia anterior">‹</button>
          <button class="btn btn-ghost btn-icon" (click)="shift(1)" aria-label="Próximo dia" title="Próximo dia">›</button>
          <div class="seg" role="group" aria-label="Espaço">
            <button [class.on]="space() === 'todos'" (click)="space.set('todos')">Tudo</button>
            <button [class.on]="space() === 'profissional'" (click)="space.set('profissional')">Corporativo</button>
            <button [class.on]="space() === 'pessoal'" (click)="space.set('pessoal')">Individual</button>
          </div>
          <button class="btn-action-secondary" (click)="distribute()" [disabled]="!d()">Distribuir pelo dia</button>
          <button class="btn-action-secondary" (click)="openPresent()" [disabled]="!d()">Apresentação</button>
          <button class="btn-action-primary" (click)="openClose()" [disabled]="!d()">Encerrar o dia</button>
        </div>
      </div>

      @if (d(); as d) {
        <!-- Resumo: progresso por período e o que pede atenção -->
        <section class="card dl-summary">
          <div class="dl-progress">
            <div class="row" style="justify-content: space-between"><b>Seu dia</b><span class="muted small">{{ doneCount() }} de {{ totalCount() }} itens feitos</span></div>
            <div class="dl-bars">
              @for (p of periodView(); track p.key) {
                <div>
                  <div class="dl-bar"><span [style.width.%]="p.pct" [class.dl-bar--done]="p.state === 'feita'"></span></div>
                  <div class="dl-bar__label" [class.on]="p.state === 'agora'">{{ p.label }} · {{ p.state === 'feita' ? 'feita' : p.state === 'agora' ? 'agora' : loadLabel(p.load) }}</div>
                </div>
              }
            </div>
          </div>
          <div class="dl-chips">
            @if (d.counts.overdue) { <button class="dl-chip dl-chip--late" (click)="filter.set('overdue')">{{ d.counts.overdue }} {{ d.counts.overdue === 1 ? 'atrasada' : 'atrasadas' }}</button> }
            @if (d.counts.today) { <button class="dl-chip dl-chip--today" (click)="filter.set('today')">{{ d.counts.today }} {{ d.counts.today === 1 ? 'vence hoje' : 'vencem hoje' }}</button> }
            @if (d.counts.waiting_me) { <button class="dl-chip dl-chip--wait" (click)="scrollTo('dl-waiting')">{{ d.counts.waiting_me }} esperando você</button> }
            @if (!d.counts.overdue && !d.counts.today && !d.counts.waiting_me) { <span class="muted small">Nada atrasado nem esperando você.</span> }
          </div>
        </section>

        <div class="dl-grid">
          <!-- Linha do dia -->
          <section class="card dl-line">
            @for (p of periodView(); track p.key) {
              <div class="dl-period" [class.dl-period--now]="p.state === 'agora'" (dragover)="$event.preventDefault(); dropOn.set(p.key)" (dragleave)="dropOn.set(null)" (drop)="drop($event, p.key)" [class.dl-period--drop]="dropOn() === p.key">
                <div class="dl-period__head">
                  <span class="dl-period__name">{{ p.label }}</span>
                  <span class="dl-period__state" [class]="'dl-period__state dl-period__state--' + (p.state === 'feita' ? 'done' : p.load)">
                    {{ p.state === 'feita' ? 'concluída' : (p.state === 'agora' ? 'agora · ' : '') + loadLabel(p.load) }}
                  </span>
                  <span class="dl-period__count">{{ p.done }} de {{ p.total }}</span>
                </div>
                @for (l of lines(p.key); track l.key) {
                  @if (l.kind === 'task') {
                    <div class="dl-row" [class.dl-row--done]="closed(l.task)" [class.dl-row--focus]="l.task.status.category === 'doing'" draggable="true" (dragstart)="drag($event, l.task.id)">
                      <button class="tick" [class.on]="closed(l.task)" [disabled]="!canTick(l.task)" (click)="toggleTask(l.task)" [attr.aria-label]="closed(l.task) ? 'Reabrir' : 'Concluir'"></button>
                      <span class="dl-kind" [class.dl-kind--focus]="l.task.status.category === 'doing'">{{ l.task.status.category === 'doing' ? 'Em foco' : l.task.status.category === 'blocked' ? 'Bloqueada' : 'Tarefa' }}</span>
                      <button class="dl-title" (click)="ui.openTask(l.task.id)">{{ l.task.title }}</button>
                      @if (l.task.project) { <span class="tag">{{ l.task.project.name }}</span> } @else if (l.task.space === 'pessoal') { <span class="tag">Individual</span> }
                      @if (dueText(l.task); as dt) { <span class="dl-due" [class]="'dl-due dl-due--' + dt.tone">{{ dt.text }}</span> }
                      @if (l.task.size) { <span class="sz" [class]="'sz sz--' + l.task.size" [title]="sizeLabel(l.task.size)">{{ sizeShort(l.task.size) }}</span> }
                      <select class="dl-move" [ngModel]="l.task.period" (ngModelChange)="move(l.task, $event)" aria-label="Mover para outro período" title="Mover para outro período">
                        @for (o of periods; track o.key) { <option [value]="o.key">{{ o.label }}</option> }
                      </select>
                      <button class="dl-x" (click)="removeFromPlan(l.task)" aria-label="Tirar do plano" title="Tirar do plano">×</button>
                    </div>
                  } @else {
                    <div class="dl-row" [class.dl-row--done]="l.item.done">
                      @if (l.kind === 'reminder') {
                        <button class="tick tick--square" [class.on]="l.item.done" (click)="toggleReminder(l.item)" [attr.aria-label]="l.item.done ? 'Reabrir lembrete' : 'Concluir lembrete'"></button>
                        <span class="dl-kind dl-kind--rem">Lembrete</span>
                      } @else {
                        <button class="tick" [class.on]="l.item.done" (click)="toggleRoutine(l.item)" [attr.aria-label]="l.item.done ? 'Desmarcar' : 'Marcar como feita'"></button>
                        <span class="dl-kind">Rotina</span>
                      }
                      <span class="dl-title dl-title--static">{{ l.item.title }}</span>
                    </div>
                  }
                } @empty {
                  <div class="dl-empty">Nada aqui ainda. Arraste uma tarefa ou adicione abaixo.</div>
                }
                <div class="dl-add">
                  <button (click)="ui.openQuickAdd({ plan_today: true, plan_period: p.key, space: quickSpace() })">+ Tarefa</button>
                  <button (click)="openRoutine(p.key)">+ Rotina</button>
                </div>
              </div>
            }
          </section>

          <!-- Lateral -->
          <aside class="dl-side">
            <section class="card dl-card">
              <div class="row" style="justify-content: space-between"><b>Para escolher</b><span class="muted small">{{ pick().length }}</span></div>
              <div class="dl-filters" role="group" aria-label="Filtrar sugestões">
                @for (f of filters; track f.key) {
                  <button [class.on]="filter() === f.key" (click)="filter.set(f.key)">{{ f.label }} @if (f.key !== 'all') { {{ countOf(f.key) }} }</button>
                }
              </div>
              @for (t of pick().slice(0, 8); track t.id) {
                <div class="dl-pick" draggable="true" (dragstart)="drag($event, t.id)">
                  @if (t.size) { <span class="sz" [class]="'sz sz--' + t.size" [title]="sizeLabel(t.size)">{{ sizeShort(t.size) }}</span> }
                  <button class="dl-title" (click)="ui.openTask(t.id)">{{ t.title }}</button>
                  @if (dueText(t); as dt) { <span class="dl-due" [class]="'dl-due dl-due--' + dt.tone">{{ dt.text }}</span> }
                  <button class="dl-plus" (click)="addToPlan(t, d.current_period || 'manha')" [attr.aria-label]="'Adicionar ' + t.title + ' ao plano'" title="Adicionar ao período atual">+</button>
                </div>
              } @empty { <div class="muted small" style="padding: 6px 0">Nada pendente aqui.</div> }
              @if (pick().length > 8) { <a class="small" routerLink="/ti/taskhub/tarefas" [queryParams]="{ v: 'minhas', space: 'profissional' }">Ver todas</a> }
              <div class="muted small" style="margin-top: 8px">Arraste para um período ou use o +.</div>
            </section>

            <section class="card dl-card" id="dl-waiting">
              <b>Esperando</b>
              @for (w of d.waiting.for_me; track w.task_id) {
                <button class="dl-wait" (click)="ui.openTask(w.task_id)"><span class="dl-wait__tag">por você</span><span>{{ w.from ? w.from + ' pediu: ' : '' }}{{ w.step }}</span></button>
              }
              @for (w of d.waiting.by_me; track w.id) {
                <button class="dl-wait" (click)="ui.openTask(w.task_id)"><span class="dl-wait__tag dl-wait__tag--out">por outros</span><span>{{ w.person }}: {{ w.step }}@if (w.days > 1) { <span class="dl-due dl-due--today"> · {{ w.days }} dias</span> }</span></button>
              }
              @if (!d.waiting.for_me.length && !d.waiting.by_me.length) { <div class="muted small" style="margin-top: 6px">Ninguém esperando por você, e você não está esperando ninguém.</div> }
            </section>

            <section class="card dl-card">
              <div class="row" style="justify-content: space-between"><b>Amanhã</b><a class="small" routerLink="/ti/taskhub/lembretes">Lembretes</a></div>
              <div class="muted small" style="margin-top: 6px">
                {{ d.tomorrow.planned ? d.tomorrow.planned + (d.tomorrow.planned === 1 ? ' tarefa já planejada' : ' tarefas já planejadas') : 'Nada planejado ainda' }}
                @if (d.tomorrow.due) { · {{ d.tomorrow.due }} {{ d.tomorrow.due === 1 ? 'vence' : 'vencem' }} amanhã }
              </div>
            </section>
          </aside>
        </div>
      } @else {
        <div class="muted" style="padding: 40px 0">Carregando seu dia…</div>
      }
    </div>

    @if (routineFor(); as period) {
      <div class="modal-scrim" (click)="routineFor.set(null)">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Nova rotina">
          <div class="modal-head">Nova rotina</div>
          <div class="modal-body">
            <div class="muted small">Repete toda {{ weekdayName() }}, no período {{ periodLabel(period) }}.</div>
            <div class="field"><label class="form-label" for="rt-label">O que fazer</label>
              <input id="rt-label" class="form-field" [(ngModel)]="routineLabel" (keydown.enter)="saveRoutine()" placeholder="Ex.: Daily da equipe" /></div>
          </div>
          <div class="modal-foot">
            <button class="btn-action-secondary" (click)="routineFor.set(null)">Cancelar</button>
            <button class="btn-action-primary" [disabled]="!routineLabel.trim()" (click)="saveRoutine()">Criar rotina</button>
          </div>
        </div>
      </div>
    }

    @if (choosing()) {
      <div class="modal-scrim" (click)="choosing.set(false)">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Apresentação do dia">
          <div class="modal-head">Apresentação do dia<div class="muted small" style="font-weight:500;margin-top:2px">{{ dateLabel() }} · escolha os slides e como apresentar</div></div>
          <div class="modal-body">
            <div class="field"><label class="form-label" for="dp-t">Título</label><input id="dp-t" class="form-field" [(ngModel)]="ptitle" /></div>
            <div class="row" style="justify-content: space-between">
              <span class="form-label">Slides ({{ picked().length }} de {{ daySlides.length }})</span>
              <span class="row small"><button type="button" class="link-btn" (click)="picked.set(allSlides)">Todos</button> · <button type="button" class="link-btn" (click)="picked.set([])">Nenhum</button></span>
            </div>
            <div class="pd-pick">
              @for (sl of daySlides; track sl.key) {
                <label class="check-label" style="align-items: flex-start">
                  <input type="checkbox" style="margin-top: 3px" [checked]="picked().includes(sl.key)" (change)="togglePick(sl.key)" />
                  <span>{{ sl.label }}<br /><span class="muted small">{{ sl.hint }}</span></span>
                </label>
              }
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn-action-secondary" [disabled]="!picked().length || exporting()" (click)="downloadPptx()">{{ exporting() ? 'Gerando…' : 'Baixar PowerPoint' }}</button>
            <button type="button" class="btn-action-primary" [disabled]="!picked().length" (click)="present()">Apresentar</button>
          </div>
        </div>
      </div>
    }

    @if (presenting()) { <app-deck-viewer [slides]="deck()" [footer]="'TaskHub · Meu Dia · ' + dateLabel()" (close)="presenting.set(false)" /> }

    @if (closing()) {
      <div class="modal-scrim" (click)="closing.set(false)">
        <div class="modal wide" (click)="$event.stopPropagation()" role="dialog" aria-label="Encerrar o dia">
          <div class="modal-head">Encerrar o dia</div>
          <div class="modal-body">
            <div class="muted small">{{ dateLabel() }}</div>
            @if (d(); as d) {
              <div class="dl-close-kpis">
                <div class="dl-kpi dl-kpi--brand"><b>{{ doneTasks() }}</b><span>concluídas</span></div>
                <div class="dl-kpi"><b>{{ leftTasks().length }}</b><span>ficaram do plano</span></div>
                <div class="dl-kpi"><b>{{ d.tomorrow.due }}</b><span>vencem amanhã</span></div>
              </div>
              @if (leftTasks().length) {
                <div class="form-label">O que ficou</div>
                @for (t of leftTasks(); track t.id) {
                  <div class="dl-close-row">
                    <span class="grow">{{ t.title }}</span>
                    <div class="seg" role="group" [attr.aria-label]="'Destino de ' + t.title">
                      <button [class.on]="closeActions[t.id] !== 'remover'" (click)="closeActions[t.id] = 'amanha'">Amanhã</button>
                      <button [class.on]="closeActions[t.id] === 'remover'" (click)="closeActions[t.id] = 'remover'">Voltar para a fila</button>
                    </div>
                  </div>
                }
              }
              <div class="field"><label class="form-label" for="dl-note">Algo travou? <span class="form-label__optional">opcional</span></label>
                <textarea id="dl-note" class="form-field" [(ngModel)]="closeNote"></textarea></div>
              <span class="muted small">O resumo fica só para você. O que for para amanhã entra na manhã do dia seguinte.</span>
            }
          </div>
          <div class="modal-foot">
            <button class="btn-action-secondary" (click)="closing.set(false)">Cancelar</button>
            <button class="btn-action-primary" (click)="confirmClose()">Encerrar o dia</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MyDayPage implements OnInit, OnDestroy {
  ui = inject(UiService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private weatherSvc = inject(WeatherService);
  weather = this.weatherSvc.local;

  periods = PERIODS;
  filters = [
    { key: 'all' as const, label: 'Todas' }, { key: 'overdue' as const, label: 'Atrasadas' },
    { key: 'today' as const, label: 'Hoje' }, { key: 'week' as const, label: 'Semana' },
  ];
  date = signal(todayIso());
  d = signal<DayData | null>(null);
  space = signal<'todos' | 'profissional' | 'pessoal'>('todos');
  filter = signal<'all' | 'overdue' | 'today' | 'week'>('all');
  dropOn = signal<Period | null>(null);
  routineFor = signal<Period | null>(null);
  routineLabel = '';
  closing = signal(false);
  closeActions: Record<number, 'amanha' | 'remover'> = {};
  closeNote = '';
  private sub?: Subscription;

  daySlides = DAY_SLIDES;
  allSlides = DAY_SLIDES.map(x => x.key);
  choosing = signal(false);
  presenting = signal(false);
  exporting = signal(false);
  picked = signal<DaySlideKey[]>(DAY_SLIDES.map(x => x.key));
  ptitle = '';
  deck = signal<DeckSlide[]>([]);

  isToday = computed(() => this.date() === todayIso());
  dateLabel = computed(() => { const l = longDate(this.date()); return l.charAt(0).toUpperCase() + l.slice(1); });
  weekdayName = computed(() => new Date(`${this.date()}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }));
  greeting = computed(() => {
    const h = new Date().getHours(); const first = this.auth.user()?.name.split(' ')[0] || '';
    return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${first}`;
  });
  quickSpace = computed(() => { const s = this.space(); return s === 'todos' ? undefined : s; });

  private inSpace = (t: Task) => this.space() === 'todos' || t.space === this.space();
  plan = computed(() => (this.d()?.plan || []).filter(t => this.inSpace(t)));

  // Estado de cada período: feita (tudo concluído), agora (período atual) ou futura.
  periodView = computed(() => {
    const d = this.d(); if (!d) return [];
    const order: Period[] = ['manha', 'tarde', 'fim'];
    const nowIdx = d.current_period ? order.indexOf(d.current_period) : -1;
    return PERIODS.map((p, i) => {
      const info = d.periods.find(x => x.key === p.key)!;
      const tasks = this.plan().filter(t => t.period === p.key);
      const items = [...tasks.map(t => this.closed(t)), ...d.routine.filter(r => r.period === p.key).map(r => r.done), ...d.reminders.filter(r => r.period === p.key).map(r => r.done)];
      const total = items.length; const done = items.filter(Boolean).length;
      const state = total && done === total && (nowIdx === -1 || i <= nowIdx) ? 'feita' : i === nowIdx ? 'agora' : 'futura';
      return { ...p, load: info.load, total, done, pct: total ? (done / total) * 100 : 0, state };
    });
  });
  doneCount = computed(() => this.periodView().reduce((s, p) => s + p.done, 0));
  totalCount = computed(() => this.periodView().reduce((s, p) => s + p.total, 0));

  lines(p: Period): Line[] {
    const d = this.d(); if (!d) return [];
    const tasks: Line[] = this.plan().filter(t => t.period === p).map(t => ({ kind: 'task', key: `t${t.id}`, task: t }));
    const routine: Line[] = d.routine.filter(r => r.period === p).map(r => ({ kind: 'routine', key: `r${r.id}`, item: r }));
    const rem: Line[] = d.reminders.filter(r => r.period === p).map(r => ({ kind: 'reminder', key: `m${r.id}`, item: r }));
    // Rotina primeiro (marca o começo do período), depois tarefas e lembretes.
    return [...routine, ...tasks, ...rem];
  }

  private all = computed(() => {
    const s = this.d()?.suggestions; if (!s) return { overdue: [], today: [], week: [], all: [] as Task[] };
    const vis = (l: Task[]) => l.filter(t => this.inSpace(t) && !this.ui.hidden().has(t.id));
    const overdue = vis(s.overdue); const today = vis(s.today); const week = vis([...s.carryover, ...s.week]);
    return { overdue, today, week, all: [...overdue, ...today, ...week, ...vis(s.recent), ...vis(s.backlog)] };
  });
  pick = computed(() => { const a = this.all(); const f = this.filter(); return f === 'all' ? a.all : a[f]; });
  countOf(k: 'overdue' | 'today' | 'week') { return this.all()[k].length; }

  doneTasks = computed(() => (this.d()?.plan || []).filter(t => t.status.category === 'done').length);
  leftTasks = computed(() => (this.d()?.plan || []).filter(t => !this.closed(t)));

  ngOnInit() {
    this.load();
    this.weatherSvc.load();
    this.sub = this.ui.taskChanged$.subscribe(() => this.load());
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  load() {
    this.api.day(this.date()).subscribe({
      next: d => this.d.set(d),
      error: e => this.toast.error(errorMessage(e, 'Não foi possível carregar o seu dia.')),
    });
  }
  shift(n: number) { this.date.set(addDaysIso(this.date(), n)); this.d.set(null); this.load(); }
  goToday() { this.date.set(todayIso()); this.d.set(null); this.load(); }

  closed(t: Task) { return t.status.category === 'done' || t.status.category === 'canceled'; }
  canTick(t: Task) { return t.access === 'edit' || t.access === 'work'; }
  loadLabel(l: Load) { return LOAD_LABEL[l]; }
  sizeLabel(s: TaskSize) { return sizeInfo(s).hint; }
  sizeShort(s: TaskSize) { return sizeInfo(s).short; }
  periodLabel(p: Period) { return PERIODS.find(x => x.key === p)!.label.toLowerCase(); }
  dueText(t: Task): { text: string; tone: string } | null {
    if (!t.due_date || this.closed(t)) return null;
    const today = this.date();
    const due = String(t.due_date).slice(0, 10);
    if (due < today) return { text: 'atrasada', tone: 'late' };
    if (due === today) return { text: 'vence hoje', tone: 'today' };
    return { text: dueLabel(due).toLowerCase(), tone: 'soon' };
  }
  scrollTo(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  addToPlan(t: Task, period: Period) {
    this.api.planAdd(t.id, this.date(), undefined, period).subscribe({
      next: () => this.load(), error: e => this.toast.error(errorMessage(e, 'Não foi possível adicionar ao plano.')),
    });
  }
  move(t: PlanTask, period: Period) {
    if (t.period === period) return;
    this.d.update(d => d && ({ ...d, plan: d.plan.map(x => (x.id === t.id ? { ...x, period } : x)) }));
    this.api.planAdd(t.id, this.date(), undefined, period).subscribe({
      next: () => this.load(), error: e => { this.toast.error(errorMessage(e, 'Não foi possível mover a tarefa.')); this.load(); },
    });
  }
  removeFromPlan(t: Task) {
    this.api.planRemove(t.id, this.date()).subscribe({ next: () => this.load(), error: e => this.toast.error(errorMessage(e, 'Não foi possível tirar do plano.')) });
  }
  drag(e: DragEvent, id: number) { e.dataTransfer?.setData('text/plain', String(id)); }
  drop(e: DragEvent, period: Period) {
    e.preventDefault(); this.dropOn.set(null);
    const id = Number(e.dataTransfer?.getData('text/plain')); if (!id) return;
    const inPlan = this.d()?.plan.find(t => t.id === id);
    if (inPlan) this.move(inPlan, period);
    else this.addToPlan({ id } as Task, period);
  }
  distribute() {
    this.api.distributeDay(this.date()).subscribe({
      next: r => { this.load(); r.added ? this.toast.show(`${r.added} ${r.added === 1 ? 'tarefa distribuída' : 'tarefas distribuídas'} pelo dia.`) : this.toast.show('Nada novo para distribuir. Atrasadas, as de hoje e o que sobrou já estão no plano.'); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível distribuir o dia.')),
    });
  }

  toggleTask(t: Task) {
    this.api.updateTask(t.id, { done: !this.closed(t) }).subscribe({
      next: () => { this.load(); this.ui.taskChanged$.next(t.id); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível atualizar a tarefa.')),
    });
  }
  toggleRoutine(r: DayItem) {
    this.api.routineCheck(r.id, this.date(), !r.done).subscribe({ next: () => this.load(), error: e => this.toast.error(errorMessage(e, 'Não foi possível marcar a rotina.')) });
  }
  toggleReminder(r: DayItem) {
    this.api.updateReminder(r.id, { done: !r.done }).subscribe({ next: () => this.load(), error: e => this.toast.error(errorMessage(e, 'Não foi possível atualizar o lembrete.')) });
  }

  openRoutine(p: Period) { this.routineLabel = ''; this.routineFor.set(p); }
  saveRoutine() {
    const p = this.routineFor(); if (!p || !this.routineLabel.trim()) return;
    const weekday = new Date(`${this.date()}T12:00:00`).getDay();
    this.api.addRoutineBlock({ weekday, startTime: PERIOD_TIME[p], label: this.routineLabel.trim() }).subscribe({
      next: () => { this.routineFor.set(null); this.load(); this.toast.show('Rotina criada.'); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível criar a rotina.')),
    });
  }

  openPresent() {
    this.ptitle = `Meu dia · ${this.dateLabel()}`;
    this.choosing.set(true);
  }
  togglePick(k: DaySlideKey) { this.picked.update(l => (l.includes(k) ? l.filter(x => x !== k) : [...l, k])); }
  private buildDeck() {
    const d = this.d(); if (!d) return [];
    return buildDayDeck(d, this.picked(), this.auth.user()?.name || '', this.ptitle.trim() || `Meu dia · ${this.dateLabel()}`);
  }
  present() { this.deck.set(this.buildDeck()); this.choosing.set(false); this.presenting.set(true); }
  async downloadPptx() {
    this.exporting.set(true);
    try {
      await downloadDeckPptx(this.buildDeck(), this.ui.palette(), `TaskHub · Meu Dia · ${this.dateLabel()}`, `meu-dia-${this.date()}`);
      this.toast.show('PowerPoint gerado. O arquivo foi baixado.');
      this.choosing.set(false);
    } catch {
      this.toast.error('Não foi possível gerar o PowerPoint.');
    } finally { this.exporting.set(false); }
  }

  openClose() { this.closeActions = {}; this.closeNote = ''; this.closing.set(true); }
  confirmClose() {
    const actions = this.leftTasks().map(t => ({ task_id: t.id, action: this.closeActions[t.id] || 'amanha' }));
    this.api.closeDay({ date: this.date(), actions, note: this.closeNote }).subscribe({
      next: r => { this.closing.set(false); this.load(); this.toast.show(r.moved ? `Dia encerrado. ${r.moved} para amanhã.` : 'Dia encerrado.'); },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível encerrar o dia.')),
    });
  }
}
