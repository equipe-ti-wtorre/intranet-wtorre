const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { env } = require('./env');

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);

function ensureTmpDir() {
  const dir = path.join(env.nscCertificadosDir, 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getExtension(originalname) {
  const ext = path.extname(originalname || '').toLowerCase().replace(/^\./, '');
  if (ext === 'jpeg') return 'jpg';
  return ext || 'bin';
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, ensureTmpDir());
  },
  filename(_req, file, cb) {
    cb(null, `${crypto.randomUUID()}.${getExtension(file.originalname)}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    return cb(new Error('O certificado deve ser PDF, JPG ou PNG.'));
  }
  return cb(null, true);
}

const uploadNsc = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.nscUploadMaxMb * 1024 * 1024 },
});

function handleNscMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        mensagem: `Arquivo excede o limite de ${env.nscUploadMaxMb} MB.`,
      });
    }
    return res.status(400).json({ mensagem: err.message });
  }
  if (err) {
    return res.status(400).json({ mensagem: err.message });
  }
  next();
}

function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}

function mimeToExt(mime) {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'bin';
}

function sanitizeFilename(name) {
  return (name || 'certificado').replace(/[^\w\s.\-()]/g, '_').slice(0, 180);
}

function resolveNscPath(arquivoPath) {
  const storageDir = path.resolve(env.nscCertificadosDir);
  const base = path.basename(arquivoPath || '');
  const resolved = path.resolve(storageDir, base);
  if (!resolved.startsWith(storageDir + path.sep) && resolved !== storageDir) {
    const err = new Error('Caminho de arquivo inválido.');
    err.status = 400;
    throw err;
  }
  return resolved;
}

function ensureNscDir() {
  fs.mkdirSync(env.nscCertificadosDir, { recursive: true });
}

module.exports = {
  uploadNsc,
  handleNscMulterError,
  detectMimeFromBuffer,
  mimeToExt,
  sanitizeFilename,
  resolveNscPath,
  ensureNscDir,
  ALLOWED_MIMES,
  getExtension,
};
