import { SalasAdminTab, TAB_LOGO_ASSETS } from '../../../models/salas-config.model';

export function resolveTabLogoUrl(
  tab: Pick<SalasAdminTab, 'id' | 'logoKey'> & { logoFile?: string | null },
  logoApiUrl: (file: string) => string
): string | null {
  if (tab.logoFile) {
    return logoApiUrl(tab.logoFile);
  }
  return TAB_LOGO_ASSETS[tab.logoKey] ?? TAB_LOGO_ASSETS[tab.id] ?? null;
}

export function isBuiltinLogoPreview(url: string | null): boolean {
  return !!url && url.startsWith('assets/logos/');
}
