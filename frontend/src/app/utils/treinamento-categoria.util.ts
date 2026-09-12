const CONTAINER_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export const THUMB_FALLBACK_GRAD = 'linear-gradient(135deg,#2a3348,#0d1424)';

export function formatarDuracao(seg?: number | null): string {
  if (seg == null || seg < 0) return '—';
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parseDuracaoInput(val: string): number | null {
  const t = val.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^(\d{1,3}):(\d{2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return null;
}

export function validarNomeContainer(nome: string): string | null {
  const trimmed = nome.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 63) {
    return 'Nome deve ter entre 3 e 63 caracteres.';
  }
  if (!CONTAINER_RE.test(trimmed) || trimmed.includes('--')) {
    return 'Use minúsculas, números e hífens; comece e termine com letra ou número; sem hífens duplos.';
  }
  return null;
}

export function mapTreinamentoApi(row: Record<string, unknown>): import('../models/treinamento.model').Treinamento {
  const setorRaw = row['setor'] as Record<string, unknown> | null | undefined;
  const setor =
    setorRaw && setorRaw['id'] != null
      ? {
          id: setorRaw['id'] as number,
          nome: setorRaw['nome'] as string,
          slug: setorRaw['slug'] as string,
          cor: (setorRaw['cor'] as string) ?? null,
        }
      : row['setor_id'] != null
        ? {
            id: row['setor_id'] as number,
            nome: (row['setor_nome'] as string) ?? '',
            slug: (row['setor_slug'] as string) ?? '',
            cor: (row['setor_cor'] as string) ?? null,
          }
        : null;

  return {
    id: row['id'] as number,
    titulo: row['titulo'] as string,
    descricao: (row['descricao'] as string) ?? null,
    setorId: (row['setor_id'] as number) ?? setor?.id ?? null,
    setor,
    duracaoSeg: (row['duracao_seg'] as number) ?? null,
    destaque: !!(row['destaque'] as boolean),
    temThumb: !!(row['tem_thumb'] ?? row['temThumb'] ?? row['thumb_blob']),
    paginaId: row['pagina_id'] as number,
    paginaSlug: row['pagina_slug'] as string,
    paginaNome: (row['pagina_nome'] as string) ?? null,
    categoriaId: (row['categoria_id'] as number) ?? null,
    categoriaNome: (row['categoria_nome'] as string) ?? null,
    categoriaSlug: (row['categoria_slug'] as string) ?? null,
    categoriaIcone: (row['categoria_icone'] as string) ?? null,
    temCategoria: !!(row['tem_categoria'] as boolean) || row['categoria_id'] != null,
  };
}
