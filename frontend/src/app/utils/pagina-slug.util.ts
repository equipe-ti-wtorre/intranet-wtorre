const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function tituloParaSlug(titulo: string): string {
  return titulo
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

export function slugValido(slug: string): boolean {
  const s = slug.trim();
  return s.length > 0 && s.length <= 160 && SLUG_REGEX.test(s);
}
