const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { nextOccurrence } = require('../lib/dates');

const router = express.Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (use HH:MM)');
const repeatSchema = z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']);

const reminderSchema = z.object({
  date: dateSchema,
  time: timeSchema,
  title: z.string().trim().min(1).max(300),
  done: z.boolean().optional(),
  notified: z.boolean().optional(),
  repeat: repeatSchema.optional(),
});

const updateReminderSchema = reminderSchema.partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'Informe ao menos um campo para atualizar' });

function mapReminder(row) {
  return {
    id: row.id,
    date: row.reminder_date,
    time: row.reminder_time?.slice(0, 5),
    title: row.title,
    done: row.done,
    repeat: row.repeat || 'none',
    notified: row.notified,
    createdAt: row.created_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { date, from, to } = req.query;
    const conditions = [`user_id = $1`];
    const params = [req.user.id];
    let i = 2;

    if (date) { conditions.push(`reminder_date = $${i++}`); params.push(date); }
    if (from) { conditions.push(`reminder_date >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`reminder_date <= $${i++}`); params.push(to); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await query(
      `SELECT * FROM reminders ${where} ORDER BY reminder_date ASC, reminder_time ASC`,
      params
    );
    res.json(rows.map(mapReminder));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const { date, time, title, repeat } = parsed.data;
    const { rows } = await query(
      `INSERT INTO reminders (reminder_date, reminder_time, title, user_id, repeat) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [date, time, title, req.user.id, repeat || 'none']
    );
    res.status(201).json(mapReminder(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  const parsed = updateReminderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Dados inválidos' });
  }
  try {
    const data = parsed.data;
    if (data.done === true) {
      const { rows: cur } = await query(
        'SELECT * FROM reminders WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (!cur[0]) return res.status(404).json({ message: 'Lembrete não encontrado' });
      if (cur[0].repeat && cur[0].repeat !== 'none') {
        const nextDate = nextOccurrence(cur[0].reminder_date, cur[0].repeat);
        const { rows } = await query(
          `UPDATE reminders SET reminder_date = $1, done = false, notified = false
           WHERE id = $2 AND user_id = $3 RETURNING *`,
          [nextDate, req.params.id, req.user.id]
        );
        return res.json(mapReminder(rows[0]));
      }
    }
    const fields = [];
    const params = [];
    let i = 1;
    if (data.date !== undefined) { fields.push(`reminder_date = $${i++}`); params.push(data.date); }
    if (data.time !== undefined) { fields.push(`reminder_time = $${i++}`); params.push(data.time); }
    if (data.title !== undefined) { fields.push(`title = $${i++}`); params.push(data.title); }
    if (data.repeat !== undefined) { fields.push(`repeat = $${i++}`); params.push(data.repeat); }
    if (data.done !== undefined) { fields.push(`done = $${i++}`); params.push(data.done); }
    if (data.notified !== undefined) { fields.push(`notified = $${i++}`); params.push(data.notified); }
    else if (data.date !== undefined || data.time !== undefined) { fields.push('notified = false'); }
    params.push(req.params.id, req.user.id);

    const { rows } = await query(
      `UPDATE reminders SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ message: 'Lembrete não encontrado' });
    res.json(mapReminder(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Lembrete não encontrado' });
    res.json({ message: 'Lembrete removido' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
