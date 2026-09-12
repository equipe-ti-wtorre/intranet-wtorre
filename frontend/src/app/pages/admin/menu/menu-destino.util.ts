import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isPaginaInternaConhecida } from '../../../data/paginas-internas';

export type TipoDestino = 'interna' | 'externa' | 'agrupador';

const URL_EXTERNA_REGEX = /^https?:\/\/.+/i;

export function inferirTipoDestino(url: string | null | undefined): TipoDestino {
  if (!url || url === '#') return 'agrupador';
  const trimmed = url.trim();
  if (!trimmed) return 'agrupador';
  if (trimmed.startsWith('/')) return 'interna';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'externa';
  return 'agrupador';
}

export function buildUrlFromDestino(
  tipo: TipoDestino,
  paginaInterna: string,
  urlExterna: string
): string | null {
  switch (tipo) {
    case 'interna':
      return paginaInterna.trim() || null;
    case 'externa':
      return urlExterna.trim() || null;
    case 'agrupador':
      return null;
  }
}

export function destinoFromUrl(url: string | null | undefined): {
  tipo: TipoDestino;
  paginaInterna: string;
  urlExterna: string;
} {
  const tipo = inferirTipoDestino(url);
  const raw = (url ?? '').trim();

  if (tipo === 'interna') {
    return {
      tipo,
      paginaInterna: isPaginaInternaConhecida(raw) ? raw : '',
      urlExterna: '',
    };
  }
  if (tipo === 'externa') {
    return { tipo, paginaInterna: '', urlExterna: raw };
  }
  return { tipo, paginaInterna: '', urlExterna: '' };
}

export function paginaInternaValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) return null;
    if (parent.get('tipo_destino')?.value !== 'interna') return null;

    const path = String(control.value ?? '').trim();
    if (!path) return { required: true };
    if (!isPaginaInternaConhecida(path)) return { paginaDesconhecida: true };
    return null;
  };
}

export function urlExternaValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) return null;
    if (parent.get('tipo_destino')?.value !== 'externa') return null;

    const url = String(control.value ?? '').trim();
    if (!url) return { required: true };
    if (!URL_EXTERNA_REGEX.test(url)) return { urlInvalida: true };
    return null;
  };
}

/** Página interna opcional — destino vazio é permitido (ex.: rodapé). */
export function paginaInternaOpcionalValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) return null;
    if (parent.get('tipo_destino')?.value !== 'interna') return null;

    const path = String(control.value ?? '').trim();
    if (!path) return null;
    if (!isPaginaInternaConhecida(path)) return { paginaDesconhecida: true };
    return null;
  };
}

/** URL externa opcional — destino vazio é permitido; valida formato se preenchida. */
export function urlExternaOpcionalValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) return null;
    if (parent.get('tipo_destino')?.value !== 'externa') return null;

    const url = String(control.value ?? '').trim();
    if (!url) return null;
    if (!URL_EXTERNA_REGEX.test(url)) return { urlInvalida: true };
    return null;
  };
}
