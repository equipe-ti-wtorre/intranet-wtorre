import { signal } from '@angular/core';
import { ApiService, errorMessage } from '../core/api.service';
import { ToastService } from '../core/toast.service';
import { Phase } from '../core/models';

export const PHASE_COLORS = ['#8b93a1', '#3b82f6', '#a78bfa', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#84cc16'];

// Edição das colunas de fase (lista da equipe), usada no Kanban de projetos e no de tarefas.
// Toda edição envia a lista inteira e vale para todos os projetos da equipe.
export class PhaseColumns {
  colMenu = signal<number | null>(null);
  menuPos = signal<{ top: number; left: number } | null>(null);
  renaming = signal<number | null>(null);
  colors = PHASE_COLORS;

  constructor(private o: {
    api: ApiService;
    toast: ToastService;
    phases: () => Phase[];
    teamId: () => number | null;
    saved: (phases: Phase[]) => void;
  }) {}

  closeMenu() { this.colMenu.set(null); this.menuPos.set(null); }
  toggleMenu(id: number, ev: Event) {
    ev.stopPropagation();
    if (this.colMenu() === id) { this.closeMenu(); return; }
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const w = 248;
    const h = 380;
    let left = r.right - w;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) {
      const up = r.top - h - 4;
      top = up >= 8 ? up : Math.max(8, window.innerHeight - h - 8);
    }
    this.menuPos.set({ top, left });
    this.colMenu.set(id);
  }
  startRename(ph: Phase) { this.closeMenu(); this.renaming.set(ph.id); }
  finishRename(ph: Phase, name: string) {
    if (this.renaming() !== ph.id) return;
    this.renaming.set(null);
    const n = name.trim();
    if (n === ph.name) return;
    if (n.length < 2) { this.o.toast.error('O nome da fase precisa ter pelo menos 2 letras.'); return; }
    this.save(this.o.phases().map(p => (p.id === ph.id ? { ...p, name: n } : p)));
  }
  paint(ph: Phase, color: string) {
    this.closeMenu();
    this.save(this.o.phases().map(p => (p.id === ph.id ? { ...p, color } : p)));
  }
  setDuration(ph: Phase, raw: string | number) {
    const n = Math.round(Number(raw));
    const days = Number.isFinite(n) ? Math.min(365, Math.max(0, n)) : 0;
    if (days === (ph.duration_days ?? 5)) return;
    this.save(this.o.phases().map(p => (p.id === ph.id ? { ...p, duration_days: days } : p)));
  }
  move(ph: Phase, dir: -1 | 1) {
    this.closeMenu();
    const list = [...this.o.phases()]; const i = list.findIndex(p => p.id === ph.id);
    if (i < 0 || !list[i + dir]) return;
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    this.save(list);
  }
  remove(ph: Phase) {
    this.closeMenu();
    if (!confirm(`Excluir a fase ${ph.name}?\nEla some do Kanban de todos os projetos da equipe. As tarefas que estavam nela ficam sem fase.`)) return;
    this.save(this.o.phases().filter(p => p.id !== ph.id));
  }
  add() {
    const names = new Set(this.o.phases().map(p => p.name.toLowerCase()));
    let name = 'Nova fase'; let n = 2;
    while (names.has(name.toLowerCase())) name = `Nova fase ${n++}`;
    this.save([...this.o.phases(), { name, color: '#8b93a1', duration_days: 5 }], saved => {
      const created = saved.find(p => p.name === name);
      if (created) this.renaming.set(created.id);
    });
  }
  private payload(list: { id?: number; name: string; color: string; duration_days?: number }[]) {
    return list.map(f => ({
      ...(f.id ? { id: f.id } : {}),
      name: f.name,
      color: f.color,
      duration_days: f.duration_days ?? 5,
    }));
  }
  private save(list: { id?: number; name: string; color: string; duration_days?: number }[], after?: (saved: Phase[]) => void) {
    const tid = this.o.teamId(); if (!tid) return;
    this.o.api.saveTeamPhases(tid, this.payload(list)).subscribe({
      next: r => { this.o.saved(r.phases); after?.(r.phases); },
      error: e => this.o.toast.error(errorMessage(e, 'Não foi possível salvar as fases.')),
    });
  }
}
