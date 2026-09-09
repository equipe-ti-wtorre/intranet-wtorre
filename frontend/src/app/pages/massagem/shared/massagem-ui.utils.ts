export function formatData(
  iso: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }
): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', options);
}

export function formatDataCurta(iso: string): string {
  return formatData(iso, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function faixaHorario(ev: {
  horarioInicio?: string | null;
  horarioFim?: string | null;
  horarios?: string[];
}): string {
  const hrs = ev.horarios || [];
  const inicio = ev.horarioInicio || hrs[0] || '';
  const fim = ev.horarioFim || (hrs.length ? hrs[hrs.length - 1] : '');
  if (!inicio && !fim) return '';
  if (!inicio) return fim;
  if (!fim || inicio === fim) return inicio;
  return `${inicio} – ${fim}`;
}

export function ocupacaoBadgeClass(pct: number): string {
  if (pct >= 80) return 'badge-danger';
  if (pct >= 50) return 'badge-warn';
  return 'badge-ok';
}

export function ocupacaoBarColor(pct: number): string {
  if (pct >= 80) return '#A32D2D';
  if (pct >= 50) return '#BA7517';
  return '#3B6D11';
}

export function statusBadgeClass(status: string): string {
  if (status === 'presente') return 'badge-ok';
  if (status === 'falta') return 'badge-danger';
  if (status === 'ok') return 'badge-info';
  return 'badge-warn';
}

export function statusLabel(status: string): string {
  if (status === 'presente') return 'Presente';
  if (status === 'falta') return 'Falta';
  if (status === 'ok') return 'Confirmado';
  return 'Aguardando';
}

export interface CorEmpresa {
  accent: string;
  bg: string;
  shadow: string;
}

const FALLBACK_COR: CorEmpresa = {
  accent: '#6B7280',
  bg: 'rgba(107, 114, 128, 0.08)',
  shadow: 'rgba(0, 0, 0, 0.08)',
};

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return `rgba(107, 114, 128, ${alpha})`;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function corEmpresaFromHex(hex?: string): CorEmpresa {
  if (!hex) return FALLBACK_COR;
  return {
    accent: hex,
    bg: hexToRgba(hex, 0.06),
    shadow: hexToRgba(hex, 0.18),
  };
}
