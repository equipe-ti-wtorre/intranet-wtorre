const MESES_CURTOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function extrairHora(dataTexto: string | null | undefined): string | null {
  const match = String(dataTexto || '').match(/·\s*(\d{1,2}:\d{2})/);
  if (match) return match[1];
  const match2 = String(dataTexto || '').match(/(\d{1,2})h(?:\s|$)/i);
  if (match2) return `${match2[1]}h`;
  return null;
}

export function diaMesAbrev(dataIso: string | null | undefined): { dia: string; mes: string } {
  if (!dataIso) return { dia: '--', mes: '---' };
  const [, m, d] = dataIso.split('-');
  const monthIdx = Number(m) - 1;
  return {
    dia: String(Number(d)),
    mes: MESES_CURTOS[monthIdx] || '---',
  };
}

export function formatarDiaSelecionado(dataIso: string): string {
  const [y, m, d] = dataIso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = DIAS_SEMANA[date.getDay()];
  const mes = MESES_LONGOS[m - 1] || '';
  return `${dow}, ${d} de ${mes}`;
}

export function formatarMesAno(year: number, month: number): string {
  const mes = MESES_LONGOS[month] || '';
  const cap = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${cap} ${year}`;
}

export function hojeIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isoFromParts(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function parseIso(dataIso: string): { year: number; month: number; day: number } {
  const [y, m, d] = dataIso.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

/** Hoje + n dias (inclusive hoje quando n=0). */
export function isoDaquiNDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Janela dos próximos 30 dias: hoje até hoje+29. */
export function intervaloProximos30Dias(): { de: string; ate: string } {
  return { de: hojeIso(), ate: isoDaquiNDias(29) };
}

const MESES_CURTOS_LABEL = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

export function formatarIntervaloCurto(de: string, ate: string): string {
  const p1 = parseIso(de);
  const p2 = parseIso(ate);
  const m1 = MESES_CURTOS_LABEL[p1.month] || '';
  const m2 = MESES_CURTOS_LABEL[p2.month] || '';
  if (p1.month === p2.month && p1.year === p2.year) {
    return `${p1.day} – ${p2.day} de ${m2}`;
  }
  return `${p1.day} de ${m1} – ${p2.day} de ${m2}`;
}
