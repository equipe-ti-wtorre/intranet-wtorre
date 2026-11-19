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

// Nota minha ou compartilhada comigo ($1 = meu id).
const CAN_SEE = `(n.user_id = $1 OR EXISTS (SELECT 1 FROM personal_note_members m WHERE m.note_id = n.id AND m.user_id = $1))`;

function mapNote(row, extra = {}, meId) {
  const mine = (extra.members || []).find((m) => m.id === meId);
  return {
    my_role: meId == null || row.user_id === meId ? 'owner' : (mine ? mine.role : 'leitor'),
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    color: row.color || 'none',
    pinned: row.pinned,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_owner: meId == null ? true : row.user_id === meId,
    owner: row.owner_name ? { id: row.user_id, name: row.owner_name } : null,
    members: extra.members || [],
    files: extra.files || [],
  };
}

async function loadNotes(meId, onlyId) {
  const { rows } = await query(
    `SELECT n.*, ou.name AS owner_name FROM personal_notes n
       JOIN users ou ON ou.id = n.user_id
      WHERE ${CAN_SEE} ${onlyId ? 'AND n.id = $2' : ''}
      ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC`,
    onlyId ? [meId, onlyId] : [meId]
  );
  if (!rows.length) return [];
  const files = new Map();
  const members = new Map();
  const { rows: fr } = await query(
    `SELECT f.id, f.note_id, f.name, f.mime, f.size_bytes, f.created_at, f.uploaded_by, u.name AS uploader_name
       FROM personal_note_files f
       JOIN personal_notes n ON n.id = f.note_id
       LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE ${CAN_SEE} ORDER BY f.id`,
    [meId]
  );
  for (const f of fr) {
    if (!files.has(f.note_id)) files.set(f.note_id, []);
    files.get(f.note_id).push(formatFile(f));
  }
  const { rows: mr } = await query(
    `SELECT m.note_id, u.id, u.name, m.role FROM personal_note_members m
       JOIN personal_notes n ON n.id = m.note_id
       JOIN users u ON u.id = m.user_id
      WHERE ${CAN_SEE} ORDER BY u.name`,
    [meId]
  );
  for (const m of mr) {
    if (!members.has(m.note_id)) members.set(m.note_id, []);
    members.get(m.note_id).push({ id: m.id, name: m.name, role: m.role === 'leitor' ? 'leitor' : 'editor' });
  }
  return rows.map((r) => mapNote(r, { files: files.get(r.id) || [], members: members.get(r.id) || [] }, meId));
}

// Nota que posso ver (dona ou membro). Devolve { id, isOwner, canEdit }.
async function accessNote(req, { edit = false } = {}) {
  const id = intParam(req.params.id);
  const { rows: [n] } = await query(
    `SELECT n.id, n.user_id,
            (SELECT m.role FROM personal_note_members m WHERE m.note_id = n.id AND m.user_id = $1) AS my_role
       FROM personal_notes n WHERE n.id = $2 AND ${CAN_SEE}`,
    [req.user.id, id]
  );
  if (!n) throw new HttpError(404, 'Nota não encontrada');
  const isOwner = n.user_id === req.user.id;
  const canEdit = isOwner || n.my_role !== 'leitor';
  if (edit && !canEdit) throw new HttpError(403, 'Você tem acesso somente leitura a esta nota.');
  return { id, isOwner, canEdit };
}

router.get('/', ah(async (req, res) => {
  res.json(await loadNotes(req.user.id));
}));

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
    const [note] = await loadNotes(req.user.id, rows[0].id);
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', ah(async (req, res) => {
  const parsed = noteSchema.safeParse(req.body || {});
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || 'Dados inválidos');
  const { id } = await accessNote(req, { edit: true });
  const data = parsed.data;
  const fields = [];
  const params = [];
  let i = 1;
  if (data.title !== undefined) { fields.push(`title = $${i++}`); params.push(data.title.trim()); }
  if (data.body !== undefined) { fields.push(`body = $${i++}`); params.push(data.body); }
  if (data.color !== undefined) { fields.push(`color = $${i++}`); params.push(data.color); }
  if (data.pinned !== undefined) { fields.push(`pinned = $${i++}`); params.push(data.pinned); }
  fields.push('updated_at = NOW()');
  params.push(id);
  await query(`UPDATE personal_notes SET ${fields.join(', ')} WHERE id = $${i}`, params);
  const [note] = await loadNotes(req.user.id, id);
  res.json(note);
}));

// Dono exclui a nota (e os arquivos); membro apenas sai dela.
router.delete('/:id', ah(async (req, res) => {
  const { id, isOwner } = await accessNote(req);
  if (!isOwner) {
    await query('DELETE FROM personal_note_members WHERE note_id = $1 AND user_id = $2', [id, req.user.id]);
    return res.json({ message: 'Você saiu da nota' });
  }
  const { rows: blobs } = await query('SELECT container, `blob` FROM personal_note_files WHERE note_id = $1', [id]);
  for (const b of blobs) {
    try { await blobService.removerBlob(b.container, b.blob); } catch { /* blob ausente não impede excluir */ }
  }
  await query('DELETE FROM personal_notes WHERE id = $1', [id]);
  res.json({ message: 'Nota removida' });
}));

// ---- Compartilhar com pessoas (qualquer equipe) -------------------------------
router.put('/:id/members', ah(async (req, res) => {
  const { id, isOwner } = await accessNote(req);
  if (!isOwner) throw new HttpError(403, 'Só quem criou a nota escolhe quem participa.');
  const parsed = z.object({
    members: z.array(z.object({ user_id: z.number().int().positive(), role: z.enum(['editor', 'leitor']) })).max(100),
  }).safeParse(req.body || {});
  if (!parsed.success) throw new HttpError(400, 'Lista de pessoas inválida');
  const seen = new Set();
  const valid = [];
  for (const m of parsed.data.members) {
    if (m.user_id === req.user.id || seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    const { rows: [u] } = await query('SELECT id FROM users WHERE id = $1 AND active IS DISTINCT FROM false', [m.user_id]);
    if (u) valid.push(m);
  }
  await query('DELETE FROM personal_note_members WHERE note_id = $1', [id]);
  for (const m of valid) {
    await query('INSERT INTO personal_note_members (note_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, m.user_id, m.role]);
  }
  const [note] = await loadNotes(req.user.id, id);
  res.json(note);
}));

// ---- Anexos da nota (qualquer tipo de arquivo) ----------------------------------
router.post(
  '/:id/files',
  uploadNoteFiles.array('files', 30),
  handleNoteFilesMulterError,
  ah(async (req, res) => {
    const incoming = Array.isArray(req.files) ? req.files : [];
    let id;
    try {
      ({ id } = await accessNote(req, { edit: true }));
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
  const { id } = await accessNote(req);
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
  const { id } = await accessNote(req, { edit: true });
  const fileId = intParam(req.params.fileId, 'fileId');
  const { rows: [row] } = await query(
    'SELECT container, `blob` FROM personal_note_files WHERE id = $1 AND note_id = $2',
    [fileId, id]
  );
  if (!row) throw new HttpError(404, 'Arquivo não encontrado.');
  try { await blobService.removerBlob(row.container, row.blob); } catch { /* já removido */ }
  await query('DELETE FROM personal_note_files WHERE id = $1', [fileId]);
  await query('UPDATE personal_notes SET updated_at = NOW() WHERE id = $1', [id]);
  res.json({ ok: true });
}));

module.exports = router;
