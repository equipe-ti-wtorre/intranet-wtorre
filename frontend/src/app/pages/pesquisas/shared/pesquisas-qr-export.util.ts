import { jsPDF } from 'jspdf';
import { toDataURL } from 'qrcode';
import { PesquisasTemplateVisual } from '../../../models/pesquisas.model';
import {
  PESQUISAS_TPL_WTORRE,
  pesquisasLogoSrc,
  pesquisasLogoSrcDark,
  pesquisasMarcaCores,
} from './pesquisas-marca.util';

const MESES = [
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

export function pesquisasQrDataLabel(raw: string | null | undefined): string {
  if (!raw) return '';
  const datePart = String(raw).trim().replace(' ', 'T').split('T')[0];
  const [y, m, d] = datePart.split('-').map((n) => Number(n));
  if (!y || !m || !d || m < 1 || m > 12) return '';
  return `${String(d).padStart(2, '0')} de ${MESES[m - 1]}`;
}

export interface PesquisasQrExportParams {
  url: string;
  titulo: string;
  dataLabel?: string;
  template?: PesquisasTemplateVisual | null;
}

function hexRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim();
  const h = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [29, 84, 230];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar o logo.'));
    img.src = src;
  });
}

function cropWhiteWordmark(img: HTMLImageElement): HTMLCanvasElement | null {
  const src = document.createElement('canvas');
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  src.width = w;
  src.height = h;
  const ctx = src.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const isGlyph = px[i + 3] > 24 && lum > 140;
    if (isGlyph) {
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      const p = i / 4;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else {
      px[i + 3] = 0;
    }
  }
  if (maxX <= minX || maxY <= minY) return null;
  ctx.putImageData(image, 0, 0);
  const pad = 2;
  const cw = maxX - minX + 1 + pad * 2;
  const ch = maxY - minY + 1 + pad * 2;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.drawImage(src, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
  return out;
}

function composeHeaderBand(
  cores: { header: string; headerEscura: string; headerDegrade: boolean },
  logo: HTMLCanvasElement | null,
  mmW: number,
  mmH: number
): string {
  const scale = 6;
  const w = Math.round(mmW * scale);
  const h = Math.round(mmH * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const [r1, g1, b1] = hexRgb(cores.header);
  if (cores.headerDegrade) {
    const [r2, g2, b2] = hexRgb(cores.headerEscura);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `rgb(${r1},${g1},${b1})`);
    grad.addColorStop(1, `rgb(${r2},${g2},${b2})`);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = `rgb(${r1},${g1},${b1})`;
  }
  ctx.fillRect(0, 0, w, h);
  if (logo && logo.width && logo.height) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    let logoH = Math.round(h * 0.42);
    let logoW = Math.round((logo.width / logo.height) * logoH);
    const maxW = Math.round(w * 0.5);
    if (logoW > maxW) {
      logoW = maxW;
      logoH = Math.round((logo.height / logo.width) * logoW);
    }
    ctx.drawImage(logo, Math.round((w - logoW) / 2), Math.round((h - logoH) / 2), logoW, logoH);
  }
  return c.toDataURL('image/png');
}

function clampTitle(s: string, max = 48): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function fetchDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

async function logoBrancoDataUrl(src: string): Promise<string | null> {
  const data = await fetchDataUrl(src);
  if (!data) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const w = img.naturalWidth || img.width || 1;
      const h = img.naturalHeight || img.height || 1;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(data);
        return;
      }
      ctx.filter = 'brightness(0) invert(1)';
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(data);
    img.src = data;
  });
}

