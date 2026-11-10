import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface QuickAddDefaults { space?: 'profissional' | 'pessoal'; project_id?: number | null; status_id?: number | null; section_id?: number | null; phase_id?: number | null; plan_today?: boolean; plan_period?: 'manha' | 'tarde' | 'fim'; assignee_id?: number | null; restore?: boolean; }

export interface TaskDraft {
  title: string;
  description: string;
  section_id: number | null;
  project_id: number | null;
  phase_id: number | null;
  due_date: string | null;
  priority: 'critica' | 'alta' | 'media' | 'baixa';
  size: 'P' | 'M' | 'G' | null;
  aligned_on: string | null;
  plan_today: boolean;
  contact_ids: number[];
  steps: { title: string; assignee_id: number | null; due_date: string | null; notify: boolean }[];
  steps_ordered: boolean;
}

const TASK_DRAFT_KEY = 'taskhub_task_draft';

export type AppPalette = 'wtorre' | 'nubank-parque';

// Chave nova para que todos comecem na Nubank Parque; quem quiser volta para WTorre no Perfil.
const PALETTE_KEY = 'taskhub_palette_v2';

function readPalette(): AppPalette {
  try {
    return localStorage.getItem(PALETTE_KEY) === 'wtorre' ? 'wtorre' : 'nubank-parque';
  } catch {
    return 'nubank-parque';
  }
}

@Injectable({ providedIn: 'root' })
export class UiService {
  readonly drawerTaskId = signal<number | null>(null);
  readonly quickAdd = signal<QuickAddDefaults | null>(null);
  readonly paletteOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly newProjectOpen = signal<false | 'profissional' | 'pessoal'>(false);
  readonly openPersonalWork = signal(false);
  readonly newProjectSectorId = signal<number | null>(null);
  readonly palette = signal<AppPalette>(readPalette());
  readonly logoFullSrc = computed(() => (this.palette() === 'nubank-parque' ? 'assets/taskhub/brand/logo-nubank-parque-negativo.svg' : 'assets/taskhub/logo.svg'));
  readonly logoWordmarkSrc = computed(() => (this.palette() === 'nubank-parque' ? 'assets/taskhub/brand/logo-nubank-parque.svg' : 'assets/taskhub/logo.svg'));
  readonly logoMarkSrc = computed(() => (this.palette() === 'nubank-parque' ? 'assets/taskhub/brand/logo-nubank-parque-mark.svg' : 'assets/taskhub/wt-mark.svg'));
  readonly logoAlt = computed(() => (this.palette() === 'nubank-parque' ? 'TaskHub · Nubank Parque' : 'TaskHub · WTorre'));

  // Avisa as telas abertas de que alguma tarefa mudou (para recarregar listas).
  readonly taskChanged$ = new Subject<number | null>();
  readonly taskDraftTick = signal(0);

  // Tarefas escondidas enquanto o "Desfazer" da exclusão está disponível.
  readonly hidden = signal<ReadonlySet<number>>(new Set());
  hide(id: number) { this.hidden.update(s => new Set(s).add(id)); }
  unhide(id: number) { this.hidden.update(s => { const n = new Set(s); n.delete(id); return n; }); }

  openTask(id: number) { this.drawerTaskId.set(id); }
  closeTask() { this.drawerTaskId.set(null); }
  openQuickAdd(defaults: QuickAddDefaults = {}) { this.quickAdd.set(defaults); }

  readTaskDraft(): TaskDraft | null {
    try {
      const raw = localStorage.getItem(TASK_DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d.title !== 'string') return null;
      const ids = (v: unknown) => Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
      const steps = Array.isArray(d.steps) ? d.steps.filter((s: { title?: unknown }) => s && typeof s.title === 'string').map((s: { title: string; assignee_id?: unknown; due_date?: unknown; notify?: unknown }) => ({
        title: s.title,
        assignee_id: typeof s.assignee_id === 'number' ? s.assignee_id : null,
        due_date: typeof s.due_date === 'string' ? s.due_date : null,
        notify: s.notify !== false,
      })) : [];
      const priority = d.priority === 'critica' || d.priority === 'alta' || d.priority === 'baixa' ? d.priority : 'media';
      const size = d.size === 'P' || d.size === 'M' || d.size === 'G' ? d.size : null;
      return {
        title: d.title,
        description: typeof d.description === 'string' ? d.description : '',
        section_id: typeof d.section_id === 'number' ? d.section_id : null,
        project_id: typeof d.project_id === 'number' ? d.project_id : null,
        phase_id: typeof d.phase_id === 'number' ? d.phase_id : null,
        due_date: typeof d.due_date === 'string' ? d.due_date : null,
        priority, size,
        aligned_on: typeof d.aligned_on === 'string' ? d.aligned_on : null,
        plan_today: !!d.plan_today,
        contact_ids: ids(d.contact_ids),
        steps,
        steps_ordered: d.steps_ordered !== false,
      };
    } catch { return null; }
  }

  writeTaskDraft(draft: TaskDraft) {
    try { localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify(draft)); } catch { /* armazenamento cheio */ }
    this.taskDraftTick.update(n => n + 1);
  }

  clearTaskDraft() {
    try { localStorage.removeItem(TASK_DRAFT_KEY); } catch { /* ignore */ }
    this.taskDraftTick.update(n => n + 1);
  }
  askPersonalWork() { this.openPersonalWork.set(true); }
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
    try { localStorage.setItem(PALETTE_KEY, next); } catch {}
  }

  togglePalette() {
    this.setPalette(this.palette() === 'wtorre' ? 'nubank-parque' : 'wtorre');
  }

}
