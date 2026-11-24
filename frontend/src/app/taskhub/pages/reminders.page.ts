import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { Reminder, ReminderRepeat } from '../core/models';
import { dueLabel, todayIso } from '../core/format';
import { EmptyComponent, IconComponent, LoadingComponent, PersonChipComponent } from '../shared/ui';
import { PersonPickerComponent } from '../shared/person-picker.component';
import { DialogDirective } from '../shared/dialog.directive';
import { DataService } from '../core/data.service';
import { AuthService } from '../core/auth.service';

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
  imports: [FormsModule, IconComponent, LoadingComponent, EmptyComponent, PersonChipComponent, PersonPickerComponent, DialogDirective],
  template: `
    <div class="page reminders-page">
      <div class="page-head">
        <div class="page-head__text">
          <h1>Lembretes</h1>
          <div class="sub">Espaço Individual: só você vê. Na hora marcada o aviso chega na Caixa de entrada.</div>
        </div>
        <div class="actions">
          <button type="button" class="btn" [class.on]="showDone()" [attr.aria-pressed]="showDone()" (click)="showDone.set(!showDone())"><app-icon name="check" [size]="14" /> Concluídos</button>
          <button type="button" class="btn" (click)="focusNew()"><app-icon name="plus" [size]="14" /> Novo lembrete</button>
        </div>
      </div>

      <div class="rem-form">
        <input #remTitle class="input grow" [(ngModel)]="draftTitle" (keydown.enter)="add()" placeholder="Lembrar de... (Enter para salvar)" aria-label="Lembrete" />
        <input class="input" type="date" [(ngModel)]="draftDate" aria-label="Data" />
        <input class="input" type="time" [(ngModel)]="draftTime" aria-label="Hora" />
        <select class="select" [(ngModel)]="draftRepeat" aria-label="Repetição">
          @for (r of repeats; track r.id) { <option [value]="r.id">{{ r.label }}</option> }
        </select>
        <button type="button" class="btn btn-primary" (click)="add()" [disabled]="!draftTitle.trim() || adding()" [class.btn--loading]="adding()">Adicionar</button>
      </div>

      @if (!loaded()) {
        <div class="rem-loading"><app-loading [rows]="4" /></div>
      } @else if (!groups().length) {
        <app-empty icon="bell" [dashed]="true" [title]="showDone() ? 'Nenhum lembrete concluído' : 'Nenhum lembrete'"
                   [text]="showDone() ? 'Os que você concluir aparecem aqui.' : 'Crie lembretes pessoais com data, hora e repetição.'" />
      } @else {
        @for (g of groups(); track g.date) {
          <section class="rem-block">
            <div class="rem-day">{{ g.label }} <span>{{ g.rows.length }}</span></div>
            @for (r of g.rows; track r.id) {
              @if (editingId() === r.id) {
                <div class="rem-row rem-row--edit">
                  <input class="input grow" [(ngModel)]="editTitle" (keydown.enter)="saveEdit(r)" (keydown.escape)="editingId.set(null)" aria-label="Texto do lembrete" />
                  <input class="input" type="date" [(ngModel)]="editDate" aria-label="Data" />
                  <input class="input" type="time" [(ngModel)]="editTime" aria-label="Hora" />
                  <select class="select" [(ngModel)]="editRepeat" aria-label="Repetição">
                    @for (o of repeats; track o.id) { <option [value]="o.id">{{ o.label }}</option> }
                  </select>
                  <button type="button" class="btn btn-primary btn-sm" (click)="saveEdit(r)" [disabled]="!editTitle.trim() || !editDate || !editTime || editSaving()">Salvar</button>
                  <button type="button" class="btn btn-ghost btn-sm" (click)="editingId.set(null)">Cancelar</button>
                </div>
              } @else {
                <div class="rem-row" [class.done]="r.done">
                  <button type="button" class="tick" [class.on]="r.done" (click)="toggle(r)" [attr.aria-label]="r.done ? 'Reabrir' : 'Concluir'"></button>
                  <span class="rem-when">{{ g.label }} · {{ r.time }}</span>
                  <span class="rem-title ellipsis" [title]="r.title">{{ r.title }}</span>
                  @if (r.repeat !== 'none') {
                    <span class="rem-repeat"><app-icon name="clock" [size]="13" /> {{ repeatLabel(r.repeat) }}</span>
                  }
                  @if (r.is_owner === false) {
                    <span class="rem-shared" [title]="'Compartilhado por ' + r.owner?.name"><app-icon name="people" [size]="13" /> de {{ r.owner?.name }}</span>
                  } @else if (r.members?.length) {
                    <span class="rem-shared" [title]="sharedNames(r)"><app-icon name="people" [size]="13" /> {{ r.members!.length }} {{ r.members!.length === 1 ? 'pessoa' : 'pessoas' }}</span>
                  }
                  @if (r.is_owner !== false) {
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="startEdit(r)" aria-label="Editar lembrete" title="Editar lembrete"><app-icon name="pencil" [size]="14" /></button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [class.on]="!!r.members?.length" (click)="openShare(r)" aria-label="Compartilhar lembrete" title="Compartilhar lembrete"><app-icon name="people" [size]="14" /></button>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger" (click)="remove(r)" aria-label="Excluir lembrete" title="Excluir lembrete"><app-icon name="trash" [size]="14" /></button>
                  } @else {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="remove(r)" title="Sair deste lembrete">Sair</button>
                  }
                </div>
              }
            }
          </section>
        }
      }

      @if (sharing(); as sr) {
        <div class="modal-scrim" (click)="sharing.set(null)">
          <div class="modal" (click)="$event.stopPropagation()" appDialog (dialogClose)="sharing.set(null)">
            <div class="modal-head">
              <h2>Compartilhar lembrete</h2>
              <button type="button" class="btn btn-ghost btn-icon btn-sm modal-x" aria-label="Fechar" title="Fechar" (click)="sharing.set(null)"><app-icon name="x" [size]="16" /></button>
            </div>
            <div class="modal-body">
              <div class="note-info note-info--tight">As pessoas escolhidas veem <b>{{ sr.title }}</b>, recebem o aviso na Caixa de entrada na hora marcada e podem marcar como concluído. Só você edita, exclui ou muda quem participa.</div>
              <div class="field"><label>Quem recebe</label>
                <div class="pills">
                  @for (m of shareChosen(); track m.id) { <app-person-chip [person]="m" (remove)="shareRemove(m.id)" /> }
                  @if (!shareChosen().length) { <span class="muted small">Ninguém ainda.</span> }
                </div>
                <app-person-picker [people]="shareAvailable()" placeholder="Incluir pessoa…" (picked)="shareAdd($event)" />
              </div>
            </div>
            <div class="modal-foot">
              <button type="button" class="btn btn-ghost" (click)="sharing.set(null)">Cancelar</button>
              <button type="button" class="btn btn-primary" [disabled]="shareSaving()" (click)="saveShare()">{{ shareSaving() ? 'Salvando…' : 'Salvar' }}</button>
            </div>
          </div>
        </div>
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
  adding = signal(false);
  draftTitle = '';
  draftDate = todayIso();
  draftTime = nextHour();
  draftRepeat: ReminderRepeat = 'none';

  private data = inject(DataService);
  private auth = inject(AuthService);
  editingId = signal<number | null>(null);
  editSaving = signal(false);
  editTitle = '';
  editDate = '';
  editTime = '';
  editRepeat: ReminderRepeat = 'none';
  sharing = signal<Reminder | null>(null);
  shareIds = signal<number[]>([]);
  shareSaving = signal(false);
  shareChosen = computed(() => this.shareIds().map(id => this.data.people().find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p));
  shareAvailable = computed(() => this.data.people().filter(p => p.id !== this.auth.user()?.id && !this.shareIds().includes(p.id)));

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
    if (!title || !this.draftDate || !this.draftTime || this.adding()) return;
    this.adding.set(true);
    this.api.addReminder({ date: this.draftDate, time: this.draftTime, title, repeat: this.draftRepeat }).subscribe({
      next: r => {
        this.adding.set(false);
        this.items.update(list => [...list, { ...r, repeat: r.repeat || 'none' }]);
        this.draftTitle = '';
        this.showDone.set(false);
        this.toast.show('Lembrete criado.');
      },
      error: e => { this.adding.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  sharedNames(r: Reminder) { return (r.members || []).map(m => m.name).join(', '); }

  startEdit(r: Reminder) {
    this.editTitle = r.title;
    this.editDate = r.date;
    this.editTime = r.time;
    this.editRepeat = r.repeat;
    this.editingId.set(r.id);
  }

  saveEdit(r: Reminder) {
    const title = this.editTitle.trim();
    if (!title || !this.editDate || !this.editTime || this.editSaving()) return;
    this.editSaving.set(true);
    this.api.updateReminder(r.id, { title, date: this.editDate, time: this.editTime, repeat: this.editRepeat }).subscribe({
      next: updated => {
        this.editSaving.set(false);
        this.editingId.set(null);
        this.items.update(list => list.map(x => (x.id === r.id ? { ...updated, repeat: updated.repeat || 'none' } : x)));
        this.toast.show('Lembrete atualizado.');
      },
      error: e => { this.editSaving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  openShare(r: Reminder) {
    this.shareIds.set((r.members || []).map(m => m.id));
    this.sharing.set(r);
  }
  shareAdd(id: number | null) { if (id) this.shareIds.update(l => [...l, id]); }
  shareRemove(id: number) { this.shareIds.update(l => l.filter(x => x !== id)); }
  saveShare() {
    const r = this.sharing();
    if (!r) return;
    this.shareSaving.set(true);
    this.api.setReminderMembers(r.id, this.shareIds()).subscribe({
      next: saved => {
        this.shareSaving.set(false);
        this.sharing.set(null);
        this.items.update(list => list.map(x => (x.id === saved.id ? { ...x, members: saved.members } : x)));
        this.toast.show(saved.members?.length ? 'Lembrete compartilhado.' : 'Lembrete só seu de novo.');
      },
      error: e => { this.shareSaving.set(false); this.toast.error(errorMessage(e)); },
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
    if (r.is_owner === false) this.toast.show('Você saiu do lembrete.');
    this.api.deleteReminder(r.id).subscribe({ error: e => this.toast.error(errorMessage(e)) });
  }

  private load() {
    this.api.reminders().subscribe({
      next: list => { this.items.set(list.map(r => ({ ...r, repeat: r.repeat || 'none' }))); this.loaded.set(true); },
      error: e => { this.loaded.set(true); this.toast.error(errorMessage(e)); },
    });
  }
}
