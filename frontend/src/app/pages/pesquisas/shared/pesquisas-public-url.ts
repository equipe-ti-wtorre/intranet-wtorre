export function pesquisasLinkPublico(token: string | null | undefined): string {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/f/${token}`;
}

export function pesquisasResultadosPath(item: {
  slug?: string | null;
  id: number;
}): (string | number)[] {
  return ['/pesquisas/formulario', item.slug || item.id, 'resultados'];
}
