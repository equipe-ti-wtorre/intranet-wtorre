import { Component, OnChanges, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../core/api.service';
import { UiService } from '../core/ui.service';
import { TeamDashboard } from '../core/models';
import { minutesLabel, relativeTime } from '../core/format';
import { AvatarComponent, EmptyComponent, TaskRowComponent } from '../shared/ui';

@Component({
  selector: 'app-team-dashboard',
  standalone: true,
  imports: [RouterLink, AvatarComponent, TaskRowComponent, EmptyComponent],
  template: `
    <div class="page">
      @if (d(); as d) {
        <div class="page-head">
          <div><h1>{{ kind() === 'sector' ? 'Setor' : 'Equipe' }} · {{ d.team.name }}</h1><div class="sub">O trabalho da equipe que foi compartilhado com você. Atualizado {{ rel(d.generated_at) }}; clique em um número para ver as tarefas.</div></div>
          <div class="actions"><button class="btn btn-sm" (click)="load()">Atualizar</button>
            @if (kind() === 'team') { <a class="btn btn-sm" [routerLink]="['/ti/taskhub/equipes']" [queryParams]="{ equipe: d.team.id }">Membros da equipe</a> }</div>
        </div>

        <div class="kpis">
          <button class="kpi" (click)="go({ status: 'open' })"><div class="v">{{ d.kpis.open }}</div><div class="l">Abertas</div><div class="d">{{ d.kpis.created_week }} criadas nesta semana</div></button>
          <button class="kpi" (click)="go({ status: 'doing' })"><div class="v">{{ d.kpis.doing }}</div><div class="l">Em andamento</div></button>
          <button class="kpi" [class.bad]="d.kpis.blocked > 0" (click)="go({ status: 'blocked' })"><div class="v">{{ d.kpis.blocked }}</div><div class="l">Bloqueadas</div></button>
          <button class="kpi" [class.bad]="d.kpis.overdue > 0" (click)="go({ due: 'overdue' })"><div class="v">{{ d.kpis.overdue }}</div><div class="l">Atrasadas</div></button>
          <button class="kpi" (click)="go({ status: 'done' })"><div class="v">{{ d.kpis.done_week }}</div><div class="l">Concluídas na semana</div>
            <div class="d" [class.up]="delta() > 0" [class.down]="delta() < 0">{{ deltaText() }}</div></button>
          <div class="kpi"><div class="v">{{ onTime() }}</div><div class="l">Pontualidade (30 dias)</div>
            <div class="d">{{ d.kpis.lead_time_days != null ? 'Tempo médio: ' + leadTime() : 'Sem conclusões no período' }}</div></div>
        </div>

        <div class="dash-grid">
          <section class="full">
            <div class="block-title">Pessoas</div>
            <div class="block-sub">Carga = horas estimadas de tudo o que está com a pessoa (compartilhado ou não) com prazo até 7 dias ou sem prazo, sobre a capacidade semanal. Os números de tarefas mostram só o que foi compartilhado com você.</div>
            <div style="overflow-x:auto">
              <table class="table">
                <thead><tr><th>Pessoa</th><th class="num">Abertas</th><th class="num">Em andamento</th><th class="num">Bloqueadas</th><th class="num">Atrasadas</th><th class="num">Concluídas 7 d</th><th class="num" title="Tarefas de projetos de outros setores">Para outros setores</th><th>Carga da semana</th></tr></thead>
                <tbody>
                  @for (p of d.people; track p.id) {
                    <tr class="click" (click)="person(p.id)">
                      <td><div class="row"><app-avatar [person]="p" /><span>{{ p.name }}</span>
                        @if (p.is_manager) { <span class="muted small">gestor</span> }
                        @if (p.away_until && p.away_until >= today) { <span class="small" style="color:var(--warn)">ausente</span> }</div></td>
                      <td class="num">{{ p.open }}</td><td class="num">{{ p.doing }}</td>
                      <td class="num" [class.bad]="p.blocked > 0">{{ p.blocked }}</td>
                      <td class="num" [class.bad]="p.overdue > 0">{{ p.overdue }}</td>
                      <td class="num">{{ p.done_7d }}</td>
                      <td class="num">{{ p.other_teams || '' }}</td>
                      <td><span class="loadbar"><i [class.warn]="p.load_pct > 85" [class.over]="p.load_pct > 100" [style.width.%]="min(p.load_pct, 100)"></i></span>
                        <span class="small muted" style="margin-left:8px">{{ p.load_pct }}% · {{ minutes(p.load_week_min) }}</span>
                        @if (p.hidden_load_min) { <div class="small muted" title="Tarefas que não foram compartilhadas com o gestor: só as horas entram aqui">{{ minutes(p.hidden_load_min) }} em itens não compartilhados</div> }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div class="block-title">O que destravar</div>
            <div class="block-sub">Tarefas bloqueadas, das mais antigas para as mais recentes.</div>
            <div class="tlist">
              @for (t of d.blocked; track t.id) {
                <app-task-row [task]="t" [showStatus]="false" (open)="ui.openTask($event.id)" />
                @if (t.blocked_reason) { <div class="small" style="padding:0 8px 8px 36px;color:var(--bad)">{{ t.blocked_reason }} · bloqueada {{ rel(t.blocked_since) }}</div> }
              }
            </div>
            @if (!d.blocked.length) { <app-empty title="Nada bloqueado" text="" /> }
          </section>

          @if (d.waiting_other.length) {
            <section class="full">
              <div class="block-title">Aguardando outros setores</div>
              <div class="block-sub">Tarefas da equipe que dependem de alguém de fora, na tarefa inteira ou em uma etapa.</div>
              <div class="tlist">
                @for (t of d.waiting_other; track t.id) {
                  <app-task-row [task]="t" [showStatus]="false" (open)="ui.openTask($event.id)" />
                  <div class="small muted" style="padding:0 8px 8px 36px">
                    @for (w of t.waiting_on; track $index) {
                      <span>{{ w.name }} ({{ w.team }}){{ w.step ? ': ' + w.step : ': tarefa inteira' }}{{ $last ? '' : ' · ' }}</span>
                    }
                  </div>
                }
              </div>
            </section>
          }

          <section>
            <div class="block-title">Prazos dos próximos 7 dias</div>
            <div class="block-sub">O que pode estourar.</div>
            <div class="tlist">@for (t of d.due_soon; track t.id) { <app-task-row [task]="t" [showStatus]="false" (open)="ui.openTask($event.id)" /> }</div>
            @if (!d.due_soon.length) { <app-empty title="Sem prazos na semana" text="" /> }
          </section>

          <section>
            <div class="block-title">Atrasadas</div>
            <div class="tlist">@for (t of d.overdue; track t.id) { <app-task-row [task]="t" [showStatus]="false" (open)="ui.openTask($event.id)" /> }</div>
            @if (!d.overdue.length) { <app-empty title="Nenhuma atrasada" text="" /> }
          </section>

          <section>
            <div class="block-title">Para triagem</div>
            <div class="block-sub">Tarefas abertas da equipe sem prazo definido.</div>
            <div class="tlist">@for (t of d.triage; track t.id) { <app-task-row [task]="t" [showStatus]="false" (open)="ui.openTask($event.id)" /> }</div>
            @if (!d.triage.length) { <app-empty title="Tudo bem definido" text="" /> }
          </section>
        </div>
      } @else if (error()) { <div class="error-text">{{ error() }}</div> }
      @else { <div class="muted">Carregando painel…</div> }
    </div>
  `,
})
export class TeamDashboardPage implements OnChanges {
  id = input.required<string>();
  kind = input<'team' | 'sector'>('team');
  ui = inject(UiService);
  private api = inject(ApiService);
  private router = inject(Router);
  d = signal<TeamDashboard | null>(null);
  error = signal('');
  today = new Date().toISOString().slice(0, 10);

  delta = computed(() => (this.d() ? this.d()!.kpis.done_week - this.d()!.kpis.done_prev_week : 0));
  deltaText = computed(() => {
    const k = this.d()?.kpis; if (!k) return '';
    const n = this.delta();
    return n === 0 ? `igual à semana passada (${k.done_prev_week})` : `${n > 0 ? '+' : ''}${n} vs. semana passada`;
  });
  onTime = computed(() => {
    const k = this.d()?.kpis; if (!k || !k.done_with_due_30d) return '—';
    return `${Math.round((k.on_time_30d / k.done_with_due_30d) * 100)}%`;
  });
  leadTime = computed(() => {
    const v = this.d()?.kpis.lead_time_days; if (v == null) return '';
    return v < 1 ? `${Math.max(1, Math.round(v * 24))} h` : `${v.toFixed(1).replace('.', ',')} dias`;
  });

  ngOnChanges() { this.load(); }

  load() {
    this.d.set(null);
    this.api.teamDashboard(Number(this.id()), this.kind()).subscribe({
      next: d => { this.d.set(d); this.error.set(''); },
      error: e => this.error.set(errorMessage(e)),
    });
  }

  go(q: Record<string, string>) {
    const scope = this.kind() === 'sector' ? { sector_id: this.id() } : { team_id: this.id() };
    this.router.navigate(['/ti/taskhub/tarefas'], { queryParams: { v: 'filtro', space: 'profissional', ...scope, ...q } });
  }
  person(id: number) { this.router.navigate(['/ti/taskhub/tarefas'], { queryParams: { v: 'pessoa', pessoa: id } }); }
  rel(iso: string) { return relativeTime(iso); }
  minutes(m: number) { return minutesLabel(m) || '0 min'; }
  min(a: number, b: number) { return Math.min(a, b); }
}
