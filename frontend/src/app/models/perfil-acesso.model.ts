export interface ModuloAdmin {
  codigo: string;
  nome: string;
  ordem: number;
}

export interface PerfilAcesso {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criado_em?: string;
  modulos: string[];
  usuarios_vinculados?: number;
}

export interface PerfilResumo {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export interface UsuarioAcesso {
  id: number;
  username: string;
  nome_completo: string;
  email: string;
  departamento: string | null;
  perfil: 'ADMIN' | 'USER';
  microsoft_id: string | null;
  is_ad_user: boolean;
  ativo: boolean;
  perfis: PerfilResumo[];
  modulos_extra: string[];
  modulos: string[];
}

export interface ColaboradorBusca {
  id: number;
  ad_id?: string;
  nome: string;
  email: string | null;
  departamento: string | null;
  empresa: string | null;
  ja_cadastrado: boolean;
  usuario_id: number | null;
}
