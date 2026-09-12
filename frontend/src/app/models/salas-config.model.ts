export interface SalasLocalidadeConfig {
  label: string;
  localidade: string;
}

export interface SalasIntegracaoConfig {
  ativo: boolean;
  api_base_url: string;
  localidade_padrao: string;
  localidades: SalasLocalidadeConfig[];
  atualizado_em?: string | null;
}

export interface SalvarSalasIntegracaoBody {
  ativo: boolean;
  api_base_url: string;
  localidade_padrao: string;
}

export interface SalasTesteConexaoResponse {
  ok: boolean;
  mensagem: string;
}

export interface SalasAdminTab {
  id: string;
  label: string;
  domains: string[];
  logoKey: string;
  logoFile?: string | null;
}

export interface SalasAdminUiConfig {
  tabs: SalasAdminTab[];
  domainToApiLocalidade: Record<string, string>;
  roomTabOverrides: Record<string, string>;
  roomOrderByTab: Record<string, string[]>;
  roomDisplayNames: Record<string, string>;
}

export interface SalasAdminUiConfigResponse {
  config: SalasAdminUiConfig;
}

export interface SalasAdminRoom {
  name: string;
  email: string;
  apiLocalidade: string;
  tabId: string | null;
  tabSource: 'override' | 'domain' | 'unassigned';
}

export interface SalasAdminRoomsResponse {
  rooms: SalasAdminRoom[];
}

export const BUILTIN_LOGO_OPTIONS = [
  { key: 'nubankparque', label: 'Allianz Parque' },
  { key: 'allianzparque', label: 'Allianz Parque (alt)' },
  { key: 'wtorre', label: 'WTorre' },
  { key: 'novoanhangabau', label: 'Novo Anhangabaú' },
];

export const TAB_LOGO_ASSETS: Record<string, string> = {
  nubankparque: 'assets/logos/allianz-parque.svg',
  allianzparque: 'assets/logos/allianz-parque.svg',
  wtorre: 'assets/logos/wtorre.svg',
  novoanhangabau: 'assets/logos/novo-anhangabau.svg',
};

export interface SalasRegisteredLogo {
  name: string;
  url: string;
}

export interface SalasRegisteredLogosResponse {
  files: SalasRegisteredLogo[];
}
