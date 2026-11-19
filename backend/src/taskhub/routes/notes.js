const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { env } = require('../../config/env');
const blobService = require('../../services/blob.service');
const { ah, intParam, HttpError } = require('../lib/http');
const { uploadNoteFiles, handleNoteFilesMulterError, blobNameFor } = require('../../config/taskhub-files-upload');
const { formatFile, safeOriginalName, unlinkQuiet } = require('../lib/attachments');

const router = express.Router();

const colors = ['none', 'yellow', 'blue', 'green', 'purple', 'orange', 'red'];

const noteSchema = z.object({
  title: z.string().max(300).optional(),
  body: z.string().max(400000).optional(),
  color: z.enum(colors).optional(),
  pinned: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar' });

function mapNote(row, files = []) {
  return {
    files,
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    color: row.color || 'none',
    pinned: row.pinned,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM personal_notes WHERE user_id = $1
       ORDER BY pinned DESC, updated_at DESC, id DESC`,
      [req.user.id]
    );
    const byNote = new Map();
    if (rows.length) {
      const { rows: fr } = await query(
        `SELECT f.id, f.note_id, f.name, f.mime, f.size_bytes, f.created_at, f.uploaded_by, u.name AS uploader_name
           FROM personal_note_files f
           JOIN personal_notes n ON n.id = f.note_id
           LEFT JOIN users u ON u.id = f.uploaded_by
          WHERE n.user_id = $1 ORDER BY f.id`,
        [req.user.id]
      );
      for (const f of fr) {
        if (!byNote.has(f.note_id)) byNote.set(f.note_id, []);
        byNote.get(f.note_id).push(formatFile(f));
      }
    }
    res.json(rows.map((r) => mapNote(r, byNote.get(r.id) || [])));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = z.object({
    title: z.string().max(300).optional(),
    body: z.string().max(400000).optional(),
    color: z.enum(colors).optional(),
    pinned: z.boolean().optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const data = parsed.data;
    const { rows } = await query(
      `INSERT INTO personal_notes (user_id, title, body, color, pinned)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, (data.title || '').trim(), data.body || '', data.color || 'none', data.pinned || false]
    );
    res.status(201).json(mapNote(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  const parsed = noteSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const data = parsed.data;
    const fields = [];
    const params = [];
    let i = 1;
    if (data.title !== undefined) { fields.push(`title = $${i++}`); params.push(data.title.trim()); }
    if (data.body !== undefined) { fields.push(`body = $${i++}`); params.push(data.body); }
    if (data.color !== undefined) { fields.push(`color = $${i++}`); params.push(data.color); }
    if (data.pinned !== undefined) { fields.push(`pinned = $${i++}`); params.push(data.pinned); }
    fields.push('updated_at = NOW()');
    params.push(req.params.id, req.user.id);
    const { rows } = await query(
      `UPDATE personal_notes SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ message: 'Nota não encontrada' });
    res.json(mapNote(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: blobs } = await query(
      `SELECT f.container, f.\`blob\` FROM personal_note_files f
         JOIN personal_notes n ON n.id = f.note_id
        WHERE n.id = $1 AND n.user_id = $2`,
      [req.params.id, req.user.id]
    );
    for (const b of blobs) {
      try { await blobService.removerBlob(b.container, b.blob); } catch { /* blob ausente não impede excluir */ }
    }
    const { rows } = await query(
      'DELETE FROM personal_notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Nota não encontrada' });
    res.json({ message: 'Nota removida' });
  } catch (err) {
    next(err);
  }
});

// ---- Anexos da nota (qualquer tipo de arquivo) ----------------------------------
async function ownNote(req) {
  const id = intParam(req.params.id);
  const { rows: [n] } = await query('SELECT id FROM personal_notes WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!n) throw new HttpError(404, 'Nota não encontrada');
  return id;
}

router.post(
  '/:id/files',
  uploadNoteFiles.array('files', 30),
  handleNoteFilesMulterError,
  ah(async (req, res) => {
    const incoming = Array.isArray(req.files) ? req.files : [];
    let id;
    try {
      id = await ownNote(req);
      if (!incoming.length) throw new HttpError(400, 'Envie pelo menos um arquivo.');
    } catch (err) {
      incoming.forEach((f) => unlinkQuiet(f.path));
      throw err;
    }
    const container = await blobService.garantirContainer(env.taskhubContainer);
    const created = [];
    try {
      for (const file of incoming) {
        const blob = blobNameFor(file);
        await blobService.enviarArquivo(container, file.path, blob, file.mimetype);
        unlinkQuiet(file.path);
        const { rows: [row] } = await query(
          `INSERT INTO personal_note_files (note_id, uploaded_by, name, mime, size_bytes, container, \`blob\`)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name, mime, size_bytes, created_at, uploaded_by`,
          [id, req.user.id, safeOriginalName(file.originalname), file.mimetype || 'application/octet-stream', file.size, container, blob]
        );
        row.uploader_name = req.user.name;
        created.push(formatFile(row));
      }
      await query('UPDATE personal_notes SET updated_at = NOW() WHERE id = $1', [id]);
    } catch (err) {
      incoming.forEach((f) => unlinkQuiet(f.path));
      throw err;
    }
    res.status(201).json(created);
  })
);

router.get('/:id/files/:fileId', ah(async (req, res) => {
  const id = await ownNote(req);
  const fileId = intParam(req.params.fileId, 'fileId');
  const { rows: [row] } = await query(
    'SELECT name, mime, container, `blob` FROM personal_note_files WHERE id = $1 AND note_id = $2',
    [fileId, id]
  );
  if (!row) throw new HttpError(404, 'Arquivo não encontrado.');
  const downloaded = await blobService.baixarBuffer(row.container, row.blob);
  res.setHeader('Content-Type', downloaded.contentType || row.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', blobService.contentDispositionAttachment(row.name));
  res.send(downloaded.buffer);
}));

router.delete('/:id/files/:fileId', ah(async (req, res) => {
  const id = await ownNote(req);
  const fileId = intParam(req.params.fileId, 'fileId');
  const { rows: [row] } = await query(
    'SELECT container, `blob` FROM personal_note_files WHERE id = $1 AND note_id = $2',
    [fileId, id]
  );
  if (!row) throw new HttpError(404, 'Arquivo não encontrado.');
  try { await blobService.removerBlob(row.container, row.blob); } catch { /* já removido */ }
  await query('DELETE FROM personal_note_files WHERE id = $1', [fileId]);
  res.json({ ok: true });
}));

module.exports = router;
