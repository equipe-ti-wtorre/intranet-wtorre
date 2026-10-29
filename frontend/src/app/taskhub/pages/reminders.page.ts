import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { Reminder, ReminderRepeat } from '../core/models';
import { dueLabel, todayIso } from '../core/format';
import { IconComponent } from '../shared/ui';

const REPEATS: { id: ReminderRepeat; label: string }[] = [
  { id: 'none', label: 'Não repete' },
  { id: 'daily', label: 'Todo dia' },
  { id: 'weekdays', label: 'Dias úteis' },
  { id: 'weekly', label: 'Toda semana' },
  { id: 'monthly', label: 'Todo mês' },
];

function nextHour(): string {
  const d = new Date();
  const hour = Math.min(23, d.getHours() + (d.getMinutes() > 0 ? 1 : 0));
  return `${String(hour).padStart(2, '0')}:00`;
}

@Component({
  selector: 'app-reminders',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page reminders-page">
      <div class="page-head">
        <div>
          <h1>Lembretes</h1>
          <div class="sub">Espaço Individual: só você vê. Na hora marcada o aviso chega na Caixa de entrada.</div>
        </div>
        <div class="actions">
          <button class="btn" [class.on]="showDone()" (click)="showDone.set(!showDone())">Concluídos</button>
          <button class="btn btn-primary" (click)="focusNew()"><app-icon name="plus" [size]="14" /> Novo lembrete</button>
        </div>
      </div>

      <div class="rem-form">
        <input #remTitle class="input grow" [(ngModel)]="draftTitle" (keydown.enter)="add()" placeholder="Lembrar de... (Enter para salvar)" aria-label="Lembrete" />
        <input class="input" type="date" [(ngModel)]="draftDate" aria-label="Data" />
        <input class="input" type="time" [(ngModel)]="draftTime" aria-label="Hora" />
        <select class="select" [(ngModel)]="draftRepeat" aria-label="Repetição">
          @for (r of repeats; track r.id) { <option [value]="r.id">{{ r.label }}</option> }
        </select>
        <button class="btn" (click)="add()" [disabled]="!draftTitle.trim()">Adicionar</button>
      </div>

      @if (!loaded()) {
        <div class="muted" style="margin-top:28px">Carregando…</div>
      } @else if (!groups().length) {
        <div class="rem-empty">
          <b>{{ showDone() ? 'Nenhum lembrete concluído' : 'Nenhum lembrete' }}</b>
          <p>{{ showDone() ? 'Os que você concluir aparecem aqui.' : 'Crie lembretes pessoais com data, hora e repetição.' }}</p>
        </div>
      } @else {
        @for (g of groups(); track g.date) {
          <section class="rem-block">
            <div class="rem-day">{{ g.label }} <span>{{ g.rows.length }}</span></div>
            @for (r of g.rows; track r.id) {
              <div class="rem-row" [class.done]="r.done">
                <button type="button" class="tick" [class.on]="r.done" (click)="toggle(r)" [attr.aria-label]="r.done ? 'Reabrir' : 'Concluir'"></button>
                <span class="rem-when">{{ g.label }} · {{ r.time }}</span>
                <span class="rem-title ellipsis">{{ r.title }}</span>
                @if (r.repeat !== 'none') {
                  <span class="rem-repeat"><app-icon name="clock" [size]="13" /> {{ repeatLabel(r.repeat) }}</span>
                }
                <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger" (click)="remove(r)" aria-label="Excluir lembrete"><app-icon name="trash" [size]="14" /></button>
              </div>
            }
          </section>
        }
      }
    </div>
  `,
})
export class RemindersPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  @ViewChild('remTitle') private remTitle?: ElementRef<HTMLInputElement>;

  repeats = REPEATS;
  items = signal<Reminder[]>([]);
  showDone = signal(false);
  loaded = signal(false);
  draftTitle = '';
  draftDate = todayIso();
  draftTime = nextHour();
  draftRepeat: ReminderRepeat = 'none';

  groups = computed(() => {
    const wantDone = this.showDone();
    const list = this.items().filter(r => wantDone ? r.done : !r.done);
    const byDate = new Map<string, Reminder[]>();
    for (const r of list) {
      const rows = byDate.get(r.date) ?? [];
      rows.push(r);
      byDate.set(r.date, rows);
    }
    return [...byDate.entries()]
      .sort((a, b) => wantDone ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]))
      .map(([date, rows]) => ({
        date,
        label: dueLabel(date),
        rows: rows.sort((a, b) => a.time.localeCompare(b.time)),
      }));
  });

  ngOnInit() { this.load(); }

  repeatLabel(id: ReminderRepeat) { return REPEATS.find(r => r.id === id)?.label || ''; }

  focusNew() {
    this.showDone.set(false);
    setTimeout(() => this.remTitle?.nativeElement.focus());
  }

  add() {
    const title = this.draftTitle.trim();
    if (!title || !this.draftDate || !this.draftTime) return;
    this.api.addReminder({ date: this.draftDate, time: this.draftTime, title, repeat: this.draftRepeat }).subscribe({
      next: r => {
        this.items.update(list => [...list, { ...r, repeat: r.repeat || 'none' }]);
        this.draftTitle = '';
        this.showDone.set(false);
        this.toast.show('Lembrete criado.');
      },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  toggle(r: Reminder) {
    this.api.updateReminder(r.id, { done: !r.done }).subscribe({
      next: updated => this.items.update(list => list.map(x => (x.id === r.id ? { ...updated, repeat: updated.repeat || 'none' } : x))),
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  remove(r: Reminder) {
    this.items.update(list => list.filter(x => x.id !== r.id));
    this.api.deleteReminder(r.id).subscribe({ error: e => this.toast.error(errorMessage(e)) });
  }

  private load() {
    this.api.reminders().subscribe({
      next: list => { this.items.set(list.map(r => ({ ...r, repeat: r.repeat || 'none' }))); this.loaded.set(true); },
      error: e => { this.loaded.set(true); this.toast.error(errorMessage(e)); },
    });
  }
}
