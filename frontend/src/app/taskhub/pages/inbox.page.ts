import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from '../core/api.service';
import { DataService } from '../core/data.service';
import { UiService } from '../core/ui.service';
import { ToastService } from '../core/toast.service';
import { Notification } from '../core/models';
import { relativeTime } from '../core/format';
import { AvatarComponent, EmptyComponent, IconComponent } from '../shared/ui';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [AvatarComponent, IconComponent, EmptyComponent],
  template: `
    <div class="page" style="max-width:860px">
      <div class="page-head">
        <div><h1>Caixa de entrada</h1><div class="sub">Atribuições, menções e prazos. Arquive o que já tratou.</div></div>
        <div class="actions">
          <div class="seg">
            <button [class.on]="filter() === 'unread'" (click)="setFilter('unread')">Não lidas</button>
            <button [class.on]="filter() === 'all'" (click)="setFilter('all')">Todas</button>
          </div>
          <button class="btn btn-sm" (click)="readAll()" [disabled]="!data.unread()">Marcar todas como lidas</button>
        </div>
      </div>
      <div style="border-top:1px solid var(--line)">
        @for (n of items(); track n.id) {
          <div class="inbox-item" [class.unread]="!n.read_at" (click)="open(n)">
            <span [class]="n.read_at ? 'read-dot' : 'unread-dot'"></span>
            @if (n.actor_name) { <app-avatar [person]="{ name: n.actor_name, initials: n.actor_initials || '?', color: n.actor_color || '#888' }" /> }
            @else { <span class="avatar none"><app-icon name="clock" [size]="13" /></span> }
            <div class="grow">
              <div class="title">{{ n.title }}</div>
              <div class="body">{{ n.body }}</div>
              @if (n.project_name) { <div class="muted small" style="margin-top:4px">{{ n.project_name }}</div> }
            </div>
            <span class="when">{{ rel(n.created_at) }}</span>
            <div class="acts">
              <button class="btn btn-ghost btn-sm btn-icon" (click)="$event.stopPropagation(); snooze(n)" title="Adiar para amanhã 8h" aria-label="Adiar"><app-icon name="snooze" [size]="14" /></button>
              <button class="btn btn-ghost btn-sm btn-icon" (click)="$event.stopPropagation(); archive(n)" title="Arquivar" aria-label="Arquivar"><app-icon name="archive" [size]="14" /></button>
            </div>
          </div>
        }
      </div>
      @if (loaded() && !items().length) {
        <app-empty [title]="filter() === 'unread' ? 'Tudo em dia' : 'Caixa vazia'" text="Quando alguém atribuir uma tarefa ou mencionar você, aparece aqui." />
      }
    </div>
  `,
})
export class InboxPage implements OnInit {
  private api = inject(ApiService);
  data = inject(DataService);
  private ui = inject(UiService);
  private toast = inject(ToastService);
  items = signal<Notification[]>([]);
  filter = signal<'unread' | 'all'>('unread');
  loaded = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.api.inbox(this.filter()).subscribe({
      next: l => { this.items.set(l); this.loaded.set(true); this.data.pollInbox(); },
      error: e => this.toast.error(errorMessage(e)),
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
