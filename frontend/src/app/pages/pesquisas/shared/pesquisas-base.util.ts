export function normHeader(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isDocHeader(raw: string): boolean {
  return ['cpf', 'cnpj', 'cpf cnpj', 'documento', 'doc'].includes(normHeader(raw));
}

export function isEmailHeader(raw: string): boolean {
  return ['email', 'e mail', 'mail', 'correio'].includes(normHeader(raw));
}

export function isNomeHeader(raw: string): boolean {
  return ['nome', 'nome completo', 'name', 'razao social', 'razão social'].includes(normHeader(raw));
}

export function isChaveHeader(raw: string): boolean {
  return isDocHeader(raw) || isEmailHeader(raw);
}

export interface ExtractedGuest {
  nome: string;
  cpf: string;
  email: string;
}

export interface ExtractGuestsResult {
  guests: ExtractedGuest[];
  ignoradas: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extractGuestsFromRows(rows: Record<string, unknown>[] | null | undefined): ExtractGuestsResult {
  const guests: ExtractedGuest[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    let nome = '';
    let cpf = '';
    let email = '';
    for (const [k, v] of Object.entries(row)) {
      const cell = String(v ?? '').trim();
      if (!cell) continue;
      if (!nome && isNomeHeader(k)) nome = cell.slice(0, 200);
      if (!cpf && isDocHeader(k)) {
        const digits = cell.replace(/\D/g, '');
        if (digits.length === 11 || digits.length === 14) cpf = digits;
      }
      if (!email && isEmailHeader(k)) {
        const e = cell.toLowerCase();
        if (EMAIL_RE.test(e)) email = e.slice(0, 200);
      }
    }
    if (!cpf || !email || seen.has(cpf)) continue;
    seen.add(cpf);
    guests.push({ nome, cpf, email });
  }
  return { guests, ignoradas: Math.max(0, list.length - guests.length) };
}

export function lookupPronto(valor: string): boolean {
  const digits = String(valor || '').replace(/\D/g, '');
  if (digits.length === 11 || digits.length === 14) return true;
  const email = String(valor || '').trim();
  return email.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function rowToCampos(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[k] = String(v ?? '');
  }
  return out;
}

export function lookupLocal(
  rows: Record<string, unknown>[],
  valor: string
): Record<string, string> | null {
  const digits = String(valor || '').replace(/\D/g, '');
  const email = String(valor || '').trim().toLowerCase();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      const cell = String(v ?? '').trim();
      if (isDocHeader(k) && digits && (digits.length === 11 || digits.length === 14)) {
        if (cell.replace(/\D/g, '') === digits) return rowToCampos(row);
      }
      if (isEmailHeader(k) && email.includes('@') && cell.toLowerCase() === email) {
        return rowToCampos(row);
      }
    }
  }
  return null;
}

export function matchCampos(
  campos: Record<string, string>,
  perguntas: { id?: number | null; texto: string; blocoTipo?: string | null }[],
  skipId?: number | null
): Record<number, string> {
  const byNorm = new Map<string, string>();
  for (const [k, v] of Object.entries(campos || {})) {
    byNorm.set(normHeader(k), String(v ?? ''));
  }
  const out: Record<number, string> = {};
  for (const p of perguntas) {
    if (!p.id || p.blocoTipo === 'texto' || p.blocoTipo === 'anexo') continue;
    if (skipId != null && p.id === skipId) continue;
    const val = byNorm.get(normHeader(p.texto));
    if (val != null && val !== '') out[p.id] = val;
  }
  return out;
}
