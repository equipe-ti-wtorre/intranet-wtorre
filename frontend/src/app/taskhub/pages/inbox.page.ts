import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { ConfirmService } from '../core/confirm.service';
import { Notification } from '../core/models';
import { relativeTime } from '../core/format';
import { AvatarComponent, EmptyComponent, ErrorComponent, IconComponent, LoadingComponent } from '../shared/ui';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [AvatarComponent, IconComponent, EmptyComponent, LoadingComponent, ErrorComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="page-head__text"><h1>Caixa de entrada</h1><div class="sub">Atribuições, menções e prazos. Arquive ou exclua o que já tratou.</div></div>
        <div class="actions">
          <div class="seg">
            <button type="button" [class.on]="filter() === 'unread'" [attr.aria-pressed]="filter() === 'unread'" (click)="setFilter('unread')">Não lidas</button>
            <button type="button" [class.on]="filter() === 'all'" [attr.aria-pressed]="filter() === 'all'" (click)="setFilter('all')">Todas</button>
          </div>
          <button type="button" class="btn btn-sm" (click)="readAll()" [disabled]="!data.unread()">Marcar todas como lidas</button>
        </div>
      </div>
      @if (err()) {
        <app-error [text]="err()" (retry)="load()" />
      } @else if (!loaded()) {
        <app-loading [rows]="5" />
      }
      <div class="inbox-list">
        @for (n of items(); track n.id) {
          <div class="inbox-item" [class.unread]="!n.read_at" role="button" tabindex="0" (click)="open(n)"
               (keydown.enter)="open(n)" (keydown.space)="$event.preventDefault(); open(n)">
            <span [class]="n.read_at ? 'read-dot' : 'unread-dot'"></span>
            @if (n.actor_name) { <app-avatar [person]="{ name: n.actor_name, initials: n.actor_initials || '?', color: n.actor_color || 'var(--text-subtle)' }" /> }
            @else { <span class="avatar none"><app-icon name="clock" [size]="13" /></span> }
            <div class="grow">
              <div class="title">{{ n.title }}</div>
              <div class="body">{{ n.body }}</div>
              @if (n.project_name) { <div class="muted small inbox-item__proj">{{ n.project_name }}</div> }
            </div>
            <span class="when">{{ rel(n.created_at) }}</span>
            <div class="acts">
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="$event.stopPropagation(); snooze(n)" title="Adiar para amanhã 8h" aria-label="Adiar para amanhã 8h"><app-icon name="snooze" [size]="14" /></button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="$event.stopPropagation(); archive(n)" title="Arquivar" aria-label="Arquivar notificação"><app-icon name="archive" [size]="14" /></button>
              <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="$event.stopPropagation(); remove(n)" title="Excluir" aria-label="Excluir notificação"><app-icon name="trash" [size]="14" /></button>
            </div>
          </div>
        }
      </div>
      @if (loaded() && !err() && !items().length) {
        <app-empty icon="inbox" [title]="filter() === 'unread' ? 'Tudo em dia' : 'Caixa vazia'" text="Quando alguém atribuir uma tarefa ou mencionar você, aparece aqui." />
      }
    </div>
  `,
})
export class InboxPage implements OnInit {
  private api = inject(ApiService);
  data = inject(DataService);
  private ui = inject(UiService);
  private toast = inject(ToastService);
  private confirmSvc = inject(ConfirmService);
  items = signal<Notification[]>([]);
  err = signal('');
  filter = signal<'unread' | 'all'>('unread');
  loaded = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.err.set('');
    this.api.inbox(this.filter()).subscribe({
      next: l => { this.items.set(l); this.loaded.set(true); this.data.pollInbox(); },
      error: e => { this.err.set(errorMessage(e)); this.loaded.set(true); },
    });
  }
  setFilter(f: 'unread' | 'all') { this.filter.set(f); this.load(); }

  open(n: Notification) {
    if (!n.read_at) {
      this.api.inboxRead(n.id).subscribe(() => this.data.pollInbox());
      this.items.update(l => l.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.task_id) this.ui.openTask(n.task_id);
  }
  archive(n: Notification) {
    this.items.update(l => l.filter(x => x.id !== n.id));
    this.api.inboxArchive(n.id).subscribe({ next: () => this.data.pollInbox(), error: e => this.toast.error(errorMessage(e)) });
  }
  async remove(n: Notification) {
    if (!(await this.confirmSvc.confirm({ title: 'Excluir esta notificação?', message: 'Não dá para desfazer.', confirmLabel: 'Excluir', danger: true }))) return;
    this.items.update(l => l.filter(x => x.id !== n.id));
    this.api.inboxDelete(n.id).subscribe({
      next: () => this.data.pollInbox(),
      error: e => { this.toast.error(errorMessage(e)); this.load(); },
    });
  }
  snooze(n: Notification) {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
    this.items.update(l => l.filter(x => x.id !== n.id));
    this.api.inboxSnooze(n.id, d).subscribe({ next: () => { this.toast.show('Volta amanhã às 8h.'); this.data.pollInbox(); }, error: e => this.toast.error(errorMessage(e)) });
  }
  readAll() {
    this.api.inboxReadAll().subscribe(() => { this.load(); });
  }
  rel(iso: string) { return relativeTime(iso); }
}
