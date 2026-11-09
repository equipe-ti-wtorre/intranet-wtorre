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

// Individual: as mesmas visões do Corporativo, num quadro só da pessoa.
export type PersonalView = 'kanban' | 'quadro' | 'linha';

export const PERSONAL_VIEWS: Record<PersonalView, { path: string; label: string; icon: string }> = {
  kanban: { path: 'individual/kanban', label: 'Kanban', icon: 'board' },
  quadro: { path: 'individual/projetos', label: 'Projetos', icon: 'folder' },
  linha: { path: 'individual/linha-do-tempo', label: 'Linha do tempo', icon: 'calendar' },
};
