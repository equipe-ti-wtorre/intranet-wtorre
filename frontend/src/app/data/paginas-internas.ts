/**
 * Páginas internas navegáveis da intranet (rotas de usuário).
 * Entidades de documentos e treinamentos são aceitas dinamicamente via isPaginaInternaConhecida.
 */
export interface PaginaInterna {
  path: string;
  label: string;
}

const DOCUMENTOS_PATH_REGEX = /^\/documentos(\/[a-z0-9-]+)?$/;
export const TREINAMENTOS_PATH_REGEX = /^\/treinamentos(\/[a-z0-9-]+)?$/;
export const PAGINA_PUBLICA_REGEX = /^\/p\/[a-z0-9-]+$/;

export const PAGINAS_INTERNAS: PaginaInterna[] = [
  { path: '/inicio', label: 'Início' },
  { path: '/documentos', label: 'Documentos' },
  { path: '/ramais', label: 'Ramais' },
  { path: '/aniversariantes', label: 'Aniversariantes' },
  { path: '/documentos/wtorre?cat=treinamentos', label: 'Treinamentos' },
  { path: '/assinaturas', label: 'Assinaturas de E-mail' },
  { path: '/plaquinhas-camarote', label: 'Plaquinhas Camarote' },
  { path: '/ferramentas/pdf', label: 'Ferramentas de PDF' },
  { path: '/solicitacao-colaborador', label: 'Solicitação de Colaborador' },
  { path: '/bi/camarotes', label: 'BI / Camarotes' },
  { path: '/dashboards', label: 'Dashboards' },
  { path: '/agendas', label: 'Agendas / Eventos' },
  { path: '/salas', label: 'Reservar sala' },
  { path: '/followup-suprimentos', label: 'Follow-up de Suprimentos' },
];

export function paginasDocumentosFromPaginas(
  paginas: { slug: string; nome: string }[] = []
): PaginaInterna[] {
  return paginas.map((p) => ({
    path: `/documentos/${p.slug}`,
    label: `Documentos / ${p.nome}`,
  }));
}

export function paginasTreinamentosFromPaginas(
  paginas: { slug: string; nome: string }[] = []
): PaginaInterna[] {
  return paginas.map((p) => ({
    path: `/documentos/${p.slug}?cat=treinamentos`,
    label: `Treinamentos / ${p.nome}`,
  }));
}

/** @deprecated Use paginasDocumentosFromPaginas */
export function paginasDocumentosFromCategorias(categoriasRaiz: { slug: string; nome: string }[]): PaginaInterna[] {
  return paginasDocumentosFromPaginas(categoriasRaiz.map((c) => ({ slug: c.slug, nome: c.nome })));
}

export function paginasPublicasFromApi(
  paginas: { slug: string; titulo: string }[] = []
): PaginaInterna[] {
  return paginas.map((p) => ({
    path: `/p/${p.slug}`,
    label: p.titulo,
  }));
}

export function buildPaginasInternasLista(
  paginasDocumentos: { slug: string; nome: string }[] = [],
  paginasPublicas: { slug: string; titulo: string }[] = []
): PaginaInterna[] {
  const docPaginas = paginasDocumentosFromPaginas(paginasDocumentos).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR')
  );
  const treinPaginas = paginasTreinamentosFromPaginas(paginasDocumentos).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR')
  );
  const result: PaginaInterna[] = [];

  for (const pagina of PAGINAS_INTERNAS) {
    result.push(pagina);
    if (pagina.path === '/documentos') {
      result.push(...docPaginas);
    }
    if (pagina.path === '/documentos/wtorre?cat=treinamentos') {
      result.push(...treinPaginas);
    }
  }

  const cmsPaginas = paginasPublicasFromApi(paginasPublicas).sort((a, b) =>
    a.label.localeCompare(b.label, 'pt-BR')
  );
  result.push(...cmsPaginas);

  return result;
}

export function findPaginaInterna(
  path: string,
  paginasDocumentos: { slug: string; nome: string }[] = [],
  paginasPublicas: { slug: string; titulo: string }[] = []
): PaginaInterna | undefined {
  const lista = buildPaginasInternasLista(paginasDocumentos, paginasPublicas);
  const found = lista.find((p) => p.path === path);
  if (found) return found;

  if (DOCUMENTOS_PATH_REGEX.test(path) && path !== '/documentos') {
    const pagina = paginasDocumentos.find((p) => `/documentos/${p.slug}` === path);
    const slug = path.replace('/documentos/', '');
    return { path, label: pagina ? `Documentos / ${pagina.nome}` : `Documentos / ${slug}` };
  }

  if (TREINAMENTOS_PATH_REGEX.test(path) && path !== '/treinamentos') {
    const slug = path.replace('/treinamentos/', '');
    const pagina = paginasDocumentos.find((p) => p.slug === slug);
    return {
      path: `/documentos/${slug}?cat=treinamentos`,
      label: pagina ? `Treinamentos / ${pagina.nome}` : `Treinamentos / ${slug}`,
    };
  }

  const docTreinMatch = path.match(/^\/documentos\/([a-z0-9-]+)\?cat=treinamentos$/);
  if (docTreinMatch) {
    const slug = docTreinMatch[1];
    const pagina = paginasDocumentos.find((p) => p.slug === slug);
    return { path, label: pagina ? `Treinamentos / ${pagina.nome}` : `Treinamentos / ${slug}` };
  }

  if (PAGINA_PUBLICA_REGEX.test(path)) {
    const slug = path.replace('/p/', '');
    const pagina = paginasPublicas.find((p) => p.slug === slug);
    return { path, label: pagina?.titulo ?? `Página / ${slug}` };
  }

  return undefined;
}

export function isPaginaInternaConhecida(path: string): boolean {
  const pathOnly = path.split('?')[0];
  return (
    PAGINAS_INTERNAS.some((p) => p.path === path) ||
    DOCUMENTOS_PATH_REGEX.test(pathOnly) ||
    TREINAMENTOS_PATH_REGEX.test(pathOnly) ||
    PAGINA_PUBLICA_REGEX.test(pathOnly) ||
    /^\/documentos\/[a-z0-9-]+\?cat=treinamentos/.test(path)
  );
}
