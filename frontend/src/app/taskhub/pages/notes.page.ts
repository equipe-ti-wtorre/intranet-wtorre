import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { Note, NoteColor, TaskFile } from '../core/models';
import { NOTE_FILE_MAX_MB, fileSize, isExternalFileDrag, relativeTime } from '../core/format';
import { bodyToHtml, bodyToText, htmlToBody, safeHref } from '../shared/rich-text';
import { EmptyComponent, IconComponent, LoadingComponent, SearchComponent } from '../shared/ui';

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
  imports: [FormsModule, IconComponent, SearchComponent, LoadingComponent, EmptyComponent],
  template: `
    <div class="page notes-page">
      <div class="page-head">
        <div class="page-head__text">
          <h1>Notas</h1>
          <div class="sub">Espaço Individual: só você vê. As alterações são salvas sozinhas.</div>
        </div>
        <div class="actions">
          <app-search [value]="q()" (valueChange)="q.set($event)" placeholder="Buscar nas notas" />
          <button type="button" class="btn btn-primary" (click)="create()"><app-icon name="plus" [size]="14" /> Nova nota</button>
        </div>
      </div>

      <div class="notes-split">
        <div class="notes-list">
          @if (!loaded()) {
            <app-loading [rows]="4" />
          } @else if (!notes().length) {
            <app-empty icon="note" [compact]="true" title="Nenhuma nota" text="Anote ideias, decisões de reunião ou qualquer coisa para lembrar." />
          } @else if (!shown().length) {
            <app-empty icon="search" [compact]="true" title="Nenhuma nota" text="Nada com esse texto." />
          } @else {
            @for (n of shown(); track n.id) {
              <button type="button" class="note-item" [class.on]="n.id === selectedId()" (click)="open(n.id)">
                <span class="bar {{ n.color }}"></span>
                <span class="grow">
                  <b class="ellipsis" [title]="n.title.trim() || 'Sem título'">{{ n.title.trim() || 'Sem título' }}</b>
                  <span class="preview ellipsis" [title]="preview(n) || 'Sem conteúdo'">{{ preview(n) || (n.files?.length ? n.files!.length + ' anexo(s)' : 'Sem conteúdo') }}</span>
                  <span class="when">{{ rel(n.updated_at) }}</span>
                </span>
              </button>
            }
          }
        </div>

        <div class="note-sheet" [class.file-over]="dragOver()" (dragover)="onDragOver($event)" (dragleave)="dragOver.set(false)" (drop)="onDrop($event)">
          @if (current(); as n) {
            <div class="note-tools">
              <div class="note-dots" role="radiogroup" aria-label="Cor da nota">
                @for (c of colors; track c.id) {
                  <button type="button" class="color-dot {{ c.id }}" [class.on]="n.color === c.id" role="radio" [attr.aria-label]="c.label" [title]="c.label" [attr.aria-checked]="n.color === c.id" (click)="setColor(c.id)"></button>
                }
              </div>
              <div class="note-tools-right">
                <span class="hint" role="status" aria-live="polite">{{ saveState() === 'saving' ? 'Salvando…' : 'Salvo' }}</span>
                <button type="button" class="btn btn-ghost btn-sm" [class.on]="n.pinned" (click)="togglePin()" [attr.aria-pressed]="n.pinned">
                  <app-icon name="pin" [size]="14" /> Fixar no topo
                </button>
                <button type="button" class="btn btn-ghost btn-icon btn-danger" (click)="remove(n)" aria-label="Excluir nota" title="Excluir nota"><app-icon name="trash" [size]="15" /></button>
              </div>
            </div>
            <input #titleInput class="note-title" [ngModel]="n.title" (ngModelChange)="edit({ title: $event })" placeholder="Título" aria-label="Título" />
            <div class="note-format" role="toolbar" aria-label="Formatação do texto">
              <button type="button" class="note-fmt" [class.on]="fmt().bold" (mousedown)="$event.preventDefault()" (click)="cmd('bold')" [attr.aria-pressed]="fmt().bold" aria-label="Negrito" title="Negrito (Ctrl+B)"><b>N</b></button>
              <button type="button" class="note-fmt" [class.on]="fmt().italic" (mousedown)="$event.preventDefault()" (click)="cmd('italic')" [attr.aria-pressed]="fmt().italic" aria-label="Itálico" title="Itálico (Ctrl+I)"><i>I</i></button>
              <button type="button" class="note-fmt" [class.on]="fmt().underline" (mousedown)="$event.preventDefault()" (click)="cmd('underline')" [attr.aria-pressed]="fmt().underline" aria-label="Sublinhado" title="Sublinhado (Ctrl+U)"><u>S</u></button>
              <button type="button" class="note-fmt" [class.on]="fmt().strike" (mousedown)="$event.preventDefault()" (click)="cmd('strikeThrough')" [attr.aria-pressed]="fmt().strike" aria-label="Tachado" title="Tachado"><s>T</s></button>
              <span class="note-fmt-sep" aria-hidden="true"></span>
              <button type="button" class="note-fmt" [class.on]="fmt().heading" (mousedown)="$event.preventDefault()" (click)="heading()" [attr.aria-pressed]="fmt().heading" aria-label="Título" title="Título">H</button>
              <button type="button" class="note-fmt" [class.on]="fmt().ul" (mousedown)="$event.preventDefault()" (click)="cmd('insertUnorderedList')" [attr.aria-pressed]="fmt().ul" aria-label="Lista com marcadores" title="Lista com marcadores">&bull;&mdash;</button>
              <button type="button" class="note-fmt" [class.on]="fmt().ol" (mousedown)="$event.preventDefault()" (click)="cmd('insertOrderedList')" [attr.aria-pressed]="fmt().ol" aria-label="Lista numerada" title="Lista numerada">1.</button>
              <button type="button" class="note-fmt" [class.on]="linkOpen()" (mousedown)="$event.preventDefault()" (click)="openLink()" aria-label="Inserir link" title="Link">&#128279;</button>
              <button type="button" class="note-fmt" (mousedown)="$event.preventDefault()" (click)="cmd('removeFormat')" aria-label="Limpar formatação" title="Limpar formatação">Tx</button>
              <span class="note-fmt-sep" aria-hidden="true"></span>
              <button type="button" class="note-fmt note-fmt--wide" (click)="fileInput.click()" [disabled]="uploading()"><app-icon name="paperclip" [size]="14" /> {{ uploading() ? 'Enviando…' : 'Anexar' }}</button>
              <input #fileInput type="file" multiple hidden (change)="pick($event)" />
            </div>
            @if (linkOpen()) {
              <div class="note-link">
                <input class="input" #linkInput type="url" placeholder="https://…" aria-label="Endereço do link" [value]="linkUrl()" (input)="linkUrl.set(linkInput.value)" (keydown.enter)="applyLink(); $event.preventDefault()" (keydown.escape)="linkOpen.set(false)" />
                <button type="button" class="btn btn-primary btn-sm" (click)="applyLink()">Aplicar</button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="linkOpen.set(false)">Cancelar</button>
              </div>
            }
            <div #editor class="note-body note-rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Conteúdo" data-placeholder="Escreva aqui..." (input)="onInput()" (paste)="onPaste($event)" (keyup)="syncFmt()" (mouseup)="syncFmt()"></div>
            @if (n.files?.length) {
              <div class="note-files">
                <div class="note-files__title"><app-icon name="paperclip" [size]="13" /> Anexos ({{ n.files!.length }})</div>
                <div class="th-files">
                  @for (f of n.files!; track f.id) {
                    <div class="th-file">
                      <span class="th-file-ico"><app-icon name="paperclip" [size]="14" /></span>
                      <div class="th-file-meta">
                        <button type="button" class="th-file-name" (click)="download(n, f)" [title]="'Baixar ' + f.name">{{ f.name }}</button>
                        <span class="muted small">{{ fileSize(f.size_bytes) }}</span>
                      </div>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="download(n, f)" [attr.aria-label]="'Baixar ' + f.name" title="Baixar"><app-icon name="download" [size]="14" /></button>
                      <button type="button" class="btn btn-ghost btn-sm btn-icon" (click)="removeFile(n, f)" [attr.aria-label]="'Remover ' + f.name" title="Remover"><app-icon name="trash" [size]="14" /></button>
                    </div>
                  }
                </div>
              </div>
            }
            <div class="muted small note-files__help">Qualquer tipo de arquivo, até {{ fileMaxMb }} MB cada. Arraste para cá ou cole uma imagem.</div>
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
  fileMaxMb = NOTE_FILE_MAX_MB;
  fileSize = fileSize;
  editor = viewChild<ElementRef<HTMLElement>>('editor');
  uploading = signal(false);
  dragOver = signal(false);
  linkOpen = signal(false);
  linkUrl = signal('');
  fmt = signal({ bold: false, italic: false, underline: false, strike: false, heading: false, ul: false, ol: false });
  private savedRange: Range | null = null;
  notes = signal<Note[]>([]);
  selectedId = signal<number | null>(null);
  q = signal('');
  loaded = signal(false);
  saveState = signal<'saved' | 'saving'>('saved');
  shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.notes()
      .filter(n => !q || n.title.toLowerCase().includes(q) || bodyToText(n.body).toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at) || b.id - a.id);
  });
  current = computed(() => this.notes().find(n => n.id === this.selectedId()) ?? null);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private epoch = 0;
  private wantFocus = false;

  constructor() {
    // Carrega o texto no editor quando a nota muda (não a cada tecla, para não perder o cursor).
    effect(() => {
      const id = this.selectedId();
      const el = this.editor()?.nativeElement;
      if (!el) return;
      untracked(() => {
        el.innerHTML = bodyToHtml(this.notes().find(n => n.id === id)?.body ?? '');
        this.linkOpen.set(false);
      });
    });
    document.addEventListener('selectionchange', this.onSelection);
  }

  private onSelection = () => { if (this.inEditor()) this.syncFmt(); };
  private inEditor() {
    const el = this.editor()?.nativeElement;
    const sel = window.getSelection();
    return !!el && !!sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);
  }

  preview(n: Note) { return bodyToText(n.body); }

  syncFmt() {
    const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
    let heading = false;
    try { heading = /^h[1-3]$/i.test(String(document.queryCommandValue('formatBlock'))); } catch { /* sem suporte */ }
    this.fmt.set({ bold: q('bold'), italic: q('italic'), underline: q('underline'), strike: q('strikeThrough'), heading, ul: q('insertUnorderedList'), ol: q('insertOrderedList') });
  }

  cmd(name: string, value?: string) {
    this.editor()?.nativeElement.focus();
    try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* ignora */ }
    document.execCommand(name, false, value);
    this.onInput();
    this.syncFmt();
  }

  heading() {
    this.editor()?.nativeElement.focus();
    document.execCommand('formatBlock', false, this.fmt().heading ? 'div' : 'h3');
    this.onInput();
    this.syncFmt();
  }

  openLink() {
    const sel = window.getSelection();
    this.savedRange = sel && sel.rangeCount && this.inEditor() ? sel.getRangeAt(0).cloneRange() : null;
    this.linkUrl.set('https://');
    this.linkOpen.set(true);
  }

  applyLink() {
    const href = safeHref(this.linkUrl());
    this.linkOpen.set(false);
    if (!href) { this.toast.error('Use um endereço que comece com http://, https:// ou mailto:'); return; }
    const el = this.editor()?.nativeElement;
    el?.focus();
    const sel = window.getSelection();
    if (this.savedRange && sel) { sel.removeAllRanges(); sel.addRange(this.savedRange); }
    if (sel && sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${href.replace(/"/g, '%22')}">${href.replace(/</g, '&lt;')}</a>`);
    else document.execCommand('createLink', false, href);
    this.onInput();
  }

  onInput() {
    const el = this.editor()?.nativeElement;
    if (!el) return;
    if (!(el.textContent || '').trim() && !el.querySelector('li')) el.innerHTML = '';
    this.edit({ body: htmlToBody(el.innerHTML) });
  }

  onPaste(ev: ClipboardEvent) {
    const files = Array.from(ev.clipboardData?.files || []);
    if (files.length) { ev.preventDefault(); this.upload(files); return; }
    const text = ev.clipboardData?.getData('text/plain');
    if (text == null) return;
    ev.preventDefault();
    document.execCommand('insertText', false, text);
  }

  onDragOver(ev: DragEvent) {
    if (!isExternalFileDrag(ev)) return;
    ev.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(ev: DragEvent) {
    this.dragOver.set(false);
    const files = Array.from(ev.dataTransfer?.files || []);
    if (!files.length) return;
    ev.preventDefault();
    this.upload(files);
  }

  pick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length) this.upload(files);
  }

  upload(files: File[]) {
    const n = this.current();
    if (!n) return;
    const max = NOTE_FILE_MAX_MB * 1024 * 1024;
    const ok = files.filter(f => {
      if (f.size > max) { this.toast.error(`${f.name} passa de ${NOTE_FILE_MAX_MB} MB.`); return false; }
      return true;
    });
    if (!ok.length) return;
    this.uploading.set(true);
    this.api.uploadNoteFiles(n.id, ok).subscribe({
      next: created => {
        this.uploading.set(false);
        this.notes.update(list => list.map(x => (x.id === n.id ? { ...x, files: [...(x.files || []), ...created] } : x)));
        this.toast.show(created.length === 1 ? 'Anexo incluído.' : 'Anexos incluídos.');
      },
      error: e => { this.uploading.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  download(n: Note, f: TaskFile) {
    this.api.downloadNoteFile(n.id, f.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: e => this.toast.error(errorMessage(e, 'Não foi possível baixar o arquivo.')),
    });
  }

  removeFile(n: Note, f: TaskFile) {
    this.api.deleteNoteFile(n.id, f.id).subscribe({
      next: () => this.notes.update(list => list.map(x => (x.id === n.id ? { ...x, files: (x.files || []).filter(y => y.id !== f.id) } : x))),
      error: e => this.toast.error(errorMessage(e)),
    });
  }

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

  ngOnDestroy() { document.removeEventListener('selectionchange', this.onSelection); this.flush(); }

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
