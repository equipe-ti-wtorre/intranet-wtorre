import { Component, ElementRef, OnDestroy, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Person } from '../core/models';
import { AvatarComponent, IconComponent } from './ui';

export interface PersonGroup { label: string; people: Person[] }
export interface PickerSpecial { value: number | null; label: string }

const depKey = (d?: string | null) => (d || '').trim().toLocaleLowerCase('pt-BR');

// Responsável da etapa: quem cria, o departamento dos solicitantes do projeto e o restante.
export function stepAssigneeGroups(people: Person[], meId: number | null, meFallback?: Person | null): PersonGroup[] {
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name, 'pt-BR');
  const me = (meId ? people.find(p => p.id === meId) : null) || (meFallback?.id === meId ? meFallback : null);
  const deps = new Map<string, string>();
  for (const p of people) {
    const key = depKey(p.department);
    if (p.is_requester && key && !deps.has(key)) deps.set(key, (p.department || '').trim());
  }
  const groups: PersonGroup[] = [];
  if (me) groups.push({ label: 'Você', people: [me] });
  const dept = people.filter(p => p.id !== me?.id && deps.has(depKey(p.department))).sort(byName);
  if (dept.length) groups.push({ label: [...deps.values()].join(' · '), people: dept });
  const shown = new Set<number>([...(me ? [me.id] : []), ...dept.map(p => p.id)]);
  const rest = people.filter(p => !shown.has(p.id)).sort(byName);
  if (rest.length) groups.push({ label: 'Geral', people: rest });
  return groups;
}

type Row =
  | { kind: 'label'; key: string; label: string }
  | { kind: 'opt'; key: string; index: number; value: number | null; label: string; person: Person | null; sub: string; selected: boolean };

