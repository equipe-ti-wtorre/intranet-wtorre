import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface QuickAddDefaults { space?: 'profissional' | 'pessoal'; project_id?: number | null; status_id?: number | null; section_id?: number | null; plan_today?: boolean; plan_period?: 'manha' | 'tarde' | 'fim'; assignee_id?: number | null; }

export type AppPalette = 'wtorre' | 'nubank-parque';

function readPalette(): AppPalette {
  try {
    return localStorage.getItem('taskhub_palette') === 'nubank-parque' ? 'nubank-parque' : 'wtorre';
  } catch {
    return 'wtorre';
  }
}

@Injectable({ providedIn: 'root' })
export class UiService {
  readonly drawerTaskId = signal<number | null>(null);
  readonly quickAdd = signal<QuickAddDefaults | null>(null);
  readonly paletteOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly newProjectOpen = signal<false | 'profissional' | 'pessoal'>(false);
  readonly newProjectSectorId = signal<number | null>(null);
  readonly palette = signal<AppPalette>(readPalette());
  readonly logoFullSrc = computed(() => (this.palette() === 'nubank-parque' ? 'assets/taskhub/brand/logo-nubank-parque-negativo.svg' : 'assets/taskhub/logo.svg'));
  readonly logoWordmarkSrc = computed(() => (this.palette() === 'nubank-parque' ? 'assets/taskhub/brand/logo-nubank-parque.svg' : 'assets/taskhub/logo.svg'));
  readonly logoMarkSrc = computed(() => (this.palette() === 'nubank-parque' ? 'assets/taskhub/brand/logo-nubank-parque-mark.svg' : 'assets/taskhub/wt-mark.svg'));
  readonly logoAlt = computed(() => (this.palette() === 'nubank-parque' ? 'TaskHub · Nubank Parque' : 'TaskHub · WTorre'));

  // Avisa as telas abertas de que alguma tarefa mudou (para recarregar listas).
  readonly taskChanged$ = new Subject<number | null>();

  // Tarefas escondidas enquanto o "Desfazer" da exclusão está disponível.
  readonly hidden = signal<ReadonlySet<number>>(new Set());
  hide(id: number) { this.hidden.update(s => new Set(s).add(id)); }
  unhide(id: number) { this.hidden.update(s => { const n = new Set(s); n.delete(id); return n; }); }

  openTask(id: number) { this.drawerTaskId.set(id); }
  closeTask() { this.drawerTaskId.set(null); }
  openQuickAdd(defaults: QuickAddDefaults = {}) { this.quickAdd.set(defaults); }
  openNewProject(space: 'profissional' | 'pessoal', sectorId: number | null = null) {
    this.newProjectSectorId.set(space === 'profissional' ? sectorId : null);
    this.newProjectOpen.set(space);
  }
  closeNewProject() {
    this.newProjectOpen.set(false);
    this.newProjectSectorId.set(null);
  }

  setPalette(next: AppPalette) {
    this.palette.set(next);
    try { localStorage.setItem('taskhub_palette', next); } catch {}
  }

  togglePalette() {
    this.setPalette(this.palette() === 'wtorre' ? 'nubank-parque' : 'wtorre');
  }

}
