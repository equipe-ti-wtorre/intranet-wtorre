const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { env } = require('./env');

function ensureTmpDir() {
  if (!fs.existsSync(env.taskhubTmpDir)) {
    fs.mkdirSync(env.taskhubTmpDir, { recursive: true });
  }
}

ensureTmpDir();

// Só uma extensão curta entra no caminho. O nome original fica no banco.
function safeExt(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '.bin';
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureTmpDir();
    cb(null, env.taskhubTmpDir);
  },
  filename(_req, file, cb) {
    cb(null, `${crypto.randomUUID()}${safeExt(file.originalname)}`);
  },
});

const uploadTaskFiles = multer({
  storage,
  limits: {
    fileSize: env.taskhubAnexoMaxMb * 1024 * 1024,
    files: env.taskhubAnexoMaxFiles,
  },
});

function handleTaskFilesMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: `Cada arquivo pode ter até ${env.taskhubAnexoMaxMb} MB.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: `Envie no máximo ${env.taskhubAnexoMaxFiles} arquivos.`,
      });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
}

function blobNameFor(file) {
  return `${crypto.randomUUID()}${safeExt(file.originalname)}`;
}

module.exports = {
  uploadTaskFiles,
  handleTaskFilesMulterError,
  blobNameFor,
};
