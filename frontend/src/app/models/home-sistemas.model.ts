export interface HomeSistemaItem {
  id: string;
  nome: string;
  subtitulo: string;
  icon: string;
  url: string | null;
  abrirNovaAba: boolean;
  ordem: number;
  ativo: boolean;
}

export interface HomeSistemasConfig {
  tag: string;
  titulo: string;
  linkTodos: string | null;
  linkTodosNovaAba: boolean;
  itens: HomeSistemaItem[];
}

export const HOME_SISTEMAS_DEFAULTS: HomeSistemasConfig = {
  tag: 'Acesso rápido',
  titulo: 'Sistemas Corporativos',
  linkTodos: null,
  linkTodosNovaAba: false,
  itens: [],
};
