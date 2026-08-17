import { MenuItem } from '../../models/menu.model';

export function temFilhos(item: MenuItem): boolean {
  return (item.children?.length ?? 0) > 0;
}

export function isInterno(url: string | null): boolean {
  return !!url && url.startsWith('/');
}

export function isExterno(url: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}

export function isPlaceholder(url: string | null): boolean {
  return !url || url === '#';
}
