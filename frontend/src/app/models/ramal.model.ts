export type RamalPerfil = 'ADMIN' | 'USER';

export interface RamalUsuario {
  id: number;
  username: string;
  nome: string;
  perfil: RamalPerfil;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface RamalLoginResposta {
  auth: boolean;
  accessToken: string;
  refreshToken: string;
  token: string;
  usuario: RamalUsuario;
  user: RamalUsuario;
}
