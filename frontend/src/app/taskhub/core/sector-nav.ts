import { AuthService } from './auth.service';
import { DataService } from './data.service';
import { Team } from './models';

export interface SectorNavGroup {
  id: number;
  name: string;
  color: string;
  canDashboard: boolean;
  canCreate: boolean;
  teams: Team[];
}

export const KANBAN_TEAM_KEY = 'taskhub.kanban.team';

export function readKanbanTeam(): number | null {
  try { const v = Number(localStorage.getItem(KANBAN_TEAM_KEY)); return v > 0 ? v : null; } catch { return null; }
}

export function saveKanbanTeam(id: number) {
  try { localStorage.setItem(KANBAN_TEAM_KEY, String(id)); } catch { /* navegador sem armazenamento */ }
}

const PAINEL_KEY = 'taskhub.painel.last';
export type PainelKind = 'setor' | 'equipe';

export function readPainelLast(): { kind: PainelKind; id: number } | null {
  try {
    const m = (localStorage.getItem(PAINEL_KEY) || '').match(/^(setor|equipe):(\d+)$/);
    return m ? { kind: m[1] as PainelKind, id: Number(m[2]) } : null;
  } catch { return null; }
}

export function savePainelLast(kind: PainelKind, id: number) {
  try { localStorage.setItem(PAINEL_KEY, `${kind}:${id}`); } catch { /* navegador sem armazenamento */ }
}

// Setor > equipes: quem é da equipe vê as suas; gestor vê as que acompanha.
export function buildSectorNav(data: DataService, auth: AuthService): SectorNavGroup[] {
  const sectors = data.sectors();
  const creatable = new Set(data.creatableSectors());
  const admin = auth.isAdmin();
  const bySector = new Map<number, Team[]>();
  for (const team of data.teams()) {
    if (!team.sector_id) continue;
    if (admin && !team.is_member && !team.can_dashboard) continue;
    const list = bySector.get(team.sector_id) ?? [];
    list.push(team);
    bySector.set(team.sector_id, list);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt');
  const ids = new Set<number>([...bySector.keys(), ...creatable]);
  for (const s of sectors) if (s.can_panel && !admin) ids.add(s.id);
  return [...ids].map(id => {
    const sector = sectors.find(s => s.id === id);
    const teams = (bySector.get(id) ?? []).slice().sort(byName);
    return {
      id,
      name: sector?.name || teams[0]?.sector_name || 'Setor',
      color: sector?.color || teams[0]?.color || '#94a3b8',
      canDashboard: !!sector?.can_panel,
      canCreate: creatable.has(id),
      teams,
    };
  }).sort(byName);
}
