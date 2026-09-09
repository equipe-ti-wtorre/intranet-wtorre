export type TabletPerfil = 'ADMIN' | 'USER';

export interface TabletEmpresa {
  id: string;
  nm: string;
}

export interface TabletUsuario {
  id: number;
  username: string;
  nome: string;
  perfil: TabletPerfil;
  empresaId: number | null;
  empresaNm: string | null;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface TabletLoginResposta {
  auth: boolean;
  accessToken: string;
  refreshToken: string;
  token: string;
  usuario: TabletUsuario;
  user: TabletUsuario;
}
