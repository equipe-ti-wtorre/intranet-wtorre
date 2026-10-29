import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { Note, NoteColor } from '../core/models';
import { relativeTime } from '../core/format';
import { IconComponent } from '../shared/ui';

const COLORS: { id: NoteColor; label: string }[] = [
  { id: 'none', label: 'Sem cor' },
  { id: 'yellow', label: 'Amarelo' },
  { id: 'blue', label: 'Azul' },
  { id: 'green', label: 'Verde' },
  { id: 'purple', label: 'Roxo' },
  { id: 'orange', label: 'Laranja' },
  { id: 'red', label: 'Vermelho' },
];

@Component({
  selector: 'app-notes',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page notes-page">
      <div class="page-head">
        <div>
          <h1>Notas</h1>
          <div class="sub">Espaço Individual: só você vê. As alterações são salvas sozinhas.</div>
        </div>
        <div class="actions">
          <input class="input notes-search" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Buscar nas notas" aria-label="Buscar nas notas" />
          <button class="btn btn-primary" (click)="create()"><app-icon name="plus" [size]="14" /> Nova nota</button>
        </div>
      </div>

      <div class="notes-split">
        <div class="notes-list">
          @if (!loaded()) {
            <div class="muted small">Carregando…</div>
          } @else if (!notes().length) {
            <div class="note-empty">
              <b>Nenhuma nota</b>
              <p>Anote ideias, decisões de reunião ou qualquer coisa para lembrar.</p>
            </div>
          } @else if (!shown().length) {
            <div class="note-empty">
              <b>Nenhuma nota</b>
              <p>Nada com esse texto.</p>
            </div>
          } @else {
            @for (n of shown(); track n.id) {
              <button type="button" class="note-item" [class.on]="n.id === selectedId()" (click)="open(n.id)">
                <span class="bar {{ n.color }}"></span>
                <span class="grow">
                  <b class="ellipsis">{{ n.title.trim() || 'Sem título' }}</b>
                  <span class="preview ellipsis">{{ n.body.trim() || 'Sem conteúdo' }}</span>
                  <span class="when">{{ rel(n.updated_at) }}</span>
                </span>
              </button>
            }
          }
        </div>

        <div class="note-sheet">
          @if (current(); as n) {
            <div class="note-tools">
              <div class="note-dots" role="group" aria-label="Cor da nota">
                @for (c of colors; track c.id) {
                  <button type="button" class="color-dot {{ c.id }}" [class.on]="n.color === c.id" [attr.aria-label]="c.label" [attr.aria-pressed]="n.color === c.id" (click)="setColor(c.id)"></button>
                }
              </div>
              <div class="note-tools-right">
                <span class="muted small">{{ saveState() === 'saving' ? 'Salvando…' : 'Salvo' }}</span>
                <button type="button" class="btn btn-ghost btn-sm" [class.on]="n.pinned" (click)="togglePin()" [attr.aria-pressed]="n.pinned">
                  <app-icon name="pin" [size]="14" /> Fixar no topo
                </button>
                <button type="button" class="btn btn-ghost btn-icon btn-danger" (click)="remove(n)" aria-label="Excluir nota"><app-icon name="trash" [size]="15" /></button>
              </div>
            </div>
            <input #titleInput class="note-title" [ngModel]="n.title" (ngModelChange)="edit({ title: $event })" placeholder="Título" aria-label="Título" />
            <textarea class="note-body" [ngModel]="n.body" (ngModelChange)="edit({ body: $event })" placeholder="Escreva aqui..." aria-label="Conteúdo"></textarea>
          } @else {
            <div class="note-blank">Escolha uma nota ou crie uma nova.</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class NotesPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  @ViewChild('titleInput') private titleInput?: ElementRef<HTMLInputElement>;

  colors = COLORS;
  notes = signal<Note[]>([]);
  selectedId = signal<number | null>(null);
  q = signal('');
  loaded = signal(false);
  saveState = signal<'saved' | 'saving'>('saved');
  shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.notes()
      .filter(n => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
  });
  current = computed(() => this.notes().find(n => n.id === this.selectedId()) ?? null);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private epoch = 0;
  private wantFocus = false;

  ngOnInit() {
    this.api.notes().subscribe({
      next: list => {
        this.notes.set(list);
        this.selectedId.set(list[0]?.id ?? null);
        this.loaded.set(true);
      },
      error: e => { this.loaded.set(true); this.toast.error(errorMessage(e)); },
    });
  }

  ngOnDestroy() { this.flush(); }

  rel(iso: string) { return relativeTime(iso); }

  open(id: number) {
    if (id === this.selectedId()) return;
    this.flush();
    this.selectedId.set(id);
    this.saveState.set('saved');
  }

  create() {
    this.flush();
    this.api.createNote({}).subscribe({
      next: n => {
        this.notes.update(list => [n, ...list]);
        this.selectedId.set(n.id);
        this.q.set('');
        this.saveState.set('saved');
        this.wantFocus = true;
        this.focusTitle();
      },
      error: e => this.toast.error(errorMessage(e)),
    });
  }

  edit(partial: Partial<Pick<Note, 'title' | 'body'>>) {
    this.patch(partial);
    this.queue();
  }

  setColor(color: NoteColor) {
    this.patch({ color });
    this.queue(true);
  }

  togglePin() {
    const n = this.current();
    if (!n) return;
    this.patch({ pinned: !n.pinned });
    this.queue(true);
  }

  remove(n: Note) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.epoch++;
    this.notes.update(list => list.filter(x => x.id !== n.id));
    if (this.selectedId() === n.id) this.selectedId.set(this.shown()[0]?.id ?? null);
    this.saveState.set('saved');
    this.api.deleteNote(n.id).subscribe({ error: e => this.toast.error(errorMessage(e)) });
  }

  private patch(partial: Partial<Note>) {
    const id = this.selectedId();
    if (id == null) return;
    this.notes.update(list => list.map(n => (n.id === id ? { ...n, ...partial } : n)));
  }

  private queue(immediate = false) {
    const n = this.current();
    if (!n) return;
    const payload = { id: n.id, title: n.title, body: n.body, color: n.color, pinned: n.pinned };
    this.saveState.set('saving');
    if (this.timer) clearTimeout(this.timer);
    const epoch = ++this.epoch;
    this.timer = setTimeout(() => {
      if (epoch !== this.epoch) return;
      this.persist(epoch, payload);
    }, immediate ? 0 : 500);
  }

  private flush() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    const n = this.current();
    if (!n) return;
    this.persist(this.epoch, { id: n.id, title: n.title, body: n.body, color: n.color, pinned: n.pinned });
  }

  private persist(epoch: number, payload: Pick<Note, 'id' | 'title' | 'body' | 'color' | 'pinned'>) {
    this.api.updateNote(payload.id, { title: payload.title, body: payload.body, color: payload.color, pinned: payload.pinned }).subscribe({
      next: saved => {
        this.notes.update(list => list.map(x => (x.id === saved.id ? { ...x, updated_at: saved.updated_at } : x)));
        if (epoch === this.epoch && this.selectedId() === saved.id) this.saveState.set('saved');
      },
      error: e => {
        if (epoch !== this.epoch || this.selectedId() !== payload.id) return;
        this.saveState.set('saved');
        this.toast.error(errorMessage(e));
      },
    });
  }

  private focusTitle() {
    setTimeout(() => {
      if (!this.wantFocus) return;
      this.titleInput?.nativeElement.focus();
      this.wantFocus = false;
    });
  }
}
