const express = require('express');
const { z } = require('zod');
const { query } = require('../db');

const router = express.Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (use HH:MM)');

const blockSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema.optional().nullable(),
  label: z.string().trim().min(1),
  icon: z.string().trim().optional(),
  categoryId: z.coerce.number().int().optional().nullable(),
  weekOfMonth: z.coerce.number().int().min(1).max(4).optional().nullable(),
});

const updateBlockSchema = blockSchema.partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar' });

const checkSchema = z.object({
  routineBlockId: z.coerce.number().int(),
  date: dateSchema,
  done: z.boolean(),
});

function mapBlock(row) {
  return {
    id: row.id,
    weekday: row.weekday,
    startTime: row.start_time?.slice(0, 5),
    endTime: row.end_time ? row.end_time.slice(0, 5) : null,
    label: row.label,
    icon: row.icon,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    categoryColor: row.category_color || null,
    sortOrder: row.sort_order,
    weekOfMonth: row.week_of_month,
  };
}

function weekOfMonthFromDate(dateIso) {
  const day = Number(dateIso.slice(8, 10));
  return Math.min(4, Math.ceil(day / 7));
}

router.get('/blocks', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT rb.*, c.name AS category_name, c.color AS category_color
       FROM routine_blocks rb
       LEFT JOIN categories c ON c.id = rb.category_id
       WHERE rb.user_id = $1
       ORDER BY rb.weekday ASC, rb.sort_order ASC, rb.start_time ASC`,
      [req.user.id]
    );
    res.json(rows.map(mapBlock));
  } catch (err) {
    next(err);
  }
});

router.post('/blocks', async (req, res, next) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const { weekday, startTime, endTime, label, icon, categoryId, weekOfMonth } = parsed.data;
    const { rows: maxOrder } = await query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM routine_blocks WHERE weekday = $1 AND user_id = $2',
      [weekday, req.user.id]
    );
    const { rows } = await query(
      `INSERT INTO routine_blocks (weekday, start_time, end_time, label, icon, category_id, sort_order, week_of_month, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [weekday, startTime, endTime || null, label, icon || null, categoryId || null, maxOrder[0].next, weekOfMonth || null, req.user.id]
    );
    res.status(201).json(mapBlock(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.put('/blocks/:id', async (req, res, next) => {
  const parsed = updateBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const data = parsed.data;
    const fields = [];
    const params = [];
    let i = 1;
    if (data.weekday !== undefined) { fields.push(`weekday = $${i++}`); params.push(data.weekday); }
    if (data.startTime !== undefined) { fields.push(`start_time = $${i++}`); params.push(data.startTime); }
    if (data.endTime !== undefined) { fields.push(`end_time = $${i++}`); params.push(data.endTime); }
    if (data.label !== undefined) { fields.push(`label = $${i++}`); params.push(data.label); }
    if (data.icon !== undefined) { fields.push(`icon = $${i++}`); params.push(data.icon); }
    if (data.categoryId !== undefined) { fields.push(`category_id = $${i++}`); params.push(data.categoryId); }
    if (data.weekOfMonth !== undefined) { fields.push(`week_of_month = $${i++}`); params.push(data.weekOfMonth); }
    params.push(req.params.id, req.user.id);

    const { rows } = await query(
      `UPDATE routine_blocks SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ message: 'Bloco não encontrado' });
    res.json(mapBlock(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/blocks/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM routine_blocks WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Bloco não encontrado' });
    res.json({ message: 'Bloco removido' });
  } catch (err) {
    next(err);
  }
});

router.get('/day', async (req, res, next) => {
  const parsed = dateSchema.safeParse(req.query.date);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Informe ?date=AAAA-MM-DD' });
  }
  try {
    const date = parsed.data;
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const week = weekOfMonthFromDate(date);
    const { rows } = await query(
      `SELECT rb.*, c.name AS category_name, c.color AS category_color, rc.done AS checked_done
       FROM routine_blocks rb
       LEFT JOIN categories c ON c.id = rb.category_id
       LEFT JOIN routine_checks rc ON rc.routine_block_id = rb.id AND rc.check_date = $1
       WHERE rb.weekday = $2 AND (rb.week_of_month = $3 OR rb.week_of_month IS NULL) AND rb.user_id = $4
       ORDER BY rb.sort_order ASC, rb.start_time ASC`,
      [date, weekday, week, req.user.id]
    );
    // Se existir override específico para essa semana, ele substitui o padrão (não soma).
    const specific = rows.filter((row) => row.week_of_month === week);
    const resolved = specific.length ? specific : rows.filter((row) => row.week_of_month === null);
    res.json(resolved.map((row) => ({ ...mapBlock(row), date, done: row.checked_done === true })));
  } catch (err) {
    next(err);
  }
});

router.post('/checks', async (req, res, next) => {
  const parsed = checkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const { routineBlockId, date, done } = parsed.data;
    const { rows: owned } = await query(
      `SELECT id FROM routine_blocks WHERE id = $1 AND user_id = $2`,
      [routineBlockId, req.user.id]
    );
    if (!owned[0]) return res.status(404).json({ message: 'Bloco não encontrado' });
    const { rows } = await query(
      `INSERT INTO routine_checks (routine_block_id, check_date, done)
       VALUES ($1,$2,$3)
       ON CONFLICT (routine_block_id, check_date) DO UPDATE SET done = EXCLUDED.done
       RETURNING *`,
      [routineBlockId, date, done]
    );
    res.json({ routineBlockId: rows[0].routine_block_id, date: rows[0].check_date, done: rows[0].done });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
