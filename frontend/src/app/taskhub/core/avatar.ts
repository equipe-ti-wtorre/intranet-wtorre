import { environment } from '../environments/environment';

const MAX_SIDE = 256;

/** Monta a URL absoluta da foto a partir do caminho devolvido pela API. */
export function resolveAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const origin = environment.apiUrl.replace(/\/api\/?$/, '');
  return `${origin}${url}`;
}

/** Reduz a imagem para no máximo 256px e devolve um JPEG em data URL. */
export function fileToAvatarJpeg(file: File): Promise<string> {
  const type = (file.type || '').toLowerCase();
  if (type !== 'image/jpeg' && type !== 'image/jpg' && type !== 'image/png') {
    return Promise.reject(new Error('Envie uma foto JPEG ou PNG.'));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const local = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(local);
        reject(new Error('Não foi possível ler a foto.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(local);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(local);
      reject(new Error('Não foi possível ler a foto.'));
    };
    img.src = local;
  });
}
