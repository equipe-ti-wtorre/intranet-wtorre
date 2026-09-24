const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { validarTextoCertificado } = require('../utils/nsc-certificado-texto.util');

const TESSDATA_DIR = path.join(__dirname, '..', 'assets', 'tessdata');
const OCR_TIMEOUT_MS = 90_000;

let pdfjsLibPromise = null;
let workerPromise = null;

function httpError(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

async function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => {
      const lib = mod.default || mod;
      if (lib.GlobalWorkerOptions) {
        const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
        lib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
      }
      return lib;
    });
  }
  return pdfjsLibPromise;
}

async function getPdfDocument(buffer) {
  const pdfjs = await loadPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  });
  return loadingTask.promise;
}

function textoImprimivel(value) {
  const s = String(value || '');
  if (!s || !/[A-Za-zÀ-ÿ]{3,}/.test(s)) return false;
  const printable = (s.match(/[\x20-\x7EÀ-ÿ\s]/g) || []).length;
  return printable / s.length >= 0.85;
}

function extrairTextoPdfBruto(buffer) {
  const latin = Buffer.from(buffer).toString('latin1');
  const partes = [];
  for (const m of latin.matchAll(/\((?:\\.|[^\\)]){3,240}\)/g)) {
    const texto = m[0]
      .slice(1, -1)
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\(.)/g, '$1');
    if (textoImprimivel(texto)) partes.push(texto);
  }
  for (const m of latin.matchAll(/<((?:FEFF|feff)[0-9A-Fa-f]{8,})>/g)) {
    try {
      const hex = m[1].replace(/^FEFF/i, '');
      const decoded = Buffer.from(hex, 'hex').swap16().toString('utf16le');
      if (textoImprimivel(decoded)) partes.push(decoded);
    } catch {
      /* ignore */
    }
  }
  return partes.join(' ');
}

async function extrairTextoPdf(buffer) {
  const doc = await getPdfDocument(buffer);
  try {
    const maxPages = Math.min(doc.numPages || 1, 2);
    const partes = [];
    for (let i = 1; i <= maxPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      partes.push(content.items.map((item) => item.str || '').join(' '));
    }
    return partes.join('\n');
  } finally {
    await doc.destroy();
  }
}

function canaisImagem(img) {
  if (!img?.data || !img.width || !img.height) return 0;
  return Math.round(img.data.length / (img.width * img.height));
}

async function imagensDoPdf(buffer) {
  const pdfjs = await loadPdfjs();
  const doc = await getPdfDocument(buffer);
  try {
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    const nomes = [];
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      if (ops.fnArray[i] === pdfjs.OPS.paintImageXObject) {
        const nome = ops.argsArray[i] && ops.argsArray[i][0];
        if (nome) nomes.push(nome);
      }
    }
    const pngs = [];
    for (const nome of nomes) {
      let img = null;
      try {
        img = page.objs.get(nome);
      } catch {
        img = await new Promise((resolve) => page.objs.get(nome, resolve));
      }
      const channels = canaisImagem(img);
      if (![1, 3, 4].includes(channels)) continue;
      if (img.width > 4500 || img.height > 4500) continue;
      if (img.data.length > 40 * 1024 * 1024) continue;
      try {
        const png = await sharp(Buffer.from(img.data), {
          raw: { width: img.width, height: img.height, channels },
        })
          .png()
          .toBuffer();
        pngs.push(png);
      } catch (err) {
        console.warn('[nsc] imagem do PDF ignorada:', err.message);
      }
    }
    pngs.sort((a, b) => b.length - a.length);
    return pngs;
  } finally {
    await doc.destroy();
  }
}

async function preprocessImage(input) {
  return sharp(input)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

function clampExtract(meta, left, top, width, height) {
  const w = meta.width || 0;
  const h = meta.height || 0;
  const l = Math.max(0, Math.min(w - 1, Math.round(left)));
  const t = Math.max(0, Math.min(h - 1, Math.round(top)));
  const rw = Math.max(8, Math.min(w - l, Math.round(width)));
  const rh = Math.max(8, Math.min(h - t, Math.round(height)));
  return { left: l, top: t, width: rw, height: rh };
}

async function recortesModelo(png) {
  const meta = await sharp(png).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (w < 40 || h < 40) return { pagina: png };

  const nome = await sharp(png)
    .extract(clampExtract(meta, 0, h * 0.22, w * 0.82, h * 0.42))
    .toBuffer();
  const data = await sharp(png)
    .extract(clampExtract(meta, w * 0.76, h * 0.62, w * 0.24, h * 0.36))
    .toBuffer();
  const dataFaixa = await sharp(png)
    .extract(clampExtract(meta, 0, h * 0.55, w, h * 0.45))
    .toBuffer();
  return { pagina: png, nome, data, dataFaixa };
}

async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('por', 1, {
      langPath: TESSDATA_DIR,
      cachePath: os.tmpdir(),
      gzip: false,
      cacheMethod: 'none',
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function ocrBuffer(buffer) {
  const worker = await getOcrWorker();
  const result = await Promise.race([
    worker.recognize(buffer),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS);
    }),
  ]);
  return result?.data?.text || '';
}

