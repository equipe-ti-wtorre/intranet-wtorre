const express = require('express');
const { z } = require('zod');
const { query } = require('../db');

const router = express.Router();

const colors = ['none', 'yellow', 'blue', 'green', 'purple', 'orange', 'red'];

const noteSchema = z.object({
  title: z.string().max(300).optional(),
  body: z.string().max(20000).optional(),
  color: z.enum(colors).optional(),
  pinned: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar' });

function mapNote(row) {
  return {
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
    res.json(rows.map(mapNote));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = z.object({
    title: z.string().max(300).optional(),
    body: z.string().max(20000).optional(),
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

module.exports = router;
