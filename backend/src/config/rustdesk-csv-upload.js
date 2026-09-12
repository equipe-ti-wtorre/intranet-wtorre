const multer = require('multer');

const MAX_BYTES = 2 * 1024 * 1024;

const uploadRustdeskCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter(_req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (
      mime === 'text/csv' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'text/plain' ||
      mime === 'application/octet-stream' ||
      name.endsWith('.csv')
    ) {
      return cb(null, true);
    }
    return cb(new Error('Envie um arquivo .csv válido.'));
  },
});

function handleRustdeskCsvMulterError(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ mensagem: 'Arquivo excede o limite de 2 MB.' });
    }
    return res.status(400).json({ mensagem: err.message });
  }
  if (err) {
    return res.status(400).json({ mensagem: err.message || 'Erro no upload.' });
  }
  return next();
}

module.exports = { uploadRustdeskCsv, handleRustdeskCsvMulterError };