async function ocrImagem(png, textoJaLido = '', nomeColaborador = '') {
  const recortes = await recortesModelo(png);
  const textos = [];
  for (const key of ['pagina', 'nome', 'data', 'dataFaixa']) {
    if (!recortes[key]) continue;
    textos.push(await ocrBuffer(recortes[key]));
    if (textoSuficiente([textoJaLido, ...textos].filter(Boolean).join('\n'), nomeColaborador)) {
      break;
    }
  }
  return textos.filter(Boolean).join('\n');
}

function textoSuficiente(text, nomeColaborador) {
  const r = validarTextoCertificado(text, nomeColaborador);
  return !!(r.ok && r.nome && r.data_emissao);
}

function textoComNomeOficial(text, nomeColaborador) {
  const r = validarTextoCertificado(text, nomeColaborador);
  return !!(r.nome && (r.ok || !r.data_emissao));
}

async function extrairTextoArquivo(filePath, mime, nomeColaborador) {
  if (mime === 'application/pdf') {
    const buffer = fs.readFileSync(filePath);
    const bruto = extrairTextoPdfBruto(buffer);
    let pdfText = '';
    try {
      pdfText = await extrairTextoPdf(buffer);
    } catch (err) {
      console.warn('[nsc] falha ao ler texto do PDF:', err.message);
    }
    const combinado = [pdfText, bruto].filter(Boolean).join('\n');
    if (textoSuficiente(combinado, nomeColaborador) || textoComNomeOficial(combinado, nomeColaborador)) {
      return combinado;
    }

    const ocrs = [];
    try {
      const imagens = await imagensDoPdf(buffer);
      for (const img of imagens.slice(0, 2)) {
        const ocr = await ocrImagem(await preprocessImage(img), combinado, nomeColaborador);
        ocrs.push(ocr);
        const merged = [combinado, ...ocrs].filter(Boolean).join('\n');
        if (textoSuficiente(merged, nomeColaborador)) return merged;
      }
    } catch (err) {
      console.warn('[nsc] falha ao OCR imagens do PDF:', err.message);
    }

    const final = [combinado, ...ocrs].filter(Boolean).join('\n');
    if (final) return final;
    throw httpError(400, 'Não foi possível ler o certificado. Envie o PDF ou a imagem oficial.');
  }

  const raw = fs.readFileSync(filePath);
  const png = await preprocessImage(raw);
  return ocrImagem(png, '', nomeColaborador);
}

function caminhoCacheMiniatura(filePath) {
  return `${String(filePath).replace(/\.[^.]+$/, '')}.thumb.jpg`;
}

async function gerarMiniaturaBuffer(filePath, mime) {
  if (mime === 'application/pdf' || /\.pdf$/i.test(filePath)) {
    const imagens = await imagensDoPdf(fs.readFileSync(filePath));
    if (!imagens.length) {
      throw httpError(400, 'Não foi possível gerar a miniatura do certificado.');
    }
    return sharp(imagens[0])
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
  }

  return sharp(filePath)
    .rotate()
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
}

async function obterMiniatura(filePath, mime) {
  const cachePath = caminhoCacheMiniatura(filePath);
  try {
    if (fs.existsSync(cachePath)) {
      const origem = fs.statSync(filePath);
      const cache = fs.statSync(cachePath);
      if (cache.mtimeMs >= origem.mtimeMs && cache.size > 200) {
        return cachePath;
      }
    }
  } catch {
    /* regenera */
  }

  const buf = await gerarMiniaturaBuffer(filePath, mime);
  try {
    fs.writeFileSync(cachePath, buf);
    return cachePath;
  } catch {
    const tmp = path.join(os.tmpdir(), `nsc-thumb-${Date.now()}.jpg`);
    fs.writeFileSync(tmp, buf);
    return tmp;
  }
}

async function lerCertificado(filePath, mime, nomeColaborador) {
  let texto;
  try {
    texto = await extrairTextoArquivo(filePath, mime, nomeColaborador);
  } catch (err) {
    if (err.status) throw err;
    console.error('[nsc] falha ao ler certificado:', err.message);
    throw httpError(400, 'Não foi possível ler o certificado. Envie o PDF ou a imagem oficial.');
  }

  const resultado = validarTextoCertificado(texto, nomeColaborador);
  if (!resultado.ok && resultado.nome && !resultado.data_emissao) {
    return {
      nome_lido: resultado.nome,
      data_emissao: null,
      nome_confere: !!resultado.nome_confere,
      texto,
      data_pendente: true,
    };
  }
  if (!resultado.ok) {
    console.warn(
      '[nsc] certificado recusado:',
      resultado.erro,
      '| texto=',
      String(texto || '')
        .replace(/\s+/g, ' ')
        .slice(0, 500)
    );
    throw httpError(400, resultado.erro);
  }
  return {
    nome_lido: resultado.nome,
    data_emissao: resultado.data_emissao,
    nome_confere: !!resultado.nome_confere,
    texto,
  };
}

module.exports = {
  lerCertificado,
  extrairTextoArquivo,
  obterMiniatura,
  TESSDATA_DIR,
};
