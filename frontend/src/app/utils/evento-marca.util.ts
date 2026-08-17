import { Evento } from '../models/evento.model';

export type EventoMarca = 'wtorre' | 'nubank' | 'base' | 'novo' | 'neutro';

const MARCA_LABEL: Record<EventoMarca, string> = {
  wtorre: 'WTorre',
  nubank: 'Nubank Parque',
  base: 'Base Coworking',
  novo: 'Novo Anhangabaú',
  neutro: 'Outros',
};

const MARCA_CSS: Record<EventoMarca, string> = {
  wtorre: 'wt',
  nubank: 'nb',
  base: 'bs',
  novo: 'an',
  neutro: 'wt',
};

export function fonteParaMarca(fonteCodigo: string, fonteNome?: string): EventoMarca {
  const codigo = String(fonteCodigo || '').toLowerCase();
  const nome = String(fonteNome || '').toLowerCase();

  if (codigo.includes('nubank') || nome.includes('nubank')) return 'nubank';
  if (codigo.includes('anhangabau') || codigo.includes('anhanga') || nome.includes('anhangaba')) {
    return 'novo';
  }
  if (codigo.includes('base') || nome.includes('base')) return 'base';
  if (codigo.includes('wtorre') || nome.includes('wtorre')) return 'wtorre';

  return 'neutro';
}

export function eventoMarca(ev: Pick<Evento, 'fonteCodigo' | 'fonteNome'>): EventoMarca {
  return fonteParaMarca(ev.fonteCodigo, ev.fonteNome);
}

export function marcaLabel(marca: EventoMarca): string {
  return MARCA_LABEL[marca];
}

export function marcaCssClass(marca: EventoMarca): string {
  return MARCA_CSS[marca];
}

export function fonteExibicao(ev: Pick<Evento, 'fonteNome' | 'fonteCodigo'>): string {
  const nome = String(ev.fonteNome || '').trim();
  if (nome) return nome.replace(/\s*—\s*.*$/, '').trim() || nome;
  return ev.fonteCodigo;
}
