export function digitsDocumento(raw: string | null | undefined): string {
  return String(raw || '').replace(/\D/g, '').slice(0, 14);
}

export function isDocumentoValido(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
}

export function formatDocumento(raw: string | null | undefined): string {
  const d = digitsDocumento(raw);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function maskDocumento(digits: string): string {
  if (digits.length === 14) {
    return `**.${digits.slice(2, 5)}.***/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length !== 11) return '';
  return `***.${digits.slice(3, 6)}.**${digits[8]}-${digits.slice(9)}`;
}

export function normalizeRg(raw: string | null | undefined): string {
  const compact = String(raw || '')
    .toUpperCase()
    .replace(/[\s.\-/]/g, '');
  if (/^\d{5,10}X$/.test(compact) || /^\d{5,10}$/.test(compact)) return compact;
  return '';
}

export function isRgValido(raw: string | null | undefined): boolean {
  return !!normalizeRg(raw);
}

export function maskRg(raw: string | null | undefined): string {
  const n = normalizeRg(raw);
  if (!n) return '';
  return `*****-${n.slice(-1)}`;
}
