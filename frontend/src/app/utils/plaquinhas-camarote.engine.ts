import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';

export const PLAQUINHA_LABELS = ['Plaquinha 1', 'Plaquinha 2', 'Plaquinha 3'] as const;
export const PLAQUINHA_DEFAULT_BG = '#8D0DE3';

export const A4W = 210;
export const A4H = 297;
export const PREVIEW_SCALE = 1.6;

export type PlaquinhaMode = 'single' | 'multi';
export type LogoFitMode = 'cover' | 'contain';

export interface PlaquinhaOffset {
  x: number;
  y: number;
}

export interface PlaquinhaDimensions {
  width: number;
  height: number;
  gap: number;
}

export interface PlaquinhaCell {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

export interface PlaquinhaState {
  mode: PlaquinhaMode;
  singleSrc: string | null;
  cellSrcs: (string | null)[];
  rotations: number[];
  scales: number[];
  offsets: PlaquinhaOffset[];
  bgColors: string[];
  logoModes: LogoFitMode[];
  dimensions: PlaquinhaDimensions;
  syncAll: boolean;
}

export interface ActiveDrag {
  idx: number;
  sx: number;
  sy: number;
  startOffsets: PlaquinhaOffset[];
}

let pdfWorkerConfigured = false;

export function createDefaultPlaquinhaState(): PlaquinhaState {
  return {
    mode: 'single',
    singleSrc: null,
    cellSrcs: [null, null, null],
    rotations: [90, 90, 0],
    scales: [100, 100, 100],
    offsets: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    bgColors: [PLAQUINHA_DEFAULT_BG, PLAQUINHA_DEFAULT_BG, PLAQUINHA_DEFAULT_BG],
    logoModes: ['cover', 'cover', 'cover'],
    dimensions: { width: 14, height: 9.5, gap: 0.3 },
    syncAll: false,
  };
}

export function configurePdfWorker(): void {
  if (pdfWorkerConfigured) return;
  if (typeof Worker !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
      new URL('../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' }
    );
  }
  pdfWorkerConfigured = true;
}

export function getPlaquinhaSrc(state: PlaquinhaState, index: number): string | null {
  return state.mode === 'multi' ? state.cellSrcs[index] : state.singleSrc;
}

export function getPlaquinhaCells(state: PlaquinhaState): PlaquinhaCell[] {
  const pw = state.dimensions.width * 10;
  const ph = state.dimensions.height * 10;
  const gp = state.dimensions.gap * 10;
  const vw = ph;
  const vh = pw;
  const hw = pw;
  const hh = ph;
  const topW = 2 * vw + gp;
  const topX = (A4W - topW) / 2;
  const botX = (A4W - hw) / 2;
  const blockH = vh + gp + hh;
  const topY = (A4H - blockH) / 2;
  const botY = topY + vh + gp;

  return [
    { x: topX, y: topY, w: vw, h: vh, rot: state.rotations[0] },
    { x: topX + vw + gp, y: topY, w: vw, h: vh, rot: state.rotations[1] },
    { x: botX, y: botY, w: hw, h: hh, rot: state.rotations[2] },
  ];
}

export function placaSizeLabel(index: number): string {
  return index < 2 ? '9,5×14cm' : '14×9,5cm';
}

const imgCache: Record<string, HTMLImageElement & { _cbs?: ((img: HTMLImageElement) => void)[] }> = {};
const imgReady: Record<string, boolean> = {};

export function clearImageCache(): void {
  Object.keys(imgCache).forEach((k) => delete imgCache[k]);
  Object.keys(imgReady).forEach((k) => delete imgReady[k]);
}

function preloadImage(src: string, cb: (img: HTMLImageElement) => void): void {
  if (imgReady[src]) {
    cb(imgCache[src]);
    return;
  }
  if (imgCache[src]) {
    imgCache[src]._cbs = imgCache[src]._cbs || [];
    imgCache[src]._cbs!.push(cb);
    return;
  }
  const img = new Image() as HTMLImageElement & { _cbs?: ((img: HTMLImageElement) => void)[] };
  img._cbs = [cb];
  imgCache[src] = img;
  img.onload = () => {
    imgReady[src] = true;
    img._cbs?.forEach((fn) => fn(img));
    img._cbs = [];
  };
  img.src = src;
}

function paintOnCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  rot: number,
  scalePct: number,
  ox: number,
  oy: number,
  idx: number,
  state: PlaquinhaState
): void {
  const cw = canvas.width;
  const ch = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = state.bgColors[idx] || PLAQUINHA_DEFAULT_BG;
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(cw / 2 + ox, ch / 2 + oy);
  ctx.rotate((rot * Math.PI) / 180);

  const isRot = rot === 90 || rot === 270;
  const boxW = isRot ? ch : cw;
  const boxH = isRot ? cw : ch;
  const bw = (boxW * scalePct) / 100;
  const bh = (boxH * scalePct) / 100;
  const ir = img.naturalWidth / img.naturalHeight;
  const br = bw / bh;
  let dw: number;
  let dh: number;
  const fitMode = state.logoModes[idx] || 'cover';

  if (fitMode === 'contain') {
    if (ir > br) {
      dw = bw;
      dh = dw / ir;
    } else {
      dh = bh;
      dw = dh * ir;
    }
  } else if (ir > br) {
    dh = bh;
    dw = dh * ir;
  } else {
    dw = bw;
    dh = dw / ir;
  }

  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function drawCellCanvas(
  canvas: HTMLCanvasElement,
  src: string | null,
  rot: number,
  scalePct: number,
  ox: number,
  oy: number,
  idx: number,
  state: PlaquinhaState
): void {
  const cw = canvas.width;
  const ch = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, cw, ch);

  if (!src) {
    const sz = 12;
    for (let y = 0; y < ch; y += sz) {
      for (let x = 0; x < cw; x += sz) {
        ctx.fillStyle = (x / sz + y / sz) % 2 === 0 ? '#e8e4f0' : '#d8d0e8';
        ctx.fillRect(x, y, sz, sz);
      }
    }
    ctx.fillStyle = 'rgba(100,80,140,0.6)';
    ctx.font = `bold ${Math.round(cw * 0.08)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PLAQUINHA_LABELS[idx] || '', cw / 2, ch / 2 - 10);
    ctx.font = `${Math.round(cw * 0.065)}px system-ui`;
    ctx.fillStyle = 'rgba(100,80,140,0.5)';
    ctx.fillText('Sem arte', cw / 2, ch / 2 + 14);
    return;
  }

  ctx.fillStyle = state.bgColors[idx] || PLAQUINHA_DEFAULT_BG;
  ctx.fillRect(0, 0, cw, ch);
  preloadImage(src, (img) => paintOnCanvas(canvas, img, rot, scalePct, ox, oy, idx, state));
}

export function renderPlaquinhaSheet(
  sheet: HTMLElement,
  state: PlaquinhaState,
  onCanvasPointerDown?: (index: number, event: MouseEvent | TouchEvent) => void,
  highlightedIndex?: number | null
): void {
  const cells = getPlaquinhaCells(state);
  const shW = Math.round(A4W * PREVIEW_SCALE);
  const shH = Math.round(A4H * PREVIEW_SCALE);
  sheet.style.width = `${shW}px`;
  sheet.style.height = `${shH}px`;
  sheet.innerHTML = '';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(shW));
  svg.setAttribute('height', String(shH));
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:10';

  cells.forEach((cell, i) => {
    const src = getPlaquinhaSrc(state, i);
    const cw = Math.round(cell.w * PREVIEW_SCALE);
    const ch = Math.round(cell.h * PREVIEW_SCALE);
    const cx = Math.round(cell.x * PREVIEW_SCALE);
    const cy = Math.round(cell.y * PREVIEW_SCALE);

    const cnv = document.createElement('canvas');
    cnv.width = cw;
    cnv.height = ch;
    const canDrag = src && (!state.syncAll || i === 0);
    cnv.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;cursor:${canDrag ? 'grab' : 'default'}`;
    cnv.dataset['cellIdx'] = String(i);
    drawCellCanvas(cnv, src, cell.rot, state.scales[i], state.offsets[i].x, state.offsets[i].y, i, state);

    if (onCanvasPointerDown && src) {
      cnv.addEventListener('mousedown', (e) => onCanvasPointerDown(i, e));
      cnv.addEventListener(
        'touchstart',
        (e) => {
          onCanvasPointerDown(i, e);
        },
        { passive: false }
      );
    }

    sheet.appendChild(cnv);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(cx));
    rect.setAttribute('y', String(cy));
    rect.setAttribute('width', String(cw));
    rect.setAttribute('height', String(ch));
    rect.setAttribute('fill', 'none');
    if (highlightedIndex === i) {
      rect.setAttribute('stroke', '#8A0FCB');
      rect.setAttribute('stroke-width', '2.5');
    } else {
      rect.setAttribute('stroke', 'rgba(255,45,135,0.4)');
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', '4 3');
    }
    svg.appendChild(rect);

    if (src && Math.abs(state.offsets[i].x) < 8) {
      const vl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      vl.setAttribute('x1', String(cx + cw / 2));
      vl.setAttribute('y1', String(cy));
      vl.setAttribute('x2', String(cx + cw / 2));
      vl.setAttribute('y2', String(cy + ch));
      vl.setAttribute('stroke', 'rgba(255,45,135,0.4)');
      vl.setAttribute('stroke-width', '1');
      svg.appendChild(vl);
    }

    if (src && Math.abs(state.offsets[i].y) < 8) {
      const hl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      hl.setAttribute('x1', String(cx));
      hl.setAttribute('y1', String(cy + ch / 2));
      hl.setAttribute('x2', String(cx + cw));
      hl.setAttribute('y2', String(cy + ch / 2));
      hl.setAttribute('stroke', 'rgba(255,45,135,0.4)');
      hl.setAttribute('stroke-width', '1');
      svg.appendChild(hl);
    }

    const G = 3 * PREVIEW_SCALE;
    const L = 6 * PREVIEW_SCALE;
    [
      [cx, cy, -1, -1],
      [cx + cw, cy, 1, -1],
      [cx, cy + ch, -1, 1],
      [cx + cw, cy + ch, 1, 1],
    ].forEach(([px, py, hd, vd]) => {
      let aH = L;
      let aV = L;
      cells.forEach((other, j) => {
        if (j === i) return;
        const ox2 = Math.round(other.x * PREVIEW_SCALE);
        const oy2 = Math.round(other.y * PREVIEW_SCALE);
        const ow = Math.round(other.w * PREVIEW_SCALE);
        const oh = Math.round(other.h * PREVIEW_SCALE);
        if (py >= oy2 - 1 && py <= oy2 + oh + 1) {
          if (hd > 0 && ox2 > px) aH = Math.min(aH, ox2 - px - G - 1);
          if (hd < 0 && ox2 + ow < px) aH = Math.min(aH, px - (ox2 + ow) - G - 1);
        }
        if (px >= ox2 - 1 && px <= ox2 + ow + 1) {
          if (vd > 0 && oy2 > py) aV = Math.min(aV, oy2 - py - G - 1);
          if (vd < 0 && oy2 + oh < py) aV = Math.min(aV, py - (oy2 + oh) - G - 1);
        }
      });
      if (aH > 1) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(px + hd * G));
        line.setAttribute('y1', String(py));
        line.setAttribute('x2', String(px + hd * (G + aH)));
        line.setAttribute('y2', String(py));
        line.setAttribute('stroke', '#FF2D87');
        line.setAttribute('stroke-width', '1.5');
        svg.appendChild(line);
      }
      if (aV > 1) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(px));
        line.setAttribute('y1', String(py + vd * G));
        line.setAttribute('x2', String(px));
        line.setAttribute('y2', String(py + vd * (G + aV)));
        line.setAttribute('stroke', '#FF2D87');
        line.setAttribute('stroke-width', '1.5');
        svg.appendChild(line);
      }
    });
  });

  sheet.appendChild(svg);
}