const LIMIT = 50;
const norm = (s: string | null | undefined) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function awayLabel(p: Person) {
  if (!p.away_until) return '';
  const d = new Date(`${p.away_until.slice(0, 10)}T12:00:00`);
  if (isNaN(d.getTime()) || d.getTime() < Date.now() - 86_400_000) return '';
  return `ausente até ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

function defaultSub(p: Person) {
  const parts = [p.team_name || p.sector_name || '', p.department || ''].map(s => s.trim()).filter(Boolean);
  const uniq = parts.filter((s, i) => parts.findIndex(x => norm(x) === norm(s)) === i);
  const away = awayLabel(p);
  return [...uniq, away].filter(Boolean).join(' · ');
}

// Seletor de pessoa com busca: substitui o <select> nativo, que fica inviável com centenas de pessoas.
// "add" limpa a busca e continua aberto (para incluir várias); "single" mostra a escolhida e fecha.
@Component({
  selector: 'app-person-picker',
  standalone: true,
  imports: [AvatarComponent, IconComponent],
  host: { '[class.pp-host]': 'true', '[class.pp-host--inline]': "variant() === 'inline'" },
  template: `
    <button #trigger type="button" class="pp-trigger" [class.select]="variant() === 'field'" [class.inline]="variant() === 'inline'"
            [disabled]="disabled()" (click)="toggle()" (keydown)="onTriggerKey($event)"
            [attr.aria-label]="ariaLabel() || placeholder()" aria-haspopup="listbox" [attr.aria-expanded]="open()" [title]="triggerTitle()">
      @if (selectedPerson(); as p) {
        <app-avatar [person]="p" /><span class="pp-trigger__text">{{ p.name }}</span>
      } @else {
        <span class="pp-trigger__text" [class.pp-trigger__text--ph]="!selectedSpecial()">{{ selectedSpecial()?.label || placeholder() }}</span>
      }
    </button>
    <div #panel class="pp-panel" [hidden]="!open()" (keydown)="onKey($event)">
      <div class="pp-search">
        <app-icon name="search" [size]="14" />
        <input #search class="pp-search__input" [value]="q()" (input)="onQuery(search.value)" placeholder="Buscar por nome, equipe ou área"
               aria-label="Buscar pessoa" autocomplete="off" spellcheck="false" />
      </div>
      <div #list class="pp-list" role="listbox" [attr.aria-label]="ariaLabel() || placeholder()">
        @for (row of rows(); track row.key) {
          @if (row.kind === 'label') {
            <div class="pp-group">{{ row.label }}</div>
          } @else {
            <button type="button" role="option" class="pp-opt" [class.pp-opt--active]="row.index === active()" [attr.aria-selected]="row.selected"
                    [attr.data-i]="row.index" (mouseenter)="active.set(row.index)" (click)="choose(row.value)">
              @if (row.person; as p) {
                <app-avatar [person]="p" />
                <span class="pp-opt__text"><span class="pp-opt__name">{{ p.name }}</span>@if (row.sub) { <span class="pp-opt__sub">{{ row.sub }}</span> }</span>
              } @else {
                <span class="pp-opt__text"><span class="pp-opt__name">{{ row.label }}</span></span>
              }
              @if (row.selected) { <app-icon name="check" [size]="14" /> }
            </button>
          }
        }
        @if (!optionCount()) { <div class="pp-empty">Ninguém encontrado.</div> }
        @if (hiddenCount() > 0) { <div class="pp-more">Mais {{ hiddenCount() }} {{ hiddenCount() === 1 ? 'pessoa' : 'pessoas' }}. Digite para refinar.</div> }
      </div>
    </div>
  `,
})
export class PersonPickerComponent implements OnDestroy {
  people = input<Person[]>([]);
  groups = input<PersonGroup[] | null>(null);
  specials = input<PickerSpecial[]>([]);
  placeholder = input('Adicionar pessoa…');
  ariaLabel = input('');
  value = input<number | null | undefined>(undefined);
  mode = input<'add' | 'single'>('add');
  variant = input<'field' | 'inline'>('field');
  disabled = input(false);
  subOf = input<((p: Person) => string) | null>(null);
  picked = output<number | null>();

  open = signal(false);
  q = signal('');
  active = signal(0);

  private trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private search = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private list = viewChild.required<ElementRef<HTMLElement>>('list');
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private onDocDown = (e: Event) => {
    const t = e.target as Node;
    if (!this.host.nativeElement.contains(t) && !this.panel().nativeElement.contains(t)) this.close(false);
  };
  private onScroll = (e: Event) => {
    if (this.panel().nativeElement.contains(e.target as Node)) return;
    this.place();
  };
  private onResize = () => this.close(false);

  constructor() {
    // Fora do modal (que tem transform/overflow), mas dentro de .taskhub-root para manter o tema.
    afterNextRender(() => {
      const el = this.panel().nativeElement;
      (this.host.nativeElement.closest('.taskhub-root') || document.body).appendChild(el);
    });
  }

  private allGroups = computed<PersonGroup[]>(() => this.groups() || [{ label: '', people: this.people() }]);
  private allPeople = computed(() => this.allGroups().flatMap(g => g.people));
  selectedPerson = computed(() => {
    const v = this.value();
    if (this.mode() !== 'single' || v === null || v === undefined || this.specials().some(s => s.value === v)) return null;
    return this.allPeople().find(p => p.id === v) || null;
  });
  selectedSpecial = computed(() => {
    if (this.mode() !== 'single') return null;
    const v = this.value() ?? null;
    return this.specials().find(s => s.value === v) || null;
  });
  triggerTitle = computed(() => {
    const p = this.selectedPerson();
    return p ? [p.name, this.sub(p)].filter(Boolean).join(' · ') : (this.selectedSpecial()?.label || this.placeholder());
  });

  private sub(p: Person) { const f = this.subOf(); return f ? f(p) : defaultSub(p); }

  private result = computed(() => {
    const tokens = norm(this.q()).split(/\s+/).filter(Boolean);
    const match = (hay: string) => tokens.every(t => hay.includes(t));
    const current = this.mode() === 'single' ? (this.value() ?? null) : undefined;
    const rows: Row[] = [];
    let index = 0; let shown = 0; let total = 0;
    for (const s of this.specials()) {
      if (tokens.length && !match(norm(s.label))) continue;
      rows.push({ kind: 'opt', key: `s:${s.value}`, index: index++, value: s.value, label: s.label, person: null, sub: '', selected: current === s.value });
    }
    for (const g of this.allGroups()) {
      const hits = g.people.filter(p => !tokens.length || match(norm([p.name, p.username, p.team_name, p.sector_name, p.department, p.job_title].join(' '))));
      total += hits.length;
      const room = Math.max(0, LIMIT - shown);
      const take = hits.slice(0, room);
      if (!take.length) continue;
      if (g.label) rows.push({ kind: 'label', key: `g:${g.label}`, label: g.label });
      for (const p of take) {
        rows.push({ kind: 'opt', key: `p:${p.id}`, index: index++, value: p.id, label: p.name, person: p, sub: this.sub(p), selected: current === p.id });
      }
      shown += take.length;
    }
    return { rows, options: index, hidden: total - shown };
  });
  rows = computed(() => this.result().rows);
  optionCount = computed(() => this.result().options);
  hiddenCount = computed(() => this.result().hidden);

  toggle() { this.open() ? this.close(true) : this.show(); }

  show(initial = '') {
    if (this.disabled() || this.open()) return;
    this.q.set(initial);
    const sel = this.rows().find(r => r.kind === 'opt' && r.selected);
    this.active.set(sel && sel.kind === 'opt' ? sel.index : 0);
    this.open.set(true);
    this.place();
    document.addEventListener('mousedown', this.onDocDown, true);
    document.addEventListener('scroll', this.onScroll, true);
    window.addEventListener('resize', this.onResize);
    setTimeout(() => { this.search().nativeElement.focus(); this.scrollActive(); });
  }

  close(refocus: boolean) {
    if (!this.open()) return;
    this.open.set(false);
    this.removeListeners();
    if (refocus) this.trigger().nativeElement.focus();
  }

  onQuery(v: string) { this.q.set(v); this.active.set(0); this.list().nativeElement.scrollTop = 0; }

  choose(value: number | null) {
    this.picked.emit(value);
    if (this.mode() === 'add') {
      this.q.set('');
      this.active.set(0);
      setTimeout(() => this.search().nativeElement.focus());
    } else {
      this.close(true);
    }
  }

  onTriggerKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.show(); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') { e.preventDefault(); this.show(e.key); }
  }

  onKey(e: KeyboardEvent) {
    const n = this.optionCount();
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) this.active.set((this.active() + 1) % n); this.scrollActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) this.active.set((this.active() - 1 + n) % n); this.scrollActive(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const row = this.rows().find(r => r.kind === 'opt' && r.index === this.active());
      if (row && row.kind === 'opt') this.choose(row.value);
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(true); }
    else if (e.key === 'Tab') this.close(false);
  }

  private scrollActive() {
    setTimeout(() => this.list().nativeElement.querySelector<HTMLElement>(`[data-i="${this.active()}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

  private place() {
    const r = this.trigger().nativeElement.getBoundingClientRect();
    const el = this.panel().nativeElement;
    const vw = window.innerWidth; const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 300), vw - 16);
    const below = vh - r.bottom; const above = r.top;
    const up = below < 340 && above > below;
    const maxH = Math.max(160, Math.min(360, (up ? above : below) - 12));
    el.style.width = `${width}px`;
    el.style.left = `${Math.max(8, Math.min(r.left, vw - width - 8))}px`;
    el.style.maxHeight = `${maxH}px`;
    if (up) { el.style.top = ''; el.style.bottom = `${vh - r.top + 4}px`; }
    else { el.style.bottom = ''; el.style.top = `${r.bottom + 4}px`; }
  }

  private removeListeners() {
    document.removeEventListener('mousedown', this.onDocDown, true);
    document.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onResize);
  }

  ngOnDestroy() {
    this.removeListeners();
    this.panel().nativeElement.remove();
  }
}