export interface AssinaturaPerfil {
  nome: string;
  cargo: string;
  emailPrincipal: string;
  aliases: string[];
  telefone: string;
  celular: string;
}

export type AssinaturaTipo = 'pessoal' | 'compartilhada';

export interface AssinaturaItem {
  id: string;
  email: string;
  tipo: AssinaturaTipo;
  nome?: string;
  cargo?: string;
  telefone?: string;
  celular?: string;
  /** Domínio usado para banner/estilo (caixas compartilhadas). */
  dominioEstilo?: string;
  selecionada: boolean;
}

export interface AssinaturaPayload {
  email: string;
  tipo: AssinaturaTipo;
  nome?: string;
  cargo?: string;
  telefone?: string;
  celular?: string;
  dominioEstilo?: string;
}

export interface GerarScriptPayload {
  assinaturas: AssinaturaPayload[];
  emailPadrao: string;
}

export interface DominioConfig {
  dominio: string;
  cor: string;
  entidade: string;
  banner: string;
  font: string;
  wNome: string;
  wResto: string;
  fontFace: boolean;
}
