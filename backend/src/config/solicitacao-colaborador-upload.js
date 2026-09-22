const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { env } = require('./env');

const FOTO_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const BOAS_VINDAS_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);
const CREDENCIAL_VEICULO_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function ensureTmpDir() {
  if (!fs.existsSync(env.solicitacaoColaboradorTmpDir)) {
    fs.mkdirSync(env.solicitacaoColaboradorTmpDir, { recursive: true });
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
    cb(null, env.solicitacaoColaboradorTmpDir);
  },
  filename(_req, file, cb) {
    cb(null, `${crypto.randomUUID()}.${getExtension(file.originalname)}`);
  },
});

function fileFilter(_req, file, cb) {
  const field = file.fieldname;
  if (field === 'foto') {
    if (!FOTO_MIMES.has(file.mimetype)) {
      return cb(new Error('Foto deve ser JPEG, PNG ou WebP.'));
    }
    return cb(null, true);
  }
  if (field === 'boas_vindas') {
    if (!BOAS_VINDAS_MIMES.has(file.mimetype)) {
      return cb(new Error('Boas-vindas deve ser imagem, PDF, Word ou TXT.'));
    }
    return cb(null, true);
  }
  if (field === 'credencial_veiculo') {
    if (!CREDENCIAL_VEICULO_MIMES.has(file.mimetype)) {
      return cb(new Error('Credencial do veículo deve ser imagem ou PDF.'));
    }
    return cb(null, true);
  }
  return cb(new Error('Campo de upload inválido.'));
}

const uploadSolicitacao = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.max(
      env.solicitacaoColaboradorFotoMaxMb,
      env.solicitacaoColaboradorArquivoMaxMb
    ) * 1024 * 1024,
  },
});

function handleSolicitacaoMulterError(err, req, res, next) {
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
  uploadSolicitacao,
  handleSolicitacaoMulterError,
  FOTO_MIMES,
  BOAS_VINDAS_MIMES,
  CREDENCIAL_VEICULO_MIMES,
};
