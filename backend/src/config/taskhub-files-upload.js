const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { env } = require('./env');

const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.zip',
]);

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
]);

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
};

function ensureTmpDir() {
  if (!fs.existsSync(env.taskhubTmpDir)) {
    fs.mkdirSync(env.taskhubTmpDir, { recursive: true });
  }
}

ensureTmpDir();

function getExtension(originalname) {
  return path.extname(originalname || '').toLowerCase();
}

function fileFilter(_req, file, cb) {
  const ext = getExtension(file.originalname);
  const mime = (file.mimetype || '').toLowerCase();
  const extOk = ALLOWED_EXT.has(ext);
  const mimeOk = ALLOWED_MIME.has(mime);
  const octetOk = mime === 'application/octet-stream' && extOk;
  if (!extOk && !mimeOk) {
    return cb(new Error('Tipo não permitido. Use imagem, PDF, Word, Excel, PowerPoint, texto ou zip.'));
  }
  if (ext && !extOk) {
    return cb(new Error('Tipo não permitido. Use imagem, PDF, Word, Excel, PowerPoint, texto ou zip.'));
  }
  if (mime && !mimeOk && !octetOk) {
    return cb(new Error('Tipo não permitido. Use imagem, PDF, Word, Excel, PowerPoint, texto ou zip.'));
  }
  return cb(null, true);
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureTmpDir();
    cb(null, env.taskhubTmpDir);
  },
  filename(_req, file, cb) {
    const ext = getExtension(file.originalname) || MIME_EXT[file.mimetype] || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadTaskFiles = multer({
  storage,
  fileFilter,
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
  const ext = getExtension(file.originalname);
  if (ext && ALLOWED_EXT.has(ext)) {
    return `${crypto.randomUUID()}${ext}`;
  }
  return `${crypto.randomUUID()}${MIME_EXT[file.mimetype] || '.bin'}`;
}

module.exports = {
  uploadTaskFiles,
  handleTaskFilesMulterError,
  ALLOWED_EXT,
  ALLOWED_MIME,
  MIME_EXT,
  blobNameFor,
};
