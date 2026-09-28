import html2canvas from 'html2canvas';
import { BrandData } from '../data/brands.data';
import { ColaboradorCracha } from '../models/colaborador-cracha.model';
import { BOAS_VINDAS_CSS, renderCrachaSVG } from './render.util';

/**
 * Nome de arquivo seguro: troca espacos por "_" e remove caracteres invalidos em
 * nomes de arquivo no Windows/macOS (< > : " / \ | ? *), alem de pontos finais/espacos
 * no fim (Windows rejeita). Corrige um bug da ferramenta original que so tratava espacos.
 */
export function fileSafeName(name: string | null | undefined): string {
  const base = (name || 'Colaborador').trim().replace(/\s+/g, '_');
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/[.\s]+$/, '') || 'Colaborador';
}

/** Grava a resolucao (DPI) no cabecalho JFIF do JPEG, pra abrir/imprimir no tamanho fisico correto. */
function setJpegDpi(dataUrl: string, dpi: number): string {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes[2] === 0xff && bytes[3] === 0xe0) {
    bytes[13] = 1; // unidade = pixels por polegada
    bytes[14] = (dpi >> 8) & 0xff;
    bytes[15] = dpi & 0xff;
    bytes[16] = (dpi >> 8) & 0xff;
    bytes[17] = dpi & 0xff;
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return 'data:image/jpeg;base64,' + btoa(out);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function createOffscreenContainer(): HTMLDivElement {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.left = '-99999px';
  div.style.top = '0';
  document.body.appendChild(div);
  return div;
}

/** Gera o JPEG do cracha (54x86mm a 300dpi) a partir do SVG, sem depender de bibliotecas externas. */
export async function exportCrachaJPEG(colab: ColaboradorCracha, brand: BrandData): Promise<Blob> {
  const container = createOffscreenContainer();
  try {
    container.innerHTML = renderCrachaSVG(colab, brand);
    const svgEl = container.querySelector('svg')!;
    const svgStr = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    // 54x86mm a 300dpi (1mm = 300/25.4 px)
    const targetW = 638;
    const targetH = 1016;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    URL.revokeObjectURL(url);

    let jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    jpegDataUrl = setJpegDpi(jpegDataUrl, 300);
    return dataUrlToBlob(jpegDataUrl);
  } finally {
    document.body.removeChild(container);
  }
}

/** Gera o JPEG do cartao de boas-vindas a partir do HTML renderizado (via html2canvas). */
export async function exportBoasVindasJPEG(cardHtml: string): Promise<Blob> {
  const container = createOffscreenContainer();
  try {
    container.innerHTML = `<style>${BOAS_VINDAS_CSS}</style>${cardHtml}`;
    const card = container.querySelector<HTMLElement>('#boasCard')!;
    const canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return dataUrlToBlob(dataUrl);
  } finally {
    document.body.removeChild(container);
  }
}

export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}
