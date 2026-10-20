import { AfterViewInit, Component, Directive, ElementRef, EventEmitter, Input, Output, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Person, Priority, Task } from '../core/models';
import { dueLabel, dueTone, isClosed, priorityLabel } from '../core/format';
import { AuthService } from '../core/auth.service';
import { DataService } from '../core/data.service';
import { resolveAvatarUrl } from '../core/avatar';

// Ícones de traço simples, desenhados para 16px.
const ICONS: Record<string, string> = {
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  inbox: '<path d="M2 9.5l1.6-6h8.8L14 9.5V13H2z"/><path d="M2 9.5h3.5l1 1.5h3l1-1.5H14"/>',
  check: '<path d="M3 8.5l3 3 7-7"/>',
  send: '<path d="M2.5 8h8M8 4.5L11.5 8 8 11.5"/><path d="M13.5 3v10"/>',
  people: '<circle cx="6" cy="5.5" r="2.3"/><path d="M1.8 13c.5-2.3 2.2-3.5 4.2-3.5s3.7 1.2 4.2 3.5"/><path d="M10.5 3.4a2.2 2.2 0 010 4.2M12 9.8c1.2.5 2 1.6 2.3 3.2"/>',
  chart: '<path d="M2 13.5h12"/><path d="M4 11V7M8 11V3.5M12 11V8.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  search: '<circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2L14 14"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7"/>',
  calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  comment: '<path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z"/>',
  subtasks: '<path d="M3 4h2M3 8h2M3 12h2M7.5 4h5.5M7.5 8h5.5M7.5 12h5.5"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>',
  moon: '<path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z"/>',
  menu: '<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>',
  board: '<rect x="2" y="2.5" width="3.5" height="11" rx="1"/><rect x="6.3" y="2.5" width="3.5" height="7" rx="1"/><rect x="10.6" y="2.5" width="3.5" height="9" rx="1"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.8" cy="4" r=".6"/><circle cx="2.8" cy="8" r=".6"/><circle cx="2.8" cy="12" r=".6"/>',
  clock: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.4"/>',
  arrow: '<path d="M3 8h10M9 4l4 4-4 4"/>',
  chevron: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  back: '<path d="M13 8H3M7 4L3 8l4 4"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>',
  pencil: '<path d="M9.2 2.6l4.2 4.2L6 14.2H1.8V10z"/><path d="M8 3.8l4.2 4.2"/>',
  more: '<circle cx="3.2" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="12.8" cy="8" r=".9" fill="currentColor" stroke="none"/>',
  archive: '<rect x="2" y="3" width="12" height="3" rx="1"/><path d="M3 6v7h10V6M6.5 9h3"/>',
  user: '<circle cx="8" cy="5.5" r="2.7"/><path d="M2.8 14c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3"/>',
  folder: '<path d="M2 4.5c0-.6.4-1 1-1h3.2l1.3 1.5H13c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z"/>',
  logout: '<path d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6.5"/>',
  snooze: '<circle cx="8" cy="8.5" r="5.3"/><path d="M6.3 6.8h3.4L6.3 10.2h3.4M3 2.5L1.8 3.7M13 2.5l1.2 1.2"/>',
  flag: '<path d="M3.5 14V2.5M3.5 3h8l-1.6 3 1.6 3h-8"/>',
  note: '<path d="M4 2.2h5.2L13 6v7.6a1.2 1.2 0 01-1.2 1.2H4.2A1.2 1.2 0 013 13.6V3.4A1.2 1.2 0 014.2 2.2z"/><path d="M9 2.4V6h3.6"/>',
  bell: '<path d="M8 1.8a.7.7 0 01.7.7v.5a4 4 0 013.3 3.9v3.2l.8 1.1H3.2l.8-1.1V6.9A4 4 0 017.3 3v-.5a.7.7 0 01.7-.7z"/><path d="M6.4 12.6a1.6 1.6 0 003.2 0"/>',
  pin: '<path d="M6.2 2.2h3.6l-.5 3.1 1.8 1.4v1.1H5v-1.1l1.7-1.4z"/><path d="M8 7.8V14"/>',
};

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
    stroke-linejoin="round" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" [innerHTML]="svg()"></svg>`,
  styles: [':host{display:inline-flex;flex-shrink:0}'],
})
export class IconComponent {
  name = input.required<string>();
  size = input(16);
  private san = inject(DomSanitizer);
  // Os ícones são constantes deste arquivo, nunca conteúdo do usuário.
  svg = computed(() => this.san.bypassSecurityTrustHtml(ICONS[this.name()] || ''));
}

@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `@if (person(); as p) {
      <span class="avatar" [class.lg]="large()" [class.xl]="preview()" [title]="p.name">
        @if (photo(); as src) { <img [src]="src" [alt]="p.name" /> } @else { {{ p.initials }} }
      </span>
    } @else {
      <span class="avatar none" [class.lg]="large()" [class.xl]="preview()" title="Sem responsável">?</span>
    }`,
  styles: [':host{display:inline-flex}'],
})
export class AvatarComponent {
  private data = inject(DataService);
  person = input<(Pick<Person, 'name' | 'initials'> & { id?: number; avatar_url?: string | null; color?: string }) | null | undefined>(null);
  large = input(false);
  preview = input(false);
  photo = computed(() => {
    const p = this.person();
    if (!p) return null;
    if (p.avatar_url) return resolveAvatarUrl(p.avatar_url);
    if (p.avatar_url === null) return null;
    if (!p.id) return null;
    return resolveAvatarUrl(this.data.people().find(x => x.id === p.id)?.avatar_url);
  });
}

