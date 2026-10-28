import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription, debounceTime, switchMap, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { UiService } from '../core/ui.service';
import { DataService } from '../core/data.service';
import { AuthService } from '../core/auth.service';
import { Person, SearchResult } from '../core/models';
import { AvatarComponent, IconComponent, AutofocusDirective } from '../shared/ui';

interface Item { kind: 'cmd' | 'task' | 'project' | 'person'; label: string; note?: string; icon?: string; color?: string; person?: Person; run: () => void; }

@Component({
  selector: 'app-palette',
  standalone: true,
  imports: [AutofocusDirective, FormsModule, AvatarComponent, IconComponent],
  template: `
    <div class="modal-scrim" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Buscar e comandos">
        <input class="pal-input" appAutofocus placeholder="Buscar tarefas, projetos, pessoas ou digitar um comando…"
               [ngModel]="q()" (ngModelChange)="onQuery($event)" (keydown)="key($event)" aria-label="Buscar" />
        <div class="pal-list">
          @for (g of groups(); track g.title) {
            <div class="pal-group">{{ g.title }}</div>
            @for (it of g.items; track it.label + $index) {
              <button class="pal-item" [class.on]="flat().indexOf(it) === active()" (mouseenter)="active.set(flat().indexOf(it))" (click)="it.run()">
                @if (it.person) { <app-avatar [person]="it.person" /> }
                @else if (it.color) { <span class="dot" style="width:9px;height:9px;border-radius:3px" [style.background]="it.color"></span> }
                @else { <app-icon [name]="it.icon || 'arrow'" [size]="15" /> }
                <span class="ellipsis">{{ it.label }}</span>
                @if (it.note) { <span class="side-note">{{ it.note }}</span> }
              </button>
            }
          }
          @if (!flat().length) { <div class="pal-empty">Nada encontrado para "{{ q() }}".</div> }
        </div>
      </div>
    </div>
  `,
})
export class PaletteComponent implements OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private ui = inject(UiService);
  private data = inject(DataService);
  private auth = inject(AuthService);

  q = signal('');
  active = signal(0);
  results = signal<SearchResult>({ tasks: [], projects: [], works: [], people: [] });
  private query$ = new Subject<string>();
  private sub: Subscription;

  private commands: Item[] = [
    { kind: 'cmd', label: 'Nova tarefa', note: 'Q', icon: 'plus', run: () => { this.close(); this.ui.openQuickAdd(); } },
    { kind: 'cmd', label: 'Ir para Meu Dia', note: 'G H', icon: 'sun', run: () => this.go('/meu-dia') },
    { kind: 'cmd', label: 'Ir para Caixa de entrada', note: 'G I', icon: 'inbox', run: () => this.go('/caixa-de-entrada') },
    { kind: 'cmd', label: 'Minhas tarefas', note: 'G M', icon: 'check', run: () => this.go('/tarefas?v=minhas&space=profissional') },
    { kind: 'cmd', label: 'Minhas tarefas individuais', note: 'G P', icon: 'user', run: () => this.go('/tarefas?v=minhas&space=pessoal') },
    { kind: 'cmd', label: 'Notas', note: 'G N', icon: 'note', run: () => this.go('/notas') },
    { kind: 'cmd', label: 'Lembretes', note: 'G L', icon: 'bell', run: () => this.go('/lembretes') },
    { kind: 'cmd', label: 'Atribuídas por mim', note: 'G A', icon: 'send', run: () => this.go('/tarefas?v=delegadas&space=profissional') },
    { kind: 'cmd', label: 'Equipes', note: 'G E', icon: 'people', run: () => this.go('/equipes') },
    { kind: 'cmd', label: 'Novo projeto individual', icon: 'folder', run: () => { this.close(); this.ui.openNewProject('pessoal'); } },
    { kind: 'cmd', label: 'Alternar paleta WTorre / Nubank', icon: 'moon', run: () => { this.ui.togglePalette(); this.close(); } },
    { kind: 'cmd', label: 'Atalhos de teclado', note: '?', icon: 'gear', run: () => { this.close(); this.ui.helpOpen.set(true); } },
  ];

  groups = computed(() => {
    const q = this.q().trim().toLowerCase();
    const r = this.results();
    const cmds = this.commands.filter(c => !q || c.label.toLowerCase().includes(q));
    const works: Item[] = (r.works || []).map(w => ({
      kind: 'project', label: w.name, note: w.team_name, color: w.color, run: () => this.go(`/equipes/${w.team_id}/projetos/${w.id}`),
    }));
    const projects: Item[] = [...works, ...(q.length >= 2 ? r.projects : this.data.projects().slice(0, 5)).map((p): Item => ({
      kind: 'project', label: p.name, note: p.is_board ? 'Equipe' : p.owner_name || p.team_name || undefined, color: p.color,
      run: () => this.go(p.is_board && p.team_id ? `/equipes/${p.team_id}` : `/projetos/${p.id}`),
    }))];
    const tasks: Item[] = r.tasks.map(t => ({
      kind: 'task', label: t.title, note: t.project?.name || (t.space === 'pessoal' ? 'Individual' : 'Sem projeto'), icon: t.status.category === 'done' ? 'check' : 'list',
      run: () => { this.close(); this.ui.openTask(t.id); },
    }));
    const people: Item[] = r.people.map(p => ({
      kind: 'person', label: p.name, note: p.job_title || `@${p.username}`, person: p,
      run: () => this.go(`/tarefas?v=pessoa&pessoa=${p.id}`),
    }));
    return [
      { title: 'Tarefas', items: tasks },
      { title: 'Projetos e equipes', items: projects },
      { title: 'Pessoas', items: people },
      { title: 'Comandos', items: cmds },
    ].filter(g => g.items.length);
  });
  flat = computed(() => this.groups().flatMap(g => g.items));

  constructor() {
    this.sub = this.query$.pipe(debounceTime(180), switchMap(q => (q.trim().length >= 2 ? this.api.search(q) : of({ tasks: [], projects: [], works: [], people: [] }))))
      .subscribe(r => { this.results.set(r); this.active.set(0); });
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  onQuery(v: string) { this.q.set(v); this.active.set(0); this.query$.next(v); }

  key(e: KeyboardEvent) {
    const n = this.flat().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.active.set((this.active() + 1) % Math.max(n, 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.active.set((this.active() - 1 + n) % Math.max(n, 1)); }
    if (e.key === 'Enter') { e.preventDefault(); this.flat()[this.active()]?.run(); }
  }

  go(url: string) { this.close(); this.router.navigateByUrl(url); }
  close() { this.ui.paletteOpen.set(false); }
}
