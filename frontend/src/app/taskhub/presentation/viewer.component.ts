import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, computed, signal } from '@angular/core';
import { WorkDashboard } from '../core/models';
import { HEALTH_LABEL, SLIDES, SlideKey, fmtDate, weekLabel } from './slides';

// Apresentação dentro do sistema: tela cheia, um slide por vez (← → para navegar, Esc para sair).
// Usa os mesmos slides e dados do PowerPoint.
@Component({
  selector: 'app-presentation-viewer',
  standalone: true,
  template: `
    <div class="pv" role="dialog" aria-modal="true" [attr.aria-label]="'Apresentação: ' + title">
      <div class="pv-stage">
        @switch (current()) {
          @case ('capa') {
            <div class="pv-slide pv-cover">
              <div class="pv-cover__brand">TaskHub</div>
              <h1 class="pv-cover__title">{{ title }}</h1>
              <div class="pv-cover__meta">{{ coverMeta() }}</div>
              <span class="pv-pill" [class]="'pv-pill pv-pill--' + d.subject.health">{{ health[d.subject.health] }}</span>
              <div class="pv-cover__date">{{ today }}</div>
            </div>
          }
          @case ('resumo') {
            <div class="pv-slide"><h2>Resumo</h2>
              <div class="pv-cards">
                <div class="pv-card"><span>Progresso</span><b>{{ d.kpis.pct }}%</b><small>{{ d.kpis.done }} de {{ d.kpis.total }} tarefas concluídas</small></div>
                <div class="pv-card"><span>Em andamento</span><b>{{ d.kpis.doing }}</b><small>{{ d.kpis.open }} abertas no total</small></div>
                <div class="pv-card" [class.pv-card--warn]="d.kpis.overdue"><span>Atrasadas</span><b>{{ d.kpis.overdue }}</b><small>{{ d.kpis.overdue ? 'precisam de atenção' : 'nenhuma atrasada' }}</small></div>
                <div class="pv-card" [class.pv-card--warn]="d.kpis.blocked"><span>Bloqueadas</span><b>{{ d.kpis.blocked }}</b><small>{{ d.kpis.blocked ? 'aguardando algo' : 'nada bloqueado' }}</small></div>
              </div>
              <div class="pv-meter"><b>Tarefas concluídas · {{ d.kpis.pct }}%</b><div><i [style.width.%]="d.kpis.pct"></i></div></div>
              @if (d.kpis.time_pct !== null) {
                <div class="pv-meter pv-meter--time"><b>Tempo decorrido até o prazo · {{ d.kpis.time_pct }}%</b><div><i [style.width.%]="d.kpis.time_pct"></i></div></div>
                <p [class.pv-alert]="(d.kpis.time_pct - d.kpis.pct) > 10">{{ (d.kpis.time_pct - d.kpis.pct) > 10 ? 'O ritmo está ' + (d.kpis.time_pct - d.kpis.pct) + ' pontos abaixo do calendário.' : 'O ritmo acompanha o prazo do trabalho.' }}</p>
              }
            </div>
          }
          @case ('andamento') {
            <div class="pv-slide"><h2>Em andamento</h2>
              <table class="pv-table"><thead><tr><th>Tarefa</th><th>Status</th><th>Responsável</th><th>Prazo</th></tr></thead>
                <tbody>@for (i of d.doing.slice(0, 9); track i.id) { <tr><td>{{ i.title }}</td><td>{{ i.status || '—' }}</td><td>{{ i.assignee || '—' }}</td><td>{{ fmt(i.due_date) }}</td></tr> }</tbody></table>
              @if (!d.doing.length) { <p class="pv-empty">Nenhuma tarefa em andamento agora.</p> }
            </div>
          }
          @case ('status') {
            <div class="pv-slide"><h2>Situação das tarefas</h2>
              <div class="pv-status">
                <div class="pv-stack">@for (s of statuses(); track s.name) { <i [style.flex]="s.count" [style.background]="s.color" [title]="s.name"></i> }</div>
                <div class="pv-legend">@for (s of statuses(); track s.name) { <span><i [style.background]="s.color"></i>{{ s.name }} <b>{{ s.count }}</b></span> }</div>
                <div class="pv-big"><b>{{ d.kpis.total }}</b><span>tarefas · {{ d.kpis.open }} abertas · {{ d.kpis.done }} concluídas</span></div>
              </div>
            </div>
          }
          @case ('evolucao') {
            <div class="pv-slide"><h2>Evolução semanal</h2>
              <div class="pv-legend"><span><i class="pv-c1"></i>Criadas</span><span><i class="pv-c2"></i>Concluídas</span></div>
              <div class="pv-weeks">
                @for (w of d.weekly; track w.week) {
                  <div class="pv-week">
                    <div class="pv-week__bars">
                      <i class="pv-c1" [style.height.%]="barH(w.created)"><em>{{ w.created }}</em></i>
                      <i class="pv-c2" [style.height.%]="barH(w.done)"><em>{{ w.done }}</em></i>
                    </div>
                    <span>{{ wk(w.week) }}</span>
                  </div>
                }
              </div>
            </div>
          }
          @case ('prazos') {
            <div class="pv-slide"><h2>Próximos prazos</h2>
              <table class="pv-table"><thead><tr><th>Tarefa</th><th>Status</th><th>Responsável</th><th>Prazo</th></tr></thead>
                <tbody>@for (i of d.upcoming.slice(0, 9); track i.id) { <tr><td>{{ i.title }}</td><td>{{ i.status || '—' }}</td><td>{{ i.assignee || '—' }}</td><td>{{ fmt(i.due_date) }}</td></tr> }</tbody></table>
              @if (!d.upcoming.length) { <p class="pv-empty">Nada vence nos próximos 14 dias.</p> }
            </div>
          }
          @case ('atencao') {
            <div class="pv-slide"><h2>Atrasadas e bloqueios</h2>
              <div class="pv-cols">
                <div><h3 class="pv-red">Atrasadas ({{ d.overdue.length }})</h3>
                  @for (i of d.overdue.slice(0, 7); track i.id) { <div class="pv-li"><b>{{ i.title }}</b><span>{{ i.assignee || 'sem responsável' }} · venceu {{ fmt(i.due_date) }}</span></div> }
                  @empty { <p class="pv-empty">Nenhuma.</p> }</div>
                <div><h3 class="pv-amber">Bloqueadas ({{ d.blocked.length }})</h3>
                  @for (i of d.blocked.slice(0, 7); track i.id) { <div class="pv-li"><b>{{ i.title }}</b><span>{{ i.blocked_reason || 'Sem motivo informado' }} · {{ i.assignee || '—' }}</span></div> }
                  @empty { <p class="pv-empty">Nenhuma.</p> }</div>
              </div>
            </div>
          }
          @case ('equipe') {
            <div class="pv-slide"><h2>Equipe</h2>
              <table class="pv-table"><thead><tr><th>Pessoa</th><th>Abertas</th><th>Atrasadas</th><th>Concluídas</th></tr></thead>
                <tbody>@for (p of d.by_person.slice(0, 10); track p.id) { <tr><td>{{ p.name }}</td><td>{{ p.open }}</td><td [class.pv-red]="p.overdue">{{ p.overdue }}</td><td>{{ p.done }}</td></tr> }</tbody></table>
              @if (!d.by_person.length) { <p class="pv-empty">Nenhuma tarefa com responsável.</p> }
            </div>
          }
          @case ('entregas') {
            <div class="pv-slide"><h2>Concluídas na semana</h2>
              <table class="pv-table"><thead><tr><th>Tarefa</th><th>Status</th><th>Responsável</th><th>Concluída em</th></tr></thead>
                <tbody>@for (i of d.done_week.slice(0, 9); track i.id) { <tr><td>{{ i.title }}</td><td>{{ i.status || '—' }}</td><td>{{ i.assignee || '—' }}</td><td>{{ fmt(i.completed_at) }}</td></tr> }</tbody></table>
              @if (!d.done_week.length) { <p class="pv-empty">Nenhuma tarefa concluída nos últimos 7 dias.</p> }
            </div>
          }
        }
        @if (current() !== 'capa') { <div class="pv-foot"><span>TaskHub · {{ d.subject.project_name }} › {{ d.subject.name }}</span><span>{{ index() + 1 }} / {{ slides().length }}</span></div> }
      </div>

      <div class="pv-bar">
        <button (click)="prev()" [disabled]="index() === 0" aria-label="Slide anterior">‹</button>
        <span>{{ index() + 1 }} de {{ slides().length }} · {{ label() }}</span>
        <button (click)="next()" [disabled]="index() === slides().length - 1" aria-label="Próximo slide">›</button>
        <button class="pv-exit" (click)="close.emit()">Sair (Esc)</button>
      </div>
    </div>
  `,
})
export class PresentationViewerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) d!: WorkDashboard;
  @Input({ required: true }) keys: SlideKey[] = [];
  @Input() title = '';
  @Output() close = new EventEmitter<void>();
  health = HEALTH_LABEL;
  today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  index = signal(0);
  slides = computed(() => SLIDES.filter(s => this.keys.includes(s.key)));
  current = computed(() => this.slides()[this.index()]?.key);
  label = computed(() => this.slides()[this.index()]?.label || '');
  statuses = computed(() => this.d.by_status.filter(s => s.count > 0));
  private maxWeek = computed(() => Math.max(1, ...this.d.weekly.flatMap(w => [w.created, w.done])));

  ngOnInit() { document.documentElement.requestFullscreen?.().catch(() => {}); }
  ngOnDestroy() { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }

  coverMeta() {
    const p = this.d.subject;
    return [`Projeto ${p.project_name}`, p.owner_name ? `Responsável: ${p.owner_name}` : null, p.end_date ? `Prazo ${fmtDate(p.end_date)}` : null].filter(Boolean).join('  ·  ');
  }
  fmt(iso: string | null) { return fmtDate(iso); }
  wk(iso: string) { return weekLabel(iso); }
  barH(n: number) { return (n / this.maxWeek()) * 100; }
  prev() { this.index.update(i => Math.max(0, i - 1)); }
  next() { this.index.update(i => Math.min(this.slides().length - 1, i + 1)); }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.next(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prev(); }
    if (e.key === 'Home') this.index.set(0);
    if (e.key === 'End') this.index.set(this.slides().length - 1);
    if (e.key === 'Escape') this.close.emit();
  }
  @HostListener('document:fullscreenchange')
  onFs() { if (!document.fullscreenElement && this.wasFull) this.close.emit(); this.wasFull = !!document.fullscreenElement; }
  private wasFull = false;
}
