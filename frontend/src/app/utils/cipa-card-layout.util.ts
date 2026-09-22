import {
  CipaEvento,
  CipaTextoAlinhamento,
  CipaTextoCampo,
  CipaTextoEstilo,
  CipaTextoEstilos,
} from '../models/cipa.model';

export const CIPA_ZOOM_DEFAULT = 100;
export const CIPA_TAMANHO_DEFAULT = 100;
export const CIPA_ALTURA_AUTO = 0;
export const CIPA_ALTURA_MIN = 120;
export const CIPA_ALTURA_MAX = 900;
export const CIPA_POS_DEFAULT = 50;
export const CIPA_TEXTO_TAMANHO_DEFAULT = 32;
export const CIPA_TEXTO_ALINHAMENTO_DEFAULT: CipaTextoAlinhamento = 'esquerda';

export const CIPA_TEXTO_CAMPOS: CipaTextoCampo[] = [
  'categoria',
  'titulo',
  'texto',
  'data',
  'localizacao',
  'vagas',
  'duracao',
  'sobre',
];

export const CIPA_TEXTO_CAMPO_META: Record<
  CipaTextoCampo,
  { label: string; min: number; max: number; defaultTamanho: number }
> = {
  categoria: { label: 'Categoria', min: 10, max: 20, defaultTamanho: 12 },
  titulo: { label: 'Título', min: 18, max: 56, defaultTamanho: 32 },
  texto: { label: 'Texto', min: 11, max: 28, defaultTamanho: 15 },
  data: { label: 'Data', min: 11, max: 22, defaultTamanho: 14 },
  localizacao: { label: 'Localização', min: 11, max: 22, defaultTamanho: 14 },
  vagas: { label: 'Vagas', min: 11, max: 22, defaultTamanho: 14 },
  duracao: { label: 'Duração', min: 11, max: 22, defaultTamanho: 14 },
  sobre: { label: 'Sobre o evento', min: 12, max: 22, defaultTamanho: 14 },
};

export function clampCipaZoom(value: number | null | undefined): number {
  return clamp(Number(value), 100, 300, CIPA_ZOOM_DEFAULT);
}

export function clampCipaTamanho(value: number | null | undefined): number {
  return Math.round(clamp(Number(value), 40, 100, CIPA_TAMANHO_DEFAULT));
}

export function clampCipaAltura(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < CIPA_ALTURA_MIN) return CIPA_ALTURA_AUTO;
  return Math.round(clamp(n, CIPA_ALTURA_MIN, CIPA_ALTURA_MAX, CIPA_ALTURA_AUTO));
}

export function cipaImagemTamanhoCss(tamanho: number): string {
  return `${clampCipaTamanho(tamanho)}%`;
}

export function cipaFlexFromPos(value: number): string {
  const n = clampCipaPos(value);
  if (n <= 33) return 'flex-start';
  if (n >= 67) return 'flex-end';
  return 'center';
}

export function clampCipaPos(value: number | null | undefined): number {
  return clamp(Number(value), 0, 100, CIPA_POS_DEFAULT);
}

export function clampCipaTextoTamanho(value: number | null | undefined): number {
  return clampCampoTamanho('titulo', value);
}

export function clampCampoTamanho(
  campo: CipaTextoCampo,
  value: number | null | undefined
): number {
  const meta = CIPA_TEXTO_CAMPO_META[campo];
  return Math.round(clamp(Number(value), meta.min, meta.max, meta.defaultTamanho));
}

export function normalizeCipaAlinhamento(value: string | null | undefined): CipaTextoAlinhamento {
  return value === 'centro' || value === 'direita' ? value : CIPA_TEXTO_ALINHAMENTO_DEFAULT;
}

export function estiloDefaultCampo(campo: CipaTextoCampo): CipaTextoEstilo {
  return {
    tamanho: CIPA_TEXTO_CAMPO_META[campo].defaultTamanho,
    alinhamento: CIPA_TEXTO_ALINHAMENTO_DEFAULT,
  };
}

export function estilosTextoDefault(): CipaTextoEstilos {
  return {
    categoria: estiloDefaultCampo('categoria'),
    titulo: estiloDefaultCampo('titulo'),
    texto: estiloDefaultCampo('texto'),
    data: estiloDefaultCampo('data'),
    localizacao: estiloDefaultCampo('localizacao'),
    vagas: estiloDefaultCampo('vagas'),
    duracao: estiloDefaultCampo('duracao'),
    sobre: estiloDefaultCampo('sobre'),
  };
}

export function parseEstilosTexto(
  raw: unknown,
  tituloFallback?: { tamanho?: number; alinhamento?: string | null }
): CipaTextoEstilos {
  let obj: Partial<Record<CipaTextoCampo, Partial<CipaTextoEstilo>>> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Partial<Record<CipaTextoCampo, Partial<CipaTextoEstilo>>>;
  }

  const estilos = estilosTextoDefault();
  for (const campo of CIPA_TEXTO_CAMPOS) {
    const item = obj?.[campo];
    estilos[campo] = {
      tamanho: clampCampoTamanho(campo, item?.tamanho),
      alinhamento: normalizeCipaAlinhamento(item?.alinhamento),
    };
  }

  const temTituloSalvo = obj?.titulo && (obj.titulo.tamanho != null || obj.titulo.alinhamento);
  if (!temTituloSalvo && tituloFallback) {
    if (tituloFallback.tamanho != null) {
      estilos.titulo.tamanho = clampCampoTamanho('titulo', tituloFallback.tamanho);
    }
    if (tituloFallback.alinhamento) {
      estilos.titulo.alinhamento = normalizeCipaAlinhamento(tituloFallback.alinhamento);
    }
  }
  return estilos;
}

export function estiloCampoCss(estilos: CipaTextoEstilos, campo: CipaTextoCampo): {
  tamanho: number;
  align: string;
  justify: string;
} {
  const estilo = estilos[campo] || estiloDefaultCampo(campo);
  return {
    tamanho: estilo.tamanho,
    align: cipaTextoAlignCss(estilo.alinhamento),
    justify: cipaTextoJustifyCss(estilo.alinhamento),
  };
}

export function cipaImagemPosicaoCss(x: number, y: number): string {
  return `${clampCipaPos(x)}% ${clampCipaPos(y)}%`;
}

export function cipaImagemScaleCss(zoom: number): string {
  return `scale(${clampCipaZoom(zoom) / 100})`;
}

export function cipaTextoAlignCss(alinhamento: CipaTextoAlinhamento): string {
  if (alinhamento === 'centro') return 'center';
  if (alinhamento === 'direita') return 'right';
  return 'left';
}

export function cipaTextoJustifyCss(alinhamento: CipaTextoAlinhamento): string {
  if (alinhamento === 'centro') return 'center';
  if (alinhamento === 'direita') return 'flex-end';
  return 'flex-start';
}

export function layoutImagemEvento(ev: Pick<CipaEvento, 'imagem_zoom' | 'imagem_pos_x' | 'imagem_pos_y'>): {
  posicao: string;
  escala: string;
} {
  return {
    posicao: cipaImagemPosicaoCss(ev.imagem_pos_x ?? CIPA_POS_DEFAULT, ev.imagem_pos_y ?? CIPA_POS_DEFAULT),
    escala: cipaImagemScaleCss(ev.imagem_zoom ?? CIPA_ZOOM_DEFAULT),
  };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