export function applyDragDelta(
  state: PlaquinhaState,
  drag: ActiveDrag,
  dx: number,
  dy: number
): PlaquinhaOffset[] {
  const { idx } = drag;
  const next = state.offsets.map((o) => ({ ...o }));

  if (state.syncAll) {
    next.forEach((_, j) => {
      const rel = ((state.rotations[j] - state.rotations[idx]) % 360 + 360) % 360;
      let jdx: number;
      let jdy: number;
      if (rel === 90) {
        jdx = -dy;
        jdy = dx;
      } else if (rel === 270) {
        jdx = dy;
        jdy = -dx;
      } else if (rel === 180) {
        jdx = -dx;
        jdy = -dy;
      } else {
        jdx = dx;
        jdy = dy;
      }
      const start = drag.startOffsets[j];
      if (start) next[j] = { x: start.x + jdx, y: start.y + jdy };
    });
  } else {
    const start = drag.startOffsets[idx];
    if (start) next[idx] = { x: start.x + dx, y: start.y + dy };
  }

  return next;
}

export function snapOffsetsAfterDrag(state: PlaquinhaState, idx: number): PlaquinhaOffset[] {
  const next = state.offsets.map((o) => ({ ...o }));
  if (Math.abs(next[idx].x) < 8 && Math.abs(next[idx].y) < 8) {
    next[idx] = { x: 0, y: 0 };
    if (state.syncAll) {
      return next.map(() => ({ x: 0, y: 0 }));
    }
  }
  return next;
}

