import { RustdeskEstado } from '../../../models/rustdesk.model';

const TZ = 'America/Sao_Paulo';

export function formatDateTimeBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

export function formatUptime(segundos: number | null | undefined): string {
  if (segundos == null || !Number.isFinite(segundos)) return '—';
  const s = Math.max(0, Math.floor(segundos));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

export function formatEgressGb(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function formatDefasagem(segundos: number | null | undefined): string {
  if (segundos == null || !Number.isFinite(segundos)) return '—';
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h`;
}

export function labelEstado(estado: RustdeskEstado | string | null | undefined): string {
  switch (estado) {
    case 'sem_servico':
      return 'Sem serviço';
    case 'nunca_registrou':
      return 'Nunca registrou';
    case 'no_servidor':
      return 'No servidor';
    case 'ausente_hbbs':
      return 'Fora do hbbs';
    default:
      return '—';
  }
}

export function labelAcesso(modo: string | null | undefined): string {
  if (modo === 'unattended') return 'Senha fixa';
  if (modo === 'attended') return 'Aprovação';
  if (modo === 'ambos' || modo === 'senha_ou_aprovacao') return 'Senha ou aprovação';
  return '';
}

export function toneAcesso(modo: string | null | undefined): 'fixa' | 'aprov' | 'misto' | '' {
  if (modo === 'unattended') return 'fixa';
  if (modo === 'attended') return 'aprov';
  if (modo === 'ambos' || modo === 'senha_ou_aprovacao') return 'misto';
  return '';
}

export function subtituloMaquina(d: { tipo?: string | null; setor?: string | null }): string {
  const tipo = (d.tipo || '').trim();
  const setor = (d.setor || '').trim();
  if (tipo && setor) return `${tipo} · ${setor}`;
  return tipo || setor || '';
}

function parseVer(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[^\d]+/)
    .filter(Boolean)
    .map((n) => Number(n) || 0);
}

export function compararVersao(a: string, b: string): number {
  const pa = parseVer(a);
  const pb = parseVer(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function versaoMaisAlta(versos: (string | null | undefined)[]): string | null {
  const limpos = versos.map((v) => (v || '').trim()).filter(Boolean);
  if (!limpos.length) return null;
  return limpos.reduce((acc, v) => (compararVersao(v, acc) > 0 ? v : acc));
}
