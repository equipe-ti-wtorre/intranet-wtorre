/** Extrai a chave numérica do andar para comparação (ex.: "3o", "3º" → "3"). */
export function normalizarAndarChave(andar: string | null | undefined): string {
  const s = String(andar ?? '').trim();
  const m = s.match(/^(\d+)[oOº°]?$/);
  if (m) return m[1];
  return s.replace(/[º°oO]$/i, '');
}

/** Formata andar para exibição (ex.: "3", "3o" → "3º"). */
export function formatarAndar(andar: string | null | undefined): string {
  const s = String(andar ?? '').trim();
  if (!s) return '—';
  const m = s.match(/^(\d+)[oOº°]?$/);
  if (m) return `${m[1]}º`;
  return s;
}
