const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { env } = require('./env');

const ANEXO_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function ensureTmpDir() {
  if (!fs.existsSync(env.pesquisasTmpDir)) {
    fs.mkdirSync(env.pesquisasTmpDir, { recursive: true });
  }
}

ensureTmpDir();

function getExtension(originalname) {
  const ext = path.extname(originalname || '').toLowerCase().replace(/^\./, '');
  return ext || 'bin';
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureTmpDir();
    cb(null, env.pesquisasTmpDir);
  },
  filename(_req, file, cb) {
    cb(null, `${crypto.randomUUID()}.${getExtension(file.originalname)}`);
  },
});

function fileFilter(_req, file, cb) {
  if (!ANEXO_MIMES.has(file.mimetype)) {
    return cb(new Error('Anexo deve ser imagem, PDF, Word ou Excel.'));
  }
  return cb(null, true);
}

const uploadPesquisas = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.pesquisasAnexoMaxMb * 1024 * 1024,
  },
});

const CAPA_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function capaFileFilter(_req, file, cb) {
  if (!CAPA_MIMES.has(file.mimetype)) {
    return cb(new Error('A capa deve ser uma imagem JPEG, PNG ou WebP.'));
  }
  return cb(null, true);
}

const uploadPesquisasCapa = multer({
  storage,
  fileFilter: capaFileFilter,
  limits: {
    fileSize: Math.min(env.pesquisasAnexoMaxMb, 8) * 1024 * 1024,
  },
});

function handlePesquisasMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        mensagem: 'Arquivo excede o limite de tamanho permitido.',
      });
    }
    return res.status(400).json({ mensagem: err.message });
  }
  if (err) {
    return res.status(400).json({ mensagem: err.message });
  }
  next();
}

module.exports = {
  uploadPesquisas,
  uploadPesquisasCapa,
  handlePesquisasMulterError,
  ANEXO_MIMES,
};
