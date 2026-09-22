const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { env } = require('./env');

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function ensureCipaImagensDir() {
  const dir = env.cipaImagensDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o775 });
    return dir;
  }
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch {
    const err = new Error(
      `Sem permissão de escrita em ${dir}. Ajuste o dono para o usuário do PM2 (ex.: chown www:www).`
    );
    err.status = 500;
    throw err;
  }
  return dir;
}

function getExtension(name) {
  const ext = path.extname(name || '').toLowerCase();
  if (ext === '.jpeg') return '.jpg';
  return ext;
}

function mimeToExt(mime) {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.bin';
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    try {
      cb(null, ensureCipaImagensDir());
    } catch (err) {
      cb(err);
    }
  },
  filename(_req, file, cb) {
    const ext = getExtension(file.originalname) || mimeToExt(file.mimetype);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = getExtension(file.originalname);
  if (ext && !ALLOWED_EXT.has(ext) && ext !== '.jpeg') {
    return cb(new Error('A imagem deve ser JPEG, PNG ou WebP.'));
  }
  if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('A imagem deve ser JPEG, PNG ou WebP.'));
  }
  return cb(null, true);
}

const uploadCipaImagem = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.cipaUploadMaxMb * 1024 * 1024 },
});

function handleCipaMulterError(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        mensagem: `Arquivo excede o limite de ${env.cipaUploadMaxMb} MB.`,
      });
    }
    return res.status(400).json({ mensagem: err.message });
  }
  if (err) {
    return res.status(400).json({ mensagem: err.message });
  }
  return next();
}

function resolveCipaImagemPath(filename) {
  const dir = path.resolve(env.cipaImagensDir);
  const base = path.basename(filename || '');
  if (!base) {
    const err = new Error('Imagem inválida.');
    err.status = 400;
    throw err;
  }
  const resolved = path.resolve(dir, base);
  if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
    const err = new Error('Caminho de arquivo inválido.');
    err.status = 400;
    throw err;
  }
  return resolved;
}

function mimeFromFilename(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function removeCipaImagem(filename) {
  if (!filename) return;
  try {
    const full = resolveCipaImagemPath(filename);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

module.exports = {
  uploadCipaImagem,
  handleCipaMulterError,
  ensureCipaImagensDir,
  resolveCipaImagemPath,
  mimeFromFilename,
  removeCipaImagem,
  ALLOWED_MIME,
};
