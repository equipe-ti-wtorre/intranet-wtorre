import { Component, OnChanges, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { UiService } from '../core/ui.service';
import { WorkDashboard } from '../core/models';
import { relativeTime } from '../core/format';
import { HEALTH_LABEL, SLIDES, SlideKey, defaultSelection, fmtDate, weekLabel } from './slides';
import { PresentationViewerComponent } from './viewer.component';
import { downloadWorkPptx } from './pptx';

// Dashboard do trabalho (aba Dashboard dentro do trabalho) e a apresentação dele,
// dentro do sistema ou em PowerPoint, escolhendo quais slides entram.
@Component({
  selector: 'app-work-dashboard',
  standalone: true,
  imports: [FormsModule, PresentationViewerComponent],
  template: `
    <div class="pd">
      @if (d(); as d) {
        <div class="pd-top">
          <span class="muted small">Atualizado {{ rel(d.generated_at) }} · {{ health[d.subject.health] }}@if (d.subject.end_date) { · prazo {{ fmt(d.subject.end_date) }} }</span>
          <span class="grow"></span>
          <button class="btn-action-secondary btn-sm" (click)="load()">Atualizar</button>
          <button class="btn-action-primary btn-sm" (click)="openPresent()">Apresentação</button>
        </div>

        <div class="pd-kpis">
          <div class="pd-kpi"><span>Progresso</span><b>{{ d.kpis.pct }}%</b><small>{{ d.kpis.done }} de {{ d.kpis.total }} tarefas</small></div>
          <div class="pd-kpi"><span>Em andamento</span><b>{{ d.kpis.doing }}</b><small>sendo feitas agora</small></div>
          <div class="pd-kpi" [class.pd-kpi--late]="d.kpis.overdue"><span>Atrasadas</span><b>{{ d.kpis.overdue }}</b><small>{{ d.kpis.overdue ? 'precisam de atenção' : 'nenhuma' }}</small></div>
          <div class="pd-kpi" [class.pd-kpi--warn]="d.kpis.blocked"><span>Bloqueadas</span><b>{{ d.kpis.blocked }}</b><small>{{ d.kpis.blocked ? 'aguardando algo' : 'nenhuma' }}</small></div>
          <div class="pd-kpi"><span>Concluídas na semana</span><b>{{ d.kpis.done_week }}</b><small>últimos 7 dias</small></div>
          <div class="pd-kpi"><span>Abertas</span><b>{{ d.kpis.open }}</b><small>a fazer, em andamento ou bloqueadas</small></div>
        </div>

        <section class="card pd-card">
          <div class="pd-meter"><b>Tarefas concluídas · {{ d.kpis.pct }}%</b><div><i [style.width.%]="d.kpis.pct"></i></div></div>
          @if (d.kpis.time_pct !== null) {
            <div class="pd-meter pd-meter--time"><b>Tempo decorrido até o prazo · {{ d.kpis.time_pct }}%</b><div><i [style.width.%]="d.kpis.time_pct"></i></div></div>
            <p class="small" [class.wk-late]="gap() > 10" [class.muted]="gap() <= 10">{{ gap() > 10 ? 'O ritmo está ' + gap() + ' pontos abaixo do calendário.' : 'O ritmo acompanha o prazo do trabalho.' }}</p>
          } @else if (!d.subject.completed) { <p class="muted small">Defina o prazo do trabalho nas Configurações para comparar o ritmo com o calendário.</p> }
        </section>

        <div class="pd-grid">
          <section class="card pd-card">
            <h2>Situação das tarefas</h2>
            @if (statuses().length) {
              <div class="pd-stack">@for (s of statuses(); track s.name) { <i [style.flex]="s.count" [style.background]="s.color" [title]="s.name + ': ' + s.count"></i> }</div>
              <div class="pd-legend">@for (s of statuses(); track s.name) { <span><i [style.background]="s.color"></i>{{ s.name }} <b>{{ s.count }}</b></span> }</div>
            } @else { <p class="muted small">Nenhuma tarefa ainda.</p> }
          </section>

          <section class="card pd-card">
            <h2>Evolução semanal</h2>
            <div class="pd-legend"><span><i class="pd-c1"></i>Criadas</span><span><i class="pd-c2"></i>Concluídas</span></div>
            <div class="pd-weeks">
              @for (w of d.weekly; track w.week) {
                <div class="pd-week" [title]="'Semana de ' + wk(w.week) + ': ' + w.created + ' criadas, ' + w.done + ' concluídas'">
                  <div class="pd-week__bars"><i class="pd-c1" [style.height.%]="barH(w.created)"></i><i class="pd-c2" [style.height.%]="barH(w.done)"></i></div>
                  <span>{{ wk(w.week) }}</span>
                </div>
              }
            </div>
          </section>

          <section class="card pd-card">
            <h2>Equipe</h2>
            @if (d.by_person.length) {
              <table class="table">
                <thead><tr><th>Pessoa</th><th class="num">Abertas</th><th class="num">Atrasadas</th><th class="num">Concluídas</th></tr></thead>
                <tbody>@for (p of d.by_person; track p.id) {
                  <tr><td><span class="pd-av" [style.background]="p.color">{{ p.initials }}</span>{{ p.name }}</td><td class="num">{{ p.open }}</td><td class="num" [class.wk-late]="p.overdue">{{ p.overdue }}</td><td class="num">{{ p.done }}</td></tr>
                }</tbody>
              </table>
            } @else { <p class="muted small">Nenhuma tarefa com responsável.</p> }
          </section>
        </div>

        <div class="pd-lists">
          @for (l of lists(); track l.title) {
            <section class="card pd-card">
              <h2 [class]="l.tone">{{ l.title }} <span>{{ l.items.length }}</span></h2>
              @for (i of l.items.slice(0, 6); track i.id) {
                <div class="pd-item"><b>{{ i.title }}</b><span>{{ i.assignee || 'sem responsável' }}{{ l.extra(i) }}</span></div>
              } @empty { <p class="muted small">{{ l.empty }}</p> }
            </section>
          }
        </div>
      } @else {
        <div class="muted" style="padding: 40px 0">Carregando o dashboard…</div>
      }
    </div>

    @if (choosing()) {
      <div class="modal-scrim" (click)="choosing.set(false)">
        <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Apresentação do trabalho">
          <div class="modal-head">Apresentação do trabalho<div class="muted small" style="font-weight:500;margin-top:2px">{{ d()?.subject?.project_name }} › {{ d()?.subject?.name }} · escolha os slides e como apresentar</div></div>
          <div class="modal-body">
            <div class="field"><label class="form-label" for="pt">Título</label><input id="pt" class="form-field" [(ngModel)]="ptitle" /></div>
            <div class="row" style="justify-content: space-between">
              <span class="form-label">Slides ({{ picked().length }} de {{ slides.length }})</span>
              <span class="row small"><button type="button" class="link-btn" (click)="picked.set(allKeys)">Todos</button> · <button type="button" class="link-btn" (click)="picked.set([])">Nenhum</button></span>
            </div>
            <div class="pd-pick">
              @for (s of slides; track s.key) {
                <label class="check-label" style="align-items: flex-start">
                  <input type="checkbox" style="margin-top: 3px" [checked]="picked().includes(s.key)" (change)="toggle(s.key)" />
                  <span>{{ s.label }}<br /><span class="muted small">{{ s.hint }}</span></span>
                </label>
              }
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn-action-secondary" [disabled]="!picked().length || exporting()" (click)="download()">{{ exporting() ? 'Gerando…' : 'Baixar PowerPoint' }}</button>
            <button type="button" class="btn-action-primary" [disabled]="!picked().length" (click)="present()">Apresentar</button>
          </div>
        </div>
      </div>
    }

    @if (presenting() && d()) { <app-presentation-viewer [d]="d()!" [keys]="picked()" [title]="ptitle" (close)="presenting.set(false)" /> }
  `,
})
export class WorkDashboardComponent implements OnChanges {
  workId = input.required<number>();
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private ui = inject(UiService);

  d = signal<WorkDashboard | null>(null);
  choosing = signal(false);
  presenting = signal(false);
  exporting = signal(false);
  picked = signal<SlideKey[]>([]);
  ptitle = '';
  slides = SLIDES;
  allKeys = SLIDES.map(s => s.key);
  health = HEALTH_LABEL;

  gap = computed(() => { const k = this.d()?.kpis; return k && k.time_pct !== null ? k.time_pct - k.pct : 0; });
  statuses = computed(() => (this.d()?.by_status || []).filter(s => s.count > 0));
  private maxWeek = computed(() => Math.max(1, ...(this.d()?.weekly || []).flatMap(w => [w.created, w.done])));
  lists = computed(() => {
    const d = this.d(); if (!d) return [];
    return [
      { title: 'Em andamento', tone: '', items: d.doing, empty: 'Nada em andamento agora.', extra: (i: any) => i.due_date ? ` · prazo ${fmtDate(i.due_date)}` : '' },
      { title: 'Próximos prazos', tone: '', items: d.upcoming, empty: 'Nada vence nos próximos 14 dias.', extra: (i: any) => ` · ${fmtDate(i.due_date)}` },
      { title: 'Atrasadas', tone: 'wk-late', items: d.overdue, empty: 'Nenhuma atrasada.', extra: (i: any) => ` · venceu ${fmtDate(i.due_date)}` },
      { title: 'Bloqueios', tone: 'wk-warn', items: d.blocked, empty: 'Nada bloqueado.', extra: (i: any) => i.blocked_reason ? ` · ${i.blocked_reason}` : '' },
      { title: 'Concluídas na semana', tone: 'wk-ok', items: d.done_week, empty: 'Nada concluído nos últimos 7 dias.', extra: () => '' },
    ];
  });

  ngOnChanges() { this.d.set(null); this.load(); }
  load() {
    this.api.workDashboard(this.workId()).subscribe({
      next: d => this.d.set(d),
      error: e => this.toast.error(errorMessage(e, 'Não foi possível carregar o dashboard.')),
    });
  }

  fmt(iso: string | null) { return fmtDate(iso); }
  wk(iso: string) { return weekLabel(iso); }
  rel(iso: string) { return relativeTime(iso); }
  barH(n: number) { return (n / this.maxWeek()) * 100; }

  openPresent() {
    const d = this.d(); if (!d) return;
    if (!this.picked().length) this.picked.set(defaultSelection(d));
    this.ptitle = this.ptitle || `Status · ${d.subject.name}`;
    this.choosing.set(true);
  }
  toggle(k: SlideKey) { this.picked.update(l => (l.includes(k) ? l.filter(x => x !== k) : [...l, k])); }
  present() { this.choosing.set(false); this.presenting.set(true); }

  async download() {
    const d = this.d(); if (!d) return;
    this.exporting.set(true);
    try {
      await downloadWorkPptx(d, this.picked(), this.ui.palette(), this.ptitle.trim() || `Status · ${d.subject.name}`);
      this.toast.show('PowerPoint gerado. O arquivo foi baixado.');
      this.choosing.set(false);
    } catch {
      this.toast.error('Não foi possível gerar o PowerPoint.');
    } finally {
      this.exporting.set(false);
    }
  }
}
