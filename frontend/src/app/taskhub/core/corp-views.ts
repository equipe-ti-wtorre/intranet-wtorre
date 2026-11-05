export type CorpView = 'kanban' | 'quadro' | 'linha' | 'painel';

export const CORP_VIEWS: Record<CorpView, { path: string; label: string; icon: string; hint: string }> = {
  kanban: { path: 'kanban', label: 'Kanban', icon: 'board', hint: 'Escolha a equipe para ver os projetos no quadro.' },
  quadro: { path: 'quadro', label: 'Projetos', icon: 'folder', hint: 'Escolha a equipe para ver a lista de projetos.' },
  linha: { path: 'linha-do-tempo', label: 'Linha do tempo', icon: 'calendar', hint: 'Escolha a equipe para ver a régua dos projetos.' },
  painel: { path: 'painel', label: 'Painel', icon: 'chart', hint: 'Abra o painel de um setor ou de uma equipe.' },
};

export function corpViewPath(view: CorpView): string {
  return `/ti/taskhub/${CORP_VIEWS[view].path}`;
}

export function corpTeamLink(view: CorpView, teamId: number): string[] {
  return ['/ti/taskhub', CORP_VIEWS[view].path, 'equipes', String(teamId)];
}

// Individual: as mesmas visões, escolhendo o projeto individual em vez da equipe.
export type PersonalView = 'kanban' | 'quadro' | 'linha';

export const PERSONAL_VIEWS: Record<PersonalView, { path: string; label: string; icon: string }> = {
  kanban: { path: 'individual/kanban', label: 'Kanban', icon: 'board' },
  quadro: { path: 'individual/projetos', label: 'Projetos', icon: 'folder' },
  linha: { path: 'individual/linha-do-tempo', label: 'Linha do tempo', icon: 'calendar' },
};

export function personalViewPath(view: PersonalView): string {
  return `/ti/taskhub/${PERSONAL_VIEWS[view].path}`;
}

export function personalProjectLink(view: PersonalView, projectId: number): string[] {
  return ['/ti/taskhub', ...PERSONAL_VIEWS[view].path.split('/'), String(projectId)];
}

const PERSONAL_KEY = 'taskhub.individual.project';

export function readPersonalProject(): number | null {
  try { const v = Number(localStorage.getItem(PERSONAL_KEY)); return v > 0 ? v : null; } catch { return null; }
}

export function savePersonalProject(id: number) {
  try { localStorage.setItem(PERSONAL_KEY, String(id)); } catch { /* navegador sem armazenamento */ }
}
