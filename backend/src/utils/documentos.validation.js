const path = require('path');
const { env } = require('../config/env');

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'zip', 'eps', 'otf'];

const EXT_TO_MIMES = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  zip: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  eps: [
    'application/postscript',
    'application/eps',
    'application/x-eps',
    'image/eps',
    'image/x-eps',
    'application/octet-stream',
  ],
  otf: [
    'font/otf',
    'font/opentype',
    'application/font-sfnt',
    'application/x-font-otf',
    'application/vnd.ms-opentype',
    'application/octet-stream',
  ],
};

const PREVIEWABLE_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

function getExtension(filename) {
  const ext = path.extname(filename || '').slice(1).toLowerCase();
  return ext === 'jpeg' ? 'jpeg' : ext;
}

function isAllowedExtension(ext) {
  return ALLOWED_EXTENSIONS.includes(ext);
}

function isAllowedMime(ext, mime) {
  const allowed = EXT_TO_MIMES[ext];
  if (!allowed) return false;
  return allowed.includes(mime);
}

function validateUploadFile(file) {
  if (!file || !file.originalname) {
    return { ok: false, mensagem: 'Arquivo é obrigatório.' };
  }
  const ext = getExtension(file.originalname);
  if (!isAllowedExtension(ext)) {
    return { ok: false, mensagem: 'Tipo de arquivo não permitido.' };
  }
  if (!isAllowedMime(ext, file.mimetype)) {
    return { ok: false, mensagem: 'Tipo MIME não corresponde à extensão do arquivo.' };
  }
  return { ok: true, ext };
}

function isPreviewable(mime) {
  return PREVIEWABLE_MIMES.has(mime);
}

function resolveStoragePath(arquivoPath) {
  const storageDir = path.resolve(env.storageDir);
  const base = path.basename(arquivoPath);
  const resolved = path.resolve(storageDir, base);
  if (!resolved.startsWith(storageDir + path.sep) && resolved !== storageDir) {
    throw new Error('Caminho de arquivo inválido.');
  }
  return resolved;
}

function sanitizeFilename(name) {
  return (name || 'documento').replace(/[^\w\s.\-()]/g, '_');
}

module.exports = {
  ALLOWED_EXTENSIONS,
  EXT_TO_MIMES,
  getExtension,
  isAllowedExtension,
  isAllowedMime,
  validateUploadFile,
  isPreviewable,
  resolveStoragePath,
  sanitizeFilename,
};
