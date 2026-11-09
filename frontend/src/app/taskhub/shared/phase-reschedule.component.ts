import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { PhaseReschedule, PhaseScope } from '../core/models';
import { IconComponent } from './ui';

type Candidate = PhaseReschedule['candidates'][number];

// Revisão das datas depois que o roteiro da equipe ou do projeto (soma dos dias das fases) mudou.
// Nada é gravado até a pessoa clicar em Aplicar; se não há projeto afetado, fecha sozinho.
@Component({
  selector: 'app-phase-reschedule',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (candidates().length) {
      <div class="modal-scrim">
        <div class="modal resched-modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Atualizar datas dos projetos">
          <div class="modal-head row" style="gap: 8px"><app-icon name="calendar" [size]="16" />Atualizar datas dos projetos?
            <button type="button" class="btn btn-ghost btn-sm btn-icon resched__x" [disabled]="busy()" (click)="closed.emit('cancelled')" aria-label="Cancelar" title="Cancelar"><app-icon name="x" [size]="14" /></button>
          </div>
          <div class="modal-body">
            <p class="resched__lead">O roteiro {{ scope().kind === 'team' ? 'da equipe' : 'do projeto' }} agora tem <b>{{ total() }} {{ total() === 1 ? 'dia útil' : 'dias úteis' }}</b>. Escolha os projetos que devem seguir o novo prazo.</p>

            <div class="resched__list">
              <label class="resched__row resched__row--all">
                <input type="checkbox" [checked]="allChecked()" [disabled]="busy()" (change)="toggleAll()" />
                <span>Marcar todos</span>
              </label>
              @for (c of candidates(); track c.work_id) {
                <label class="resched__row">
                  <input type="checkbox" [checked]="selected().has(c.work_id)" [disabled]="busy()" (change)="toggle(c.work_id)" />
                  <span class="resched__name">{{ c.name }}@if (c.owners.length) {<small>{{ c.owners.join(', ') }}</small>}</span>
                  <span class="resched__dates">
                    @if (selected().has(c.work_id)) {
                      @if (preview(c); as p) {
                        @if (p.start !== c.start) { começa {{ dm(c.start) }} → {{ dm(p.start) }} · }
                        termina {{ dm(c.old_due) }} → <b>{{ dm(p.due) }}</b>
                      }
                    } @else { mantém {{ dm(c.old_due) }} }
                  </span>
                </label>
              }
            </div>

            <div class="resched__mode" role="radiogroup" aria-label="Quando um projeto encostar no próximo">
              <label class="resched__opt">
                <input type="radio" name="resched-mode" [checked]="push()" [disabled]="busy()" (change)="setPush(true)" />
                <span><b>Reajustar os próximos projetos do mesmo responsável</b><small>A fila de cada responsável anda junto. Projetos já iniciados não mudam.</small></span>
              </label>
              <label class="resched__opt">
                <input type="radio" name="resched-mode" [checked]="!push()" [disabled]="busy()" (change)="setPush(false)" />
                <span><b>Deixar juntos</b><small>Só muda o prazo dos projetos marcados. O responsável pode ficar com mais de um projeto ao mesmo tempo.</small></span>
              </label>
            </div>

            <div class="resched__effects">
              <div class="resched__effects-title">Isso afeta</div>
              @if (loading()) {
                <p class="resched__muted">Calculando…</p>
              } @else if (!selected().size) {
                <p class="resched__muted">Nenhum projeto marcado: nada muda.</p>
              } @else if (push()) {
                @if (pushes().length) {
                  <ul>
                    @for (p of pushes(); track p.work_id) {
                      <li><b>{{ p.name }}</b>@if (p.owners.length) { ({{ p.owners.join(', ') }})} passa de {{ dm(p.old_start) }}–{{ dm(p.old_end) }} para <b>{{ dm(p.new_start) }}–{{ dm(p.new_end) }}</b></li>
                    }
                  </ul>
                } @else {
                  <p class="resched__muted">Só os projetos marcados. Nenhum outro precisa ser reajustado.</p>
                }
              } @else {
                @if (overlaps().length) {
                  <ul>
                    @for (o of overlaps(); track o.a.id + '-' + o.b.id) {
                      <li><b>{{ o.a.name }}</b> e <b>{{ o.b.name }}</b> ficam ao mesmo tempo para {{ o.owners.join(', ') }}</li>
                    }
                  </ul>
                } @else {
                  <p class="resched__muted">Só os projetos marcados. Nenhum fica junto com outro do mesmo responsável.</p>
                }
              }
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost resched__cancel" [disabled]="busy()" (click)="closed.emit('cancelled')">Cancelar</button>
            <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit('kept')">Manter datas atuais</button>
            <button type="button" class="btn btn-primary" [disabled]="busy() || loading() || !selected().size" (click)="apply()">{{ busy() ? 'Aplicando…' : 'Aplicar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PhaseRescheduleComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  scope = input.required<PhaseScope>();
  closed = output<'applied' | 'kept' | 'cancelled'>();

  total = signal(0);
  candidates = signal<Candidate[]>([]);
  selected = signal<Set<number>>(new Set());
  push = signal(true);
  pushes = signal<PhaseReschedule['pushes']>([]);
  overlaps = signal<PhaseReschedule['overlaps']>([]);
  private latest = signal<Map<number, Candidate>>(new Map());
  loading = signal(false);
  busy = signal(false);
  private seq = 0;

  allChecked = computed(() => this.candidates().length > 0 && this.selected().size === this.candidates().length);

  ngOnInit() {
    this.loading.set(true);
    this.api.reschedulePhases(this.scope(), { push: true, dry_run: true }).subscribe({
      next: r => {
        if (!r.candidates.length) { this.closed.emit('kept'); return; }
        this.total.set(r.total);
        this.candidates.set(r.candidates);
        this.selected.set(new Set(r.candidates.map(c => c.work_id)));
        this.show(r);
      },
      error: e => { this.toast.error(errorMessage(e, 'Não foi possível calcular as novas datas.')); this.closed.emit('kept'); },
    });
  }

  preview(c: Candidate) {
    const l = this.latest().get(c.work_id) || c;
    return { start: l.new_start || l.start, due: l.new_due };
  }

  toggle(id: number) {
    this.selected.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    this.refresh();
  }
  toggleAll() {
    this.selected.set(this.allChecked() ? new Set() : new Set(this.candidates().map(c => c.work_id)));
    this.refresh();
  }
  setPush(v: boolean) { this.push.set(v); this.refresh(); }

  private body(dry_run: boolean) {
    return { work_ids: [...this.selected()], push: this.push(), dry_run };
  }

  private refresh() {
    const n = ++this.seq;
    if (!this.selected().size) { this.loading.set(false); this.pushes.set([]); this.overlaps.set([]); return; }
    this.loading.set(true);
    this.api.reschedulePhases(this.scope(), this.body(true)).subscribe({
      next: r => { if (n === this.seq) this.show(r); },
      error: e => { if (n === this.seq) { this.loading.set(false); this.toast.error(errorMessage(e, 'Não foi possível calcular as novas datas.')); } },
    });
  }

  private show(r: PhaseReschedule) {
    this.latest.set(new Map(r.candidates.map(c => [c.work_id, c])));
    this.pushes.set(r.pushes);
    this.overlaps.set(r.overlaps);
    this.loading.set(false);
  }

  apply() {
    if (!this.selected().size) return;
    this.busy.set(true);
    this.api.reschedulePhases(this.scope(), this.body(false)).subscribe({
      next: () => { this.busy.set(false); this.toast.show('Datas atualizadas.'); this.closed.emit('applied'); },
      error: e => { this.busy.set(false); this.toast.error(errorMessage(e, 'Não foi possível atualizar as datas.')); },
    });
  }

  dm(d: string | null | undefined) {
    if (!d) return '—';
    const [, m, day] = d.slice(0, 10).split('-');
    return `${day}/${m}`;
  }
}
