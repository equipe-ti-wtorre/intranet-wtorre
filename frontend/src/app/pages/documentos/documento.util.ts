import { Documento, DocumentoSetorRef } from '../../models/documento.model';

export function iconeExtensao(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'pdf',
    docx: 'doc',
    xlsx: 'xls',
    pptx: 'ppt',
    png: 'img',
    jpg: 'img',
    jpeg: 'img',
    zip: 'zip',
  };
  return map[ext] || 'file';
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function filtrarDocumentos(docs: Documento[], busca: string): Documento[] {
  const q = busca.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter(
    (d) =>
      d.titulo.toLowerCase().includes(q) ||
      (d.descricao || '').toLowerCase().includes(q) ||
      d.nome_original.toLowerCase().includes(q) ||
      (d.setor?.nome || '').toLowerCase().includes(q)
  );
}

export interface TituloCapa {
  prefixo: string;
  destaque: string;
}

export function splitTituloCapa(titulo: string): TituloCapa {
  const words = titulo.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { prefixo: '', destaque: 'Sem título' };
  if (words.length === 1) return { prefixo: '', destaque: words[0] };
  const destaque = words.pop()!;
  return { prefixo: `${words.join(' ')} `, destaque };
}

export function corEntidadeTab(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes('nubank')) return '#8d0de3';
  if (s.includes('base') || s.includes('cowork')) return '#0d9488';
  if (s.includes('novo') || s.includes('anh')) return '#c2410c';
  return '#1d54e6';
}

export function entidadeTabGradiente(slug: string): string | null {
  const s = slug.toLowerCase();
  if (s.includes('wtorre') || s === 'wtorre') {
    return 'linear-gradient(135deg, #27406e, #16203a)';
  }
  return null;
}

export function chipSetorClass(setor?: DocumentoSetorRef | null): string {
  const s = `${setor?.slug ?? ''} ${setor?.nome ?? ''}`.toLowerCase();
  if (s.includes('ti') || s.includes('tec')) return 'chip-ti';
  if (s.includes('rh') || s.includes('recursos')) return 'chip-rh';
  if (s.includes('op')) return 'chip-op';
  return 'chip-op';
}

export function chipExtClass(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'chip-pdf';
  if (e === 'doc' || e === 'docx') return 'chip-docx';
  if (e === 'xls' || e === 'xlsx') return 'chip-docx';
  if (e === 'ppt' || e === 'pptx') return 'chip-pdf';
  return 'chip-pdf';
}