@Component({
  selector: 'app-prio',
  standalone: true,
  template: `<svg class="prio" [class]="'prio prio-' + p()" viewBox="0 0 14 14" [attr.aria-label]="'Prioridade ' + label()">
      <title>Prioridade {{ label() }}</title>
      <rect x="1" y="9" width="3" height="4" rx="1" fill="currentColor"/>
      <rect x="5.5" y="5.5" width="3" height="7.5" rx="1" [attr.fill]="p() === 'baixa' ? 'none' : 'currentColor'" stroke="currentColor"/>
      <rect x="10" y="2" width="3" height="11" rx="1" [attr.fill]="p() === 'critica' || p() === 'alta' ? 'currentColor' : 'none'" stroke="currentColor"/>
    </svg>`,
  styles: [':host{display:inline-flex}'],
})
export class PrioComponent {
  p = input<Priority>('media');
  label = computed(() => priorityLabel(this.p()));
}

@Component({
  selector: 'app-status',
  standalone: true,
  template: `<span class="pill"><i [style.background]="color()"></i>{{ name() }}</span>`,
  styles: [':host{display:inline-flex}'],
})
export class StatusPillComponent {
  name = input('');
  color = input('#8b93a1');
}

// Linha de tarefa usada em listas, painéis e resultados.
@Component({
  selector: 'app-task-row',
  standalone: true,
  imports: [AvatarComponent, PrioComponent, StatusPillComponent, IconComponent],
  template: `
    <div class="trow" [class.done]="closed()" (click)="open.emit(task())" role="button" tabindex="0"
         (keydown.enter)="open.emit(task())">
      <button class="tick" [class.on]="task().status.category === 'done'" [disabled]="task().access !== 'edit' && task().access !== 'work'"
              (click)="$event.stopPropagation(); toggle.emit(task())"
              [attr.aria-label]="task().status.category === 'done' ? 'Reabrir tarefa' : 'Concluir tarefa'"></button>
      <app-prio [p]="task().priority" />
      <span class="t-title">{{ task().title }}</span>
      @if (stepOnly()) { <span class="step-chip" [title]="'Sua etapa: ' + stepText()">Sua etapa: {{ stepText() }}</span> }
      <span class="meta">
        @if (showSpace() && task().space === 'pessoal') { <span class="space-chip">Individual</span> }
        @if (task().is_private) { <app-icon name="lock" [size]="13" class="lock" title="Tarefa privada" /> }
        @if (task().subtasks_total) {
          <span class="chip"><app-icon name="subtasks" [size]="13" />{{ task().subtasks_done }}/{{ task().subtasks_total }}</span>
        }
        @if (task().comments_count) { <span class="chip"><app-icon name="comment" [size]="13" />{{ task().comments_count }}</span> }
        @if (showProject() && task().project) {
          <span class="proj-tag" [title]="task().project!.name + (task().section ? ' › ' + task().section!.name : '')"><i [style.background]="task().project!.color"></i><span class="ellipsis">{{ task().project!.name }}@if (task().section) { › {{ task().section!.name }} }</span></span>
        }
        @if (showStatus()) { <span class="col-status"><app-status [name]="task().status.name" [color]="task().status.color" /></span> }
        <span class="col-due due" [class]="'col-due due ' + tone()">{{ due() }}</span>
        <span class="col-who"><app-avatar [person]="task().assignee" /></span>
      </span>
    </div>`,
})
export class TaskRowComponent {
  task = input.required<Task>();
  showProject = input(true);
  showStatus = input(true);
  showSpace = input(false);
  @Output() open = new EventEmitter<Task>();
  @Output() toggle = new EventEmitter<Task>();
  private auth = inject(AuthService);
  closed = computed(() => isClosed(this.task().status.category));
  // A tarefa é de outra pessoa, mas há uma etapa pendente comigo.
  stepOnly = computed(() => this.task().assignee?.id !== this.auth.user()?.id && (this.task().my_steps?.length ?? 0) > 0);
  stepText = computed(() => this.task().my_steps.map(s => s.title).join('; '));
  due = computed(() => dueLabel(this.task().due_date));
  tone = computed(() => dueTone(this.task()));
}

// Renderiza texto de comentário destacando @menções (sem HTML do usuário).
@Component({
  selector: 'app-rich-text',
  standalone: true,
  template: `@for (part of parts(); track $index) {
      @if (part.mention) { <span class="mention">{{ part.text }}</span> } @else { {{ part.text }} }
    }`,
})
export class RichTextComponent {
  text = input('');
  parts = computed(() => this.text().split(/(@[a-z0-9._-]+)/gi).filter(Boolean).map(t => ({ text: t, mention: t.startsWith('@') })));
}

@Component({
  selector: 'app-empty',
  standalone: true,
  template: `<div class="empty"><b>{{ title }}</b><span>{{ text }}</span><ng-content /></div>`,
})
export class EmptyComponent {
  @Input() title = '';
  @Input() text = '';
}

// Foca o campo quando ele aparece (o atributo autofocus não funciona em janelas abertas depois do carregamento).
@Directive({ selector: '[appAutofocus]', standalone: true })
export class AutofocusDirective implements AfterViewInit {
  private el = inject(ElementRef<HTMLElement>);
  ngAfterViewInit() {
    this.el.nativeElement.focus();
    setTimeout(() => { if (document.activeElement !== this.el.nativeElement) this.el.nativeElement.focus(); }, 0);
  }
}
