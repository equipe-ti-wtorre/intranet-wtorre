const fs = require('fs');
const path = require('path');

// Anexos de tarefas e de projetos: mesmo formato de resposta e mesmo tratamento do arquivo enviado.
function formatFile(row) {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size_bytes: Number(row.size_bytes),
    created_at: row.created_at,
    uploaded_by: row.uploaded_by ? { id: row.uploaded_by, name: row.uploader_name } : null,
  };
}

function safeOriginalName(name) {
  const base = path.basename(String(name || 'arquivo')).replace(/[\r\n]/g, '').trim();
  return base.slice(0, 180) || 'arquivo';
}

function unlinkQuiet(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

module.exports = { formatFile, safeOriginalName, unlinkQuiet };
