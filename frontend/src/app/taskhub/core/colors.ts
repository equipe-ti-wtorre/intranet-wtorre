// Paletas de cor do TaskHub, num lugar só, com nome legível para leitores de tela.

// Cores de projeto/trabalho (modal de projeto, novo projeto, linha do tempo).
export const WORK_COLORS = ['#4c8dff', '#2fbf71', '#e11d48', '#f97316', '#a78bfa', '#14b8a6', '#c9a84c', '#ec4899'];
// Cores de setor (administração).
export const SECTOR_COLORS = ['#3b82f6', '#2fbf71', '#c9a84c', '#a78bfa', '#f97316', '#14b8a6', '#ec4899', '#e5534b'];
// Cores de fase do Kanban (a primeira é "sem cor").
export const PHASE_COLORS = ['#8b93a1', '#3b82f6', '#a78bfa', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#84cc16'];
// Cinza neutro de "sem fase / sem cor" quando precisa ser um hex (ex.: gerar SVG ou PPTX).
export const NEUTRAL_COLOR = '#8b93a1';

const NAMES: Record<string, string> = {
  '#4c8dff': 'Azul', '#3b82f6': 'Azul', '#2fbf71': 'Verde', '#22c55e': 'Verde', '#84cc16': 'Verde-limão',
  '#e11d48': 'Vermelho', '#ef4444': 'Vermelho', '#e5534b': 'Vermelho', '#f97316': 'Laranja', '#f59e0b': 'Âmbar',
  '#a78bfa': 'Lilás', '#14b8a6': 'Verde-água', '#c9a84c': 'Dourado', '#ec4899': 'Rosa', '#8b93a1': 'Cinza',
};

export function colorName(hex: string | null | undefined) {
  if (!hex) return 'Sem cor';
  return NAMES[hex.toLowerCase()] || `Cor ${hex}`;
}