async function rasterizeSvgToWhite(svgUrl: string, targetW = 900): Promise<string | null> {
  try {
    const res = await fetch(svgUrl);
    if (!res.ok) return null;
    const blob = new Blob([await res.text()], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const nw = img.naturalWidth || img.width || 198;
      const nh = img.naturalHeight || img.height || 27;
      const w = targetW;
      const h = Math.max(1, Math.round(w * (nh / nw)));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = 'brightness(0) invert(1)';
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

async function resolveWhiteLogo(codigo: string): Promise<HTMLCanvasElement | null> {
  const id = String(codigo || '').trim().toLowerCase();
  if (id === 'wtorre') {
    const fromSvg = await rasterizeSvgToWhite('/assets/logos/wtorre.svg');
    if (fromSvg) {
      try {
        return cropWhiteWordmark(await loadImage(fromSvg));
      } catch {
        /* cai no PNG */
      }
    }
  }
  const dark = pesquisasLogoSrcDark(codigo);
  const light = pesquisasLogoSrc(codigo);
  let src: string | null = null;
  if (dark && dark !== light) {
    src = (await fetchDataUrl(dark)) || (await logoBrancoDataUrl(light || dark));
  } else {
    const path = dark || light;
    if (!path) return null;
    src = await logoBrancoDataUrl(path);
  }
  if (!src) return null;
  try {
    return cropWhiteWordmark(await loadImage(src));
  } catch {
    return null;
  }
}

function drawCropMarks(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  const gap = 3;
  const len = 8;
  doc.setDrawColor(154, 163, 177);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([], 0);
  const marks: [number, number, number, number][] = [
    [x - gap - len, y, x - gap, y],
    [x, y - gap - len, x, y - gap],
    [x + w + gap, y, x + w + gap + len, y],
    [x + w, y - gap - len, x + w, y - gap],
    [x - gap - len, y + h, x - gap, y + h],
    [x, y + h + gap, x, y + h + gap + len],
    [x + w + gap, y + h, x + w + gap + len, y + h],
    [x + w, y + h + gap, x + w, y + h + gap + len],
  ];
  for (const [x1, y1, x2, y2] of marks) {
    doc.line(x1, y1, x2, y2);
  }
}

export async function buildPesquisasQrPdf(
  params: PesquisasQrExportParams
): Promise<{ doc: jsPDF; filename: string }> {
  const url = params.url?.trim();
  if (!url) throw new Error('Salve o formulário para gerar o QR Code.');
  const tpl = params.template || PESQUISAS_TPL_WTORRE;
  const titulo = clampTitle(params.titulo || 'Formulário');
  const cores = pesquisasMarcaCores(tpl.codigo);
  const primary = hexRgb(cores.primaria);
  const body = hexRgb(cores.corpo);
  const texto = hexRgb(cores.texto);
  const muted = hexRgb(cores.muted);
  const headerFill = hexRgb(cores.header);
  const radius = Math.max(3, Math.min(17, (tpl.raioPx || 10) * 0.47));

  const [qr, logo] = await Promise.all([
    toDataURL(url, {
      width: 512,
      margin: 1,
      color: { dark: cores.primaria, light: cores.corpo },
      errorCorrectionLevel: 'M',
    }),
    resolveWhiteLogo(tpl.codigo),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cardW = 150;
  const cardH = 220;
  const x = (pageW - cardW) / 2;
  const y = (pageH - cardH) / 2;
  const headerH = 36;
  const headerImg = composeHeaderBand(cores, logo, cardW, headerH);

  doc.setFillColor(body[0], body[1], body[2]);
  doc.roundedRect(x, y, cardW, cardH, radius, radius, 'F');

  if (headerImg) {
    doc.addImage(headerImg, 'PNG', x, y, cardW, headerH);
  } else {
    doc.setFillColor(headerFill[0], headerFill[1], headerFill[2]);
    doc.rect(x, y, cardW, headerH, 'F');
  }

  doc.setFillColor(body[0], body[1], body[2]);
  doc.ellipse(x + cardW / 2, y + headerH + 3.8, cardW / 2 + 3, 8.5, 'F');

  doc.setTextColor(texto[0], texto[1], texto[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  const instY = y + headerH + 16;
  doc.text('Obrigado por estar aqui! Conte como foi', x + cardW / 2, instY, {
    align: 'center',
    maxWidth: cardW - 20,
  });
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('sua experiência.', x + cardW / 2, instY + 9, { align: 'center' });

  const qrSize = 70;
  const qrX = x + (cardW - qrSize) / 2;
  const qrY = instY + 16;
  doc.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize);

  doc.setDrawColor(primary[0], primary[1], primary[2]);
  doc.setLineWidth(1.2);
  const c = 7;
  const pad = 4.4;
  const fx = qrX - pad;
  const fy = qrY - pad;
  const fw = qrSize + pad * 2;
  const fh = qrSize + pad * 2;
  doc.line(fx, fy + c, fx, fy);
  doc.line(fx, fy, fx + c, fy);
  doc.line(fx + fw - c, fy, fx + fw, fy);
  doc.line(fx + fw, fy, fx + fw, fy + c);
  doc.line(fx, fy + fh - c, fx, fy + fh);
  doc.line(fx, fy + fh, fx + c, fy + fh);
  doc.line(fx + fw - c, fy + fh, fx + fw, fy + fh);
  doc.line(fx + fw, fy + fh, fx + fw, fy + fh - c);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('Aponte a câmera e escaneie', x + cardW / 2, qrY + qrSize + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(muted[0], muted[1], muted[2]);
  doc.text('Sua opinião é importante pra gente', x + cardW / 2, qrY + qrSize + 23, {
    align: 'center',
  });

  drawCropMarks(doc, x, y, cardW, cardH);

  return { doc, filename: `qr-${slugify(titulo) || 'formulario'}.pdf` };
}

export async function exportPesquisasQrPdf(params: PesquisasQrExportParams): Promise<void> {
  const { doc, filename } = await buildPesquisasQrPdf(params);
  doc.save(filename);
}

export async function printPesquisasQrPdf(params: PesquisasQrExportParams): Promise<void> {
  const { doc } = await buildPesquisasQrPdf(params);
  doc.autoPrint();
  const url = URL.createObjectURL(doc.output('blob'));
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  document.body.appendChild(iframe);

  const cleanup = () => {
    iframe.remove();
    URL.revokeObjectURL(url);
  };
  window.setTimeout(cleanup, 120_000);

  await new Promise<void>((resolve, reject) => {
    const unlock = window.setTimeout(resolve, 2000);
    const openPopup = () => {
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) throw new Error('Permita pop-ups para imprimir o QR Code.');
    };
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        window.clearTimeout(unlock);
        try {
          openPopup();
          resolve();
        } catch (err) {
          reject(err);
        }
        return;
      }
      try {
        win.focus();
        win.print();
      } catch {
        window.clearTimeout(unlock);
        try {
          openPopup();
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    };
    iframe.onerror = () => {
      window.clearTimeout(unlock);
      reject(new Error('Não foi possível abrir a impressão.'));
    };
  });
}