export async function fileToDataURL(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || name.endsWith('.ai')) return renderPdfFile(file);
  if (name.endsWith('.svg')) return renderSvgFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export async function renderPdfFile(file: File | Blob): Promise<string> {
  configurePdfWorker();
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 3 });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  return canvas.toDataURL('image/png');
}

export async function renderSvgFile(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let txt = e.target?.result as string;
      const parser = new DOMParser();
      const doc = parser.parseFromString(txt, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (svg && (!svg.getAttribute('width') || svg.getAttribute('width') === '0')) {
        const vb = svg.getAttribute('viewBox');
        if (vb) {
          const parts = vb.trim().split(/[\s,]+/);
          svg.setAttribute('width', parts[2] || '800');
          svg.setAttribute('height', parts[3] || '600');
        } else {
          svg.setAttribute('width', '800');
          svg.setAttribute('height', '600');
        }
        txt = new XMLSerializer().serializeToString(svg);
      }
      const b64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(txt)))}`;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = (img.naturalWidth || 800) * 2;
        canvas.height = (img.naturalHeight || 600) * 2;
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(b64);
      img.src = b64;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsText(file);
  });
}

export async function exportPlaquinhasPdf(state: PlaquinhaState): Promise<void> {
  const cells = getPlaquinhaCells(state);
  if (!cells.some((_, i) => getPlaquinhaSrc(state, i))) {
    throw new Error('Envie pelo menos uma arte.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dpi = 300 / 25.4;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const src = getPlaquinhaSrc(state, i);
    const rot = cell.rot;
    const sc = state.scales[i] / 100;
    const cw = Math.round(cell.w * dpi);
    const ch = Math.round(cell.h * dpi);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = state.bgColors[i] || PLAQUINHA_DEFAULT_BG;
    ctx.fillRect(0, 0, cw, ch);

    if (src) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const ox = (state.offsets[i].x / PREVIEW_SCALE) * dpi;
          const oy = (state.offsets[i].y / PREVIEW_SCALE) * dpi;
          ctx.save();
          ctx.translate(cw / 2 + ox, ch / 2 + oy);
          ctx.rotate((rot * Math.PI) / 180);
          const isRot = rot === 90 || rot === 270;
          const boxW = (isRot ? ch : cw) * sc;
          const boxH = (isRot ? cw : ch) * sc;
          const ir = img.naturalWidth / img.naturalHeight;
          const br = boxW / boxH;
          let dw: number;
          let dh: number;
          if ((state.logoModes[i] || 'cover') === 'contain') {
            if (ir > br) {
              dw = boxW;
              dh = dw / ir;
            } else {
              dh = boxH;
              dw = dh * ir;
            }
          } else if (ir > br) {
            dh = boxH;
            dw = dh * ir;
          } else {
            dw = boxW;
            dh = dw / ir;
          }
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
          ctx.restore();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });
    }

    doc.addImage(canvas.toDataURL('image/png'), 'PNG', cell.x, cell.y, cell.w, cell.h);
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  const G = 3;
  const L = 6;

  cells.forEach((cell) => {
    [
      [cell.x, cell.y, -1, -1],
      [cell.x + cell.w, cell.y, 1, -1],
      [cell.x, cell.y + cell.h, -1, 1],
      [cell.x + cell.w, cell.y + cell.h, 1, 1],
    ].forEach(([px, py, hd, vd]) => {
      let aH = L;
      let aV = L;
      cells.forEach((other) => {
        if (other === cell) return;
        if (py >= other.y - 0.5 && py <= other.y + other.h + 0.5) {
          if (hd > 0 && other.x > px) aH = Math.min(aH, other.x - px - G - 0.5);
          if (hd < 0 && other.x + other.w < px) aH = Math.min(aH, px - (other.x + other.w) - G - 0.5);
        }
        if (px >= other.x - 0.5 && px <= other.x + other.w + 0.5) {
          if (vd > 0 && other.y > py) aV = Math.min(aV, other.y - py - G - 0.5);
          if (vd < 0 && other.y + other.h < py) aV = Math.min(aV, py - (other.y + other.h) - G - 0.5);
        }
      });
      if (aH > 1) doc.line(px + hd * G, py, px + hd * (G + aH), py);
      if (aV > 1) doc.line(px, py + vd * G, px, py + vd * (G + aV));
    });
  });

  doc.save('plaquinhas-camarote.pdf');
}
