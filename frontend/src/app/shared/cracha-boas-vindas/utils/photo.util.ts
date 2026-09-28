import { FotoAjuste } from '../models/colaborador-cracha.model';

/**
 * Reduz a foto para no maximo `maxDim` px no lado maior e comprime como JPEG.
 * Evita que fotos de celular (4-8MB) deixem o app lento ou os arquivos exportados pesados.
 */
export function resizeImageFile(file: File, maxDim = 900): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const outW = Math.round(w * scale);
        const outH = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, outW, outH);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.87), width: outW, height: outH });
      };
      img.src = String(ev.target?.result);
    };
    reader.readAsDataURL(file);
  });
}

// Zoom inicial um pouco abaixo de 1 (foto cobrindo 100% do círculo, sem folga) - assim a foto
// entra levemente "recuada" em vez de já grudada na borda, e quem quiser aproximar usa o
// controle de Zoom.
const ZOOM_INICIAL = 0.9;

export function novaFotoAjuste(dataUrl: string, width: number, height: number): FotoAjuste {
  return { dataUrl, naturalW: width, naturalH: height, zoom: ZOOM_INICIAL, panX: 0, panY: 0, rotation: 0 };
}

/**
 * Diâmetro (em px na tela) do círculo de foto sob um elemento clicado - usado pra arrastar
 * direto em cima do crachá ou do card de boas-vindas (não só no círculo pequeno de ajuste).
 * Compartilhada entre a ferramenta standalone (/cracha-boas-vindas) e a Solicitação de
 * Colaborador pra garantir o mesmo comportamento de arraste nas duas telas:
 * - Crachá: qualquer ponto do SVG do crachá conta (a arte toda é o "alvo", como na ferramenta
 *   original) e o círculo tem 92.2/153.07 da largura do SVG.
 * - Boas-vindas: só a área da foto (.bv-photo-wrap) conta - clicar no texto/bolha do card não
 *   deve mover a foto.
 * Retorna null quando o clique não caiu em nenhuma área de foto (não inicia o arraste).
 */
export function diametroFotoAlvo(target: HTMLElement): number | null {
  const crachaSvg = target.closest('#crachaSvg');
  if (crachaSvg) {
    const rect = crachaSvg.getBoundingClientRect();
    return rect.width * (92.2 / 153.07);
  }
  const photoWrap = target.closest('.bv-photo-wrap');
  const photoSvg = photoWrap?.querySelector('svg');
  if (photoSvg) return photoSvg.getBoundingClientRect().width;
  return null;
}

export function normalizeRotation(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * O limite de arraste depende da proporcao real da foto (ja rotacionada), nao so do zoom:
 * uma foto retrato (mais alta que larga) ja tem "sobra" vertical mesmo sem zoom.
 */
export function clampPan(foto: FotoAjuste | null | undefined): void {
  if (!foto) return;
  const rotation = normalizeRotation(foto.rotation || 0);
  const isAxisAligned = Math.abs(rotation) % 90 === 0;
  let aspectX: number;
  let aspectY: number;
  if (isAxisAligned) {
    const swapped = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
    const w = swapped ? foto.naturalH : foto.naturalW;
    const h = swapped ? foto.naturalW : foto.naturalH;
    const minDim = Math.min(w, h);
    aspectX = w / minDim;
    aspectY = h / minDim;
  } else {
    // Angulo livre (nao multiplo de 90): usa o valor mais conservador nos dois eixos,
    // pra garantir que a foto sempre cubra o circulo, seja qual for o angulo.
    aspectX = aspectY = 1;
  }
  const maxPanX = Math.max(0, (aspectX * foto.zoom - 1) / 2);
  const maxPanY = Math.max(0, (aspectY * foto.zoom - 1) / 2);
  foto.panX = Math.max(-maxPanX, Math.min(maxPanX, foto.panX));
  foto.panY = Math.max(-maxPanY, Math.min(maxPanY, foto.panY));
}
