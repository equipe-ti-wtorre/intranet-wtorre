export function pesquisasLinkPublico(token: string | null | undefined): string {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/f/${token}`;
}
