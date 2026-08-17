export interface Usuario {
  id: number;
  username: string;
  nome_completo: string;
  email: string;
  perfil: 'ADMIN' | 'USER';
  is_ad_user: boolean;
  ativo?: boolean;
  modulos?: string[];
  /** Compatibilidade com templates que usam `nome` */
  nome?: string;
}

export interface LoginResposta {
  auth: boolean;
  accessToken: string;
  refreshToken: string;
  token: string;
  usuario?: Usuario;
  /** Campo enviado pela API Express */
  user?: Usuario;
}

export interface MsalConfigResposta {
  clientId: string;
  authority: string;
  redirectUris: string[];
  redirectUri: string;
  configured?: boolean;
}

export interface AzureTenant {
  id: number;
  nome: string;
  azure_tenant_id: string;
  client_id: string;
  has_secret: boolean;
  ativo: boolean;
  eh_principal: boolean;
}
